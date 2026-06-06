import { Card } from '../cards/card';
import { withStatus } from '../cards/card';

/**
 * The independent validator's verdict (25 §3, open decision 6.1).
 *
 * Verification is separate from the worker that built the card: a card in `review` is
 * only promoted to `done` when EVERY acceptance criterion is met AND the mechanical
 * gates (tests, optionally CI) are green. Anything short of that bounces the card back
 * to `ready` with the reasons recorded, so the next worker knows what to fix. The
 * per-criterion judgments come from the validator agent; this function only aggregates
 * them with the mechanical results into one auditable decision — pure and testable.
 */

export type Verdict = 'pass' | 'fail';

export interface CriterionResult {
  readonly text: string;
  readonly met: boolean;
}

export interface ValidationInput {
  readonly criteria: readonly CriterionResult[];
  /** Did the test suite pass? null means it was not run — which fails closed. */
  readonly testsPassed: boolean | null;
  /** CI result; only consulted when `requireCi` is set. null = unknown. */
  readonly ciPassed: boolean | null;
  readonly requireCi: boolean;
}

export interface ValidationOutcome {
  readonly verdict: Verdict;
  /** Why it failed, ready to record on the card. Empty on a pass. */
  readonly reasons: readonly string[];
}

/** Combine criterion judgments and mechanical gates into a pass/fail verdict. */
export function validate(input: ValidationInput): ValidationOutcome {
  const reasons: string[] = [];

  for (const c of input.criteria) {
    if (!c.met) {
      reasons.push(`criterion not met: ${c.text}`);
    }
  }
  if (input.testsPassed === false) {
    reasons.push('tests failed');
  } else if (input.testsPassed === null) {
    reasons.push('tests were not run — cannot verify');
  }
  if (input.requireCi) {
    if (input.ciPassed === false) {
      reasons.push('CI failed');
    } else if (input.ciPassed === null) {
      reasons.push('CI status unknown');
    }
  }

  return { verdict: reasons.length === 0 ? 'pass' : 'fail', reasons };
}

/**
 * Apply a verdict to a reviewed card: promote to `done`, or bounce to `ready` (unowned,
 * re-claimable) with a dated note appended so the next worker sees what failed.
 */
export function applyVerdict(card: Card, outcome: ValidationOutcome, now: string): Card {
  if (outcome.verdict === 'pass') {
    return withStatus(card, 'done', now);
  }
  const bounced = withStatus(card, 'ready', now);
  return {
    ...bounced,
    owner: null,
    branch: null,
    body: appendFailureNote(card.body, outcome.reasons, now),
  };
}

function appendFailureNote(body: string, reasons: readonly string[], now: string): string {
  const note = [
    ``,
    ``,
    `## Validation failed (${now})`,
    ...reasons.map((r) => `- ${r}`),
  ].join('\n');
  return `${body.trimEnd()}${note}\n`;
}
