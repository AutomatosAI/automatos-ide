import { describe, it, expect } from 'vitest';
import {
  Card,
  withStatus,
  claimCard,
  releaseCard,
  detectStatusMismatch,
  resolveByLww,
} from './card';

const base: Card = {
  id: 'PRD-0007',
  title: 'Add rate limiting to ingest API',
  project: 'ingest-service',
  status: 'ready',
  owner: null,
  branch: null,
  priority: 2,
  created: '2026-06-06',
  updated: null,
  engine: null,
  validationCriteria: [{ text: 'returns 429 over limit', done: false }],
  body: '## Goal\n',
};

describe('card transforms are immutable', () => {
  it('withStatus returns a new card and never mutates the original', () => {
    const next = withStatus(base, 'review', '2026-06-06T10:00:00Z');
    expect(next.status).toBe('review');
    expect(next.updated).toBe('2026-06-06T10:00:00Z');
    expect(base.status).toBe('ready');
    expect(base.updated).toBeNull();
    expect(next).not.toBe(base);
  });

  it('claimCard assigns owner+branch and moves to in-progress', () => {
    const claimed = claimCard(base, 'agent-3', 'agent-3/PRD-0007', '2026-06-06T10:00:00Z');
    expect(claimed.status).toBe('in-progress');
    expect(claimed.owner).toBe('agent-3');
    expect(claimed.branch).toBe('agent-3/PRD-0007');
    expect(base.owner).toBeNull(); // original untouched
  });

  it('releaseCard returns the card to the inbox, unowned (loser contract / bounce)', () => {
    const claimed = claimCard(base, 'agent-3', 'b', '2026-06-06T10:00:00Z');
    const released = releaseCard(claimed, '2026-06-06T10:05:00Z');
    expect(released.status).toBe('ready');
    expect(released.owner).toBeNull();
    expect(released.branch).toBeNull();
  });
});

describe('status invariant: frontmatter wins (14 §2.1)', () => {
  it('returns null when frontmatter and folder agree', () => {
    expect(detectStatusMismatch(base, 'ready')).toBeNull();
  });

  it('flags a mismatch and points at the folder the frontmatter demands', () => {
    const inReviewFront = withStatus(base, 'review', '2026-06-06T10:00:00Z');
    const mismatch = detectStatusMismatch(inReviewFront, 'in-progress');
    expect(mismatch).not.toBeNull();
    expect(mismatch!.frontmatterStatus).toBe('review');
    expect(mismatch!.folderStatus).toBe('in-progress');
    expect(mismatch!.expectedFolder).toBe('review');
  });
});

describe('LWW reconciliation (14 §2.1)', () => {
  it('picks the copy with the newer updated timestamp', () => {
    const older = { ...base, updated: '2026-06-06T10:00:00Z', status: 'in-progress' as const };
    const newer = { ...base, updated: '2026-06-06T10:05:00Z', status: 'review' as const };
    expect(resolveByLww(older, newer).status).toBe('review');
    expect(resolveByLww(newer, older).status).toBe('review'); // order-independent
  });

  it('treats a missing timestamp as oldest', () => {
    const noStamp = { ...base, updated: null };
    const stamped = { ...base, updated: '2026-06-06T10:00:00Z', status: 'done' as const };
    expect(resolveByLww(noStamp, stamped).status).toBe('done');
  });

  it('throws when asked to reconcile two different cards', () => {
    expect(() => resolveByLww(base, { ...base, id: 'PRD-0008' })).toThrow(/different ids/);
  });
});
