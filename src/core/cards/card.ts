import { CardStatus, folderForStatus } from './status';

/**
 * The card (a PRD file) — the unit of work in the queue.
 *
 * Spec: 14-data-model.md §2. All fields are readonly: transforms return NEW cards
 * (coding-style: immutability) so a claim or status change never mutates in place.
 */

export interface ValidationCriterion {
  readonly text: string;
  readonly done: boolean;
}

export interface Card {
  readonly id: string;
  readonly title: string;
  readonly project: string;
  readonly status: CardStatus;
  /** agent id once claimed; null while in the inbox. */
  readonly owner: string | null;
  /** feature branch once claimed; null while unclaimed. */
  readonly branch: string | null;
  readonly priority: number;
  /** ISO date the card was created. */
  readonly created: string;
  /** ISO timestamp of the last status change — the LWW key (14 §2.1). */
  readonly updated: string | null;
  /** claude | codex | gemini; null means "use the config default" (12 §3.3). */
  readonly engine: string | null;
  /** the acceptance contract the validator checks per-criterion (25 §3). */
  readonly validationCriteria: readonly ValidationCriterion[];
  /** markdown body after the frontmatter. */
  readonly body: string;
}

/** A card whose frontmatter status disagrees with the folder it physically sits in. */
export interface StatusMismatch {
  readonly id: string;
  readonly frontmatterStatus: CardStatus;
  readonly folderStatus: CardStatus;
  /** where the file SHOULD be, per the source-of-truth frontmatter. */
  readonly expectedFolder: string;
}

/** Returns a new card with the given status + an `updated` stamp (immutable). */
export function withStatus(card: Card, status: CardStatus, now: string): Card {
  return { ...card, status, updated: now };
}

/**
 * Claim transform: assign owner + branch and move to `in-progress` — the pure heart
 * of the claim CAS (11 §4), with no git I/O. Returns a new card.
 */
export function claimCard(card: Card, owner: string, branch: string, now: string): Card {
  return { ...card, status: 'in-progress', owner, branch, updated: now };
}

/** Release transform: a lost claim or bounce returns the card to the inbox, unowned. */
export function releaseCard(card: Card, now: string): Card {
  return { ...card, status: 'ready', owner: null, branch: null, updated: now };
}

/**
 * Status invariant (14 §2.1): the frontmatter wins. Given the folder a card was
 * found in, report a mismatch (so the reconciler can `git mv` it to the right place)
 * or null when they already agree.
 */
export function detectStatusMismatch(card: Card, folderStatus: CardStatus): StatusMismatch | null {
  if (card.status === folderStatus) {
    return null;
  }
  return {
    id: card.id,
    frontmatterStatus: card.status,
    folderStatus,
    expectedFolder: folderForStatus(card.status),
  };
}

/**
 * Last-write-wins reconciliation (14 §2.1): when two copies of the same card diverge
 * (e.g. an offline worker), the newer `updated` wins; ties break on a stable key (id)
 * so the result is deterministic. A missing `updated` sorts oldest.
 */
export function resolveByLww(a: Card, b: Card): Card {
  if (a.id !== b.id) {
    throw new Error(`resolveByLww: cards have different ids (${a.id} vs ${b.id})`);
  }
  const ta = a.updated ?? '';
  const tb = b.updated ?? '';
  if (ta > tb) {
    return a;
  }
  if (tb > ta) {
    return b;
  }
  return a; // identical timestamps → deterministic tie-break (same id, keep first)
}
