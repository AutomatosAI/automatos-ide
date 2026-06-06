import { describe, it, expect } from 'vitest';
import { Card } from '../cards/card';
import { validate, applyVerdict, ValidationInput } from './validator';

const allMet = [
  { text: 'a works', met: true },
  { text: 'b works', met: true },
];

const base: ValidationInput = {
  criteria: allMet,
  testsPassed: true,
  ciPassed: null,
  requireCi: false,
};

function reviewCard(over: Partial<Card> = {}): Card {
  return {
    id: 'PRD-7',
    title: 'Add the thing',
    project: 'ide',
    status: 'review',
    owner: 'agent-1',
    branch: 'feat/prd-7',
    priority: 1,
    created: '2026-01-01',
    updated: '2026-06-01T00:00:00Z',
    engine: null,
    validationCriteria: [],
    body: 'The PRD body.',
    ...over,
  };
}

describe('validate', () => {
  it('passes when every criterion is met and tests are green', () => {
    expect(validate(base)).toEqual({ verdict: 'pass', reasons: [] });
  });

  it('fails and names each unmet criterion', () => {
    const out = validate({ ...base, criteria: [{ text: 'b works', met: false }] });
    expect(out.verdict).toBe('fail');
    expect(out.reasons).toContain('criterion not met: b works');
  });

  it('fails when tests failed', () => {
    expect(validate({ ...base, testsPassed: false }).reasons).toContain('tests failed');
  });

  it('fails closed when tests were never run', () => {
    expect(validate({ ...base, testsPassed: null }).reasons).toContain(
      'tests were not run — cannot verify',
    );
  });

  it('ignores CI unless required', () => {
    expect(validate({ ...base, ciPassed: false, requireCi: false }).verdict).toBe('pass');
    expect(validate({ ...base, ciPassed: false, requireCi: true }).verdict).toBe('fail');
  });

  it('requires a known CI result when requireCi is set', () => {
    expect(validate({ ...base, ciPassed: null, requireCi: true }).reasons).toContain(
      'CI status unknown',
    );
  });
});

describe('applyVerdict', () => {
  const now = '2026-06-06T00:00:00Z';

  it('promotes a passing card to done and stamps it', () => {
    const done = applyVerdict(reviewCard(), { verdict: 'pass', reasons: [] }, now);
    expect(done.status).toBe('done');
    expect(done.updated).toBe(now);
  });

  it('bounces a failing card to ready, unowned, with a dated failure note', () => {
    const bounced = applyVerdict(
      reviewCard(),
      { verdict: 'fail', reasons: ['tests failed', 'criterion not met: b works'] },
      now,
    );
    expect(bounced.status).toBe('ready');
    expect(bounced.owner).toBeNull();
    expect(bounced.branch).toBeNull();
    expect(bounced.body).toContain(`## Validation failed (${now})`);
    expect(bounced.body).toContain('- tests failed');
    expect(bounced.body).toContain('- criterion not met: b works');
  });

  it('preserves the original body above the failure note', () => {
    const bounced = applyVerdict(reviewCard({ body: 'Original PRD.' }), {
      verdict: 'fail',
      reasons: ['tests failed'],
    }, now);
    expect(bounced.body.startsWith('Original PRD.')).toBe(true);
  });
});
