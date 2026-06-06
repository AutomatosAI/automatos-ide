import { Card } from '../cards/card';

/**
 * AUTO's orchestration tick — the persistent overseer's once-per-cycle decision (21 §2).
 *
 * AUTO does not build; it keeps the board honest. Each tick it looks at the in-progress
 * cards and which workers are still beating (live owners), then decides two things,
 * purely:
 *   - reclaim: a card whose worker's heartbeat went stale — the (one-shot) worker died,
 *     so the card must go back to `ready` to be claimed afresh, or it is lost forever.
 *   - escalate: a card whose worker is alive but has sat in-progress past `stallLimit`
 *     cycles without finishing — likely stuck, so a human should look.
 * A per-card stall counter is carried across ticks in a {@link Ledger}; the caller
 * persists it and applies the {@link OrchestratorAction}s via git. All I/O stays outside.
 */

export interface LedgerEntry {
  readonly cardId: string;
  readonly owner: string | null;
  /** Consecutive ticks this card has stayed in-progress under the same owner. */
  readonly stallCycles: number;
}

export type Ledger = Readonly<Record<string, LedgerEntry>>;

export type OrchestratorAction =
  | { readonly kind: 'reclaim'; readonly cardId: string; readonly reason: string }
  | { readonly kind: 'escalate'; readonly cardId: string; readonly reason: string };

export interface TickInput {
  /** Cards currently in the in-progress column. */
  readonly inProgress: readonly Card[];
  /** Owners with a fresh (non-stale) heartbeat this tick. */
  readonly liveOwners: ReadonlySet<string>;
  /** The ledger from the previous tick (empty on first run). */
  readonly prevLedger: Ledger;
  /** Cycles a live worker may stay in-progress before AUTO escalates it. */
  readonly stallLimit: number;
}

export interface TickResult {
  readonly ledger: Ledger;
  readonly actions: readonly OrchestratorAction[];
}

export function tick(input: TickInput): TickResult {
  const ledger: Record<string, LedgerEntry> = {};
  const actions: OrchestratorAction[] = [];

  for (const card of input.inProgress) {
    const owner = card.owner;
    const live = owner !== null && input.liveOwners.has(owner);

    if (!live) {
      actions.push({
        kind: 'reclaim',
        cardId: card.id,
        reason: `worker ${owner ?? '(unowned)'} is not alive — reclaiming to ready`,
      });
      continue; // leaving in-progress, so it drops out of the new ledger
    }

    const prev = input.prevLedger[card.id];
    const continued = prev !== undefined && prev.owner === owner;
    const stallCycles = continued ? prev.stallCycles + 1 : 0;
    ledger[card.id] = { cardId: card.id, owner, stallCycles };

    if (stallCycles >= input.stallLimit) {
      actions.push({
        kind: 'escalate',
        cardId: card.id,
        reason: `in-progress for ${stallCycles} cycles without finishing — needs a look`,
      });
    }
  }

  return { ledger, actions };
}
