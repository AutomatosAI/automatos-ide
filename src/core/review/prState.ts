/**
 * A card's pull-request state, parsed from `gh pr view <branch> --json state,url`.
 *
 * GitHub reports a PR as OPEN, CLOSED, or MERGED. Only MERGED means the work landed, so
 * only MERGED may advance a card review→done. Anything we cannot parse — malformed JSON,
 * a missing field, an unfamiliar state — collapses to UNKNOWN/not-merged, so a `gh`
 * hiccup or an unauthenticated CLI never advances a card on a guess (fail-closed, not
 * fail-open). Pure string→struct: the host owns running `gh` and reading exit codes.
 */

export type PrLifecycle = 'OPEN' | 'CLOSED' | 'MERGED' | 'UNKNOWN';

export interface PrState {
  readonly state: PrLifecycle;
  readonly merged: boolean;
  readonly url: string | null;
}

export const UNKNOWN_PR: PrState = { state: 'UNKNOWN', merged: false, url: null };

export function parsePrState(stdout: string): PrState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return UNKNOWN_PR;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return UNKNOWN_PR;
  }
  const obj = parsed as { state?: unknown; url?: unknown };
  const state = normalizeState(obj.state);
  const url = typeof obj.url === 'string' && obj.url.length > 0 ? obj.url : null;
  return { state, merged: state === 'MERGED', url };
}

function normalizeState(value: unknown): PrLifecycle {
  if (typeof value !== 'string') {
    return 'UNKNOWN';
  }
  const upper = value.toUpperCase();
  return upper === 'OPEN' || upper === 'CLOSED' || upper === 'MERGED' ? upper : 'UNKNOWN';
}
