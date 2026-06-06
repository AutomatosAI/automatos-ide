import { Card } from '../cards/card';

/**
 * The supervisor's launch decision (12 §3, Canopy model) — pure, so the I/O-heavy
 * spawn (git worktree add + a VS Code terminal per worker) stays a thin shell over it.
 *
 * Workers are ephemeral and claim their own card (the Ralph loop's first move), so the
 * supervisor only decides HOW MANY to launch and with WHICH engine. It launches at most
 * one worker per ready card, never exceeding the free slots left under `max_workers`
 * (the cap that subscription rate limits, not money, ultimately bound — 51 R-economics).
 * Each worker is pointed at the top ready card as its prompt; under contention it may
 * win a neighbour instead, which only renames its worktree, nothing more.
 */

export interface PlanInput {
  readonly maxWorkers: number;
  /** Non-stale workers currently running (from heartbeats). */
  readonly liveWorkers: number;
  /** Ready cards in claim order (highest priority first). */
  readonly readyCards: readonly Card[];
  readonly defaultEngine: string;
  /** Engines that passed preflight — a card needing any other engine is left to wait. */
  readonly usableEngines: readonly string[];
  /** Parent dir for per-worker worktrees, e.g. `../.worktrees`. */
  readonly worktreeRoot: string;
}

export interface PlannedWorker {
  readonly engine: string;
  /** The card handed to the worker as its prompt (and the one it should claim). */
  readonly promptCard: Card;
  readonly worktreePath: string;
  readonly branch: string;
}

export function freeSlots(maxWorkers: number, liveWorkers: number): number {
  return Math.max(0, maxWorkers - liveWorkers);
}

/** Resolve a card's engine: its own override, else the config default. */
export function engineForCard(card: Card, defaultEngine: string): string {
  return card.engine ?? defaultEngine;
}

export function worktreePathFor(root: string, cardId: string): string {
  return `${root}/${cardId}`;
}

export function branchForCard(cardId: string): string {
  return `feat/${cardId.toLowerCase()}`;
}

/**
 * Decide the workers to launch this cycle. Walks the ready queue in priority order,
 * skipping any card whose engine is not usable, and stops once the free slots are full.
 */
export function planWorkers(input: PlanInput): readonly PlannedWorker[] {
  const slots = freeSlots(input.maxWorkers, input.liveWorkers);
  const usable = new Set(input.usableEngines);
  const planned: PlannedWorker[] = [];
  for (const card of input.readyCards) {
    if (planned.length >= slots) {
      break;
    }
    const engine = engineForCard(card, input.defaultEngine);
    if (!usable.has(engine)) {
      continue;
    }
    planned.push({
      engine,
      promptCard: card,
      worktreePath: worktreePathFor(input.worktreeRoot, card.id),
      branch: branchForCard(card.id),
    });
  }
  return planned;
}
