import { Card } from '../cards/card';
import { Heartbeat, ageMs, isStale } from './heartbeat';

/**
 * Join in-progress cards to their worker's latest heartbeat — AUTO's read-only liveness
 * view (21 §2). This is the SAFE half of the overseer: it reports who looks alive without
 * touching the board. The reclaim half (a stale worker's card → ready) is a destructive
 * git move and stays out until a heartbeat PRODUCER exists, so liveness is never inferred
 * from absence alone — a card with no beat reads as `no-beat` (unknown), NOT dead.
 */

export type LivenessState = 'live' | 'stale' | 'no-beat';

export interface WorkerLiveness {
  readonly cardId: string;
  readonly owner: string | null;
  readonly state: LivenessState;
  /** ms since the worker's last beat, or null when no beat was seen. */
  readonly sinceMs: number | null;
}

export function workerLiveness(
  inProgress: readonly Card[],
  beats: readonly Heartbeat[],
  now: string,
  thresholdMs: number,
): readonly WorkerLiveness[] {
  return inProgress.map((card) => {
    const beat = latestBeatFor(card.id, beats);
    if (!beat) {
      return { cardId: card.id, owner: card.owner, state: 'no-beat', sinceMs: null };
    }
    const since = ageMs(beat, now);
    return {
      cardId: card.id,
      owner: card.owner,
      state: isStale(beat, now, thresholdMs) ? 'stale' : 'live',
      sinceMs: Number.isFinite(since) ? since : null,
    };
  });
}

/** The newest beat that names this card, or undefined when none does. */
function latestBeatFor(cardId: string, beats: readonly Heartbeat[]): Heartbeat | undefined {
  let newest: Heartbeat | undefined;
  for (const beat of beats) {
    if (beat.card !== cardId) {
      continue;
    }
    if (!newest || Date.parse(beat.at) > Date.parse(newest.at)) {
      newest = beat;
    }
  }
  return newest;
}
