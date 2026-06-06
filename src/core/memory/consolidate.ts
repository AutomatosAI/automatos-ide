import { FileStore } from '../../fs/fileStore';
import { Note, notePath, readAgentNotes } from './notes';

/**
 * Memory consolidation — folding an agent's cold notes into one digest (23 §3).
 *
 * Notes accumulate; recall slows and the signal drowns. Consolidation keeps the most
 * recent notes as the live working set and folds the older ones into a single digest
 * note, then the originals are removed. What is OURS and deterministic: the trigger,
 * the selection, and a plain timeline digest. The *semantic* merge — actually distilling
 * many notes into wisdom — is the agent's job; this just gives it a tidy starting point.
 * Pure: {@link planConsolidation} computes a plan; the caller writes the digest and
 * `git rm`s the archived files.
 */

/** Recent notes left untouched as the live working set when folding the rest. */
export const DEFAULT_KEEP_RECENT = 5;

/** Marker tag stamped on every digest so a consolidated note is distinguishable. */
export const DIGEST_TAG = 'consolidated';

export interface DigestContext {
  /** ISO timestamp the digest is written at — its sort key and filename seed. */
  readonly now: string;
}

export interface ConsolidationPlan {
  readonly agent: string;
  /** The new note to write (folds the archived notes' bodies into a timeline). */
  readonly digest: Note;
  /** Paths of the original note files the caller should `git rm`. */
  readonly archivedPaths: readonly string[];
  /** How many recent notes were left in place. */
  readonly keptCount: number;
}

/**
 * Should consolidation run now? Driven by board throughput (config
 * `consolidateEveryCards`): once that many cards have finished since the last run.
 * A null or non-positive threshold disables consolidation entirely.
 */
export function shouldConsolidate(
  cardsDoneSinceLast: number,
  everyCards: number | null,
): boolean {
  if (everyCards === null || everyCards <= 0) {
    return false;
  }
  return cardsDoneSinceLast >= everyCards;
}

export interface NoteSelection {
  /** The recent notes kept in place, newest first. */
  readonly keep: readonly Note[];
  /** The older notes to fold into a digest, newest first. */
  readonly fold: readonly Note[];
}

/** Split notes into the recent set to keep and the older set to fold (newest first). */
export function selectForConsolidation(
  notes: readonly Note[],
  keepRecent: number = DEFAULT_KEEP_RECENT,
): NoteSelection {
  const newestFirst = [...notes].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { keep: newestFirst.slice(0, keepRecent), fold: newestFirst.slice(keepRecent) };
}

/** Build a deterministic timeline digest from the folded notes (oldest first). */
export function buildDigest(agent: string, fold: readonly Note[], ctx: DigestContext): Note {
  const oldestFirst = [...fold].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const span = `${oldestFirst[0].at} … ${oldestFirst[oldestFirst.length - 1].at}`;
  const entries = oldestFirst.map((n) => `### ${n.at}\n${n.text.trim()}`);
  const text = [`Consolidated ${oldestFirst.length} notes (${span}).`, ...entries].join('\n\n');
  return { agent, at: ctx.now, tags: digestTags(fold), text };
}

/**
 * Plan the consolidation of one agent's notes, or `null` when there is nothing worth
 * folding (fewer than two cold notes — a digest of one is just a rename).
 */
export function planConsolidation(
  agent: string,
  notes: readonly Note[],
  ctx: DigestContext,
  keepRecent: number = DEFAULT_KEEP_RECENT,
): ConsolidationPlan | null {
  const { keep, fold } = selectForConsolidation(notes, keepRecent);
  if (fold.length < 2) {
    return null;
  }
  const archivedPaths = unique(fold.map((n) => notePath(n.agent, n.at)));
  return { agent, digest: buildDigest(agent, fold, ctx), archivedPaths, keptCount: keep.length };
}

/** Convenience: read one agent's notes and plan their consolidation. */
export async function planConsolidationFor(
  store: FileStore,
  agent: string,
  ctx: DigestContext,
  keepRecent: number = DEFAULT_KEEP_RECENT,
): Promise<ConsolidationPlan | null> {
  return planConsolidation(agent, await readAgentNotes(store, agent), ctx, keepRecent);
}

function digestTags(fold: readonly Note[]): readonly string[] {
  const union = unique(fold.flatMap((n) => n.tags)).sort();
  return [DIGEST_TAG, ...union.filter((t) => t !== DIGEST_TAG)];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
