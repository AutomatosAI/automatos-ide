import { describe, it, expect } from 'vitest';
import { claimNextCard, claimSpecificCard, readReadyQueue, ClaimContext } from './claimEngine';
import { parseCard } from '../cards/frontmatter';
import { serializeCard } from '../cards/frontmatter';
import { GitOps } from '../../git/gitOps';
import { FakeGitRunner, argStartsWith } from '../../test/fakeGit';
import { FakeFileStore } from '../../test/fakeFs';

const CWD = '/control';
const REJECT = {
  code: 1,
  stderr: '! [rejected]  main -> main (non-fast-forward)\nerror: failed to push some refs',
};

function readyFile(id: string, priority: number, created = '2026-01-01'): string {
  return serializeCard({
    id,
    title: id,
    project: 'ide',
    status: 'ready',
    owner: null,
    branch: null,
    priority,
    created,
    updated: null,
    engine: null,
    validationCriteria: [],
    body: 'do the thing',
  });
}

function seedInbox(store: FakeFileStore, ...cards: { id: string; priority: number }[]): void {
  for (const c of cards) {
    store.seed(`prds/inbox/${c.id}.md`, readyFile(c.id, c.priority));
  }
}

const ctx: ClaimContext = {
  owner: 'agent-1',
  now: () => '2026-06-06T00:00:00Z',
  branchFor: (card) => `feat/${card.id}`,
};

describe('readReadyQueue', () => {
  it('parses inbox cards into claim order and ignores non-card files', async () => {
    const store = new FakeFileStore();
    seedInbox(store, { id: 'PRD-9', priority: 9 }, { id: 'PRD-1', priority: 1 });
    store.seed('prds/inbox/.gitkeep', '');
    const queue = await readReadyQueue(store);
    expect(queue.map((c) => c.id)).toEqual(['PRD-1', 'PRD-9']);
  });
});

describe('claimNextCard — winning the race', () => {
  it('pulls first, then claims the highest-priority card via mv+commit+push', async () => {
    const runner = new FakeGitRunner();
    const store = new FakeFileStore();
    seedInbox(store, { id: 'PRD-9', priority: 9 }, { id: 'PRD-1', priority: 1 });

    const claimed = await claimNextCard(new GitOps(runner, CWD), store, ctx);

    expect(claimed?.id).toBe('PRD-1');
    expect(claimed?.status).toBe('in-progress');
    expect(claimed?.owner).toBe('agent-1');
    expect(claimed?.branch).toBe('feat/PRD-1');
    expect(runner.ran(argStartsWith('pull', '--rebase'))).toBe(true);
    expect(runner.ran(argStartsWith('mv', 'prds/inbox/PRD-1.md', 'prds/in-progress/PRD-1.md'))).toBe(
      true,
    );
    expect(runner.ran((a) => a[0] === 'commit' && a[2] === 'claim PRD-1')).toBe(true);
    expect(runner.ran(argStartsWith('push'))).toBe(true);
  });

  it('writes the claimed frontmatter to the in-progress path', async () => {
    const runner = new FakeGitRunner();
    const store = new FakeFileStore();
    seedInbox(store, { id: 'PRD-1', priority: 1 });

    await claimNextCard(new GitOps(runner, CWD), store, ctx);

    const written = await store.read('prds/in-progress/PRD-1.md');
    expect(written).toContain('status: in-progress');
    expect(written).toContain('owner: agent-1');
  });

  it('returns null when the inbox is empty', async () => {
    const runner = new FakeGitRunner();
    const claimed = await claimNextCard(new GitOps(runner, CWD), new FakeFileStore(), ctx);
    expect(claimed).toBeNull();
  });
});

describe('claimNextCard — losing the race (the loser contract)', () => {
  it('on a lost push, resets to upstream and claims the NEXT card instead', async () => {
    const runner = new FakeGitRunner().on(argStartsWith('push'), [REJECT, {}]);
    const store = new FakeFileStore();
    seedInbox(store, { id: 'PRD-1', priority: 1 }, { id: 'PRD-2', priority: 2 });

    const claimed = await claimNextCard(new GitOps(runner, CWD), store, ctx);

    expect(claimed?.id).toBe('PRD-2');
    expect(runner.ran(argStartsWith('reset', '--hard', '@{u}'))).toBe(true);
    expect(runner.countWhere(argStartsWith('push'))).toBe(2);
  });

  it('returns null (no infinite loop) when every ready card is lost', async () => {
    const runner = new FakeGitRunner().on(argStartsWith('push'), REJECT);
    const store = new FakeFileStore();
    seedInbox(store, { id: 'PRD-1', priority: 1 });

    const claimed = await claimNextCard(new GitOps(runner, CWD), store, ctx);

    expect(claimed).toBeNull();
    expect(runner.ran(argStartsWith('reset', '--hard', '@{u}'))).toBe(true);
  });

  it('throws (does not treat as a lost race) when the push fails for auth/network', async () => {
    const runner = new FakeGitRunner().on(argStartsWith('push'), {
      code: 128,
      stderr: 'fatal: could not read Username for https://github.com',
    });
    const store = new FakeFileStore();
    seedInbox(store, { id: 'PRD-1', priority: 1 });

    await expect(claimNextCard(new GitOps(runner, CWD), store, ctx)).rejects.toThrow(
      /not a lost race/,
    );
  });
});

describe('claimSpecificCard — the manual "launch on THIS card" CAS', () => {
  it('claims the chosen card (not the top of the queue) on a winning push', async () => {
    const runner = new FakeGitRunner();
    const store = new FakeFileStore();
    seedInbox(store, { id: 'PRD-1', priority: 1 }, { id: 'PRD-9', priority: 9 });
    const target = parseCard(await store.read('prds/inbox/PRD-9.md'));

    const claimed = await claimSpecificCard(new GitOps(runner, CWD), store, ctx, target);

    expect(claimed?.id).toBe('PRD-9');
    expect(claimed?.status).toBe('in-progress');
    expect(claimed?.owner).toBe('agent-1');
    expect(claimed?.branch).toBe('feat/PRD-9');
    expect(runner.ran(argStartsWith('mv', 'prds/inbox/PRD-9.md', 'prds/in-progress/PRD-9.md'))).toBe(
      true,
    );
  });

  it('returns null when the chosen card was claimed first (lost race)', async () => {
    const runner = new FakeGitRunner().on(argStartsWith('push'), REJECT);
    const store = new FakeFileStore();
    seedInbox(store, { id: 'PRD-1', priority: 1 });
    const target = parseCard(await store.read('prds/inbox/PRD-1.md'));

    const claimed = await claimSpecificCard(new GitOps(runner, CWD), store, ctx, target);

    expect(claimed).toBeNull();
  });
});
