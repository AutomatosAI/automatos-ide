import { describe, it, expect } from 'vitest';
import { Card } from '../cards/card';
import { parseCard } from '../cards/frontmatter';
import { CardStatus } from '../cards/status';
import { cardPath } from './layout';
import { moveCard } from './moveCard';
import { GitOps } from '../../git/gitOps';
import { FakeGitRunner, argStartsWith } from '../../test/fakeGit';
import { FakeFileStore } from '../../test/fakeFs';

function card(status: CardStatus, over: Partial<Card> = {}): Card {
  return {
    id: 'PRD-7',
    title: 'A card',
    project: 'ide',
    status,
    owner: null,
    branch: null,
    priority: 1,
    created: '2026-01-01',
    updated: null,
    engine: null,
    validationCriteria: [],
    body: 'work',
    ...over,
  };
}

const ctx = { now: '2026-06-06T12:00:00Z' };

function setup(pushResult?: Parameters<FakeGitRunner['on']>[1]) {
  const runner = new FakeGitRunner();
  if (pushResult) {
    runner.on(argStartsWith('push'), pushResult);
  }
  const git = new GitOps(runner, '/repo');
  const store = new FakeFileStore();
  return { runner, git, store };
}

describe('moveCard', () => {
  it('git mv + rewrites status + commits + pushes on a successful move', async () => {
    const { runner, git, store } = setup();
    const result = await moveCard(git, store, card('ready'), 'review', ctx);

    expect(result).toEqual({ ok: true, rejected: false, card: expect.objectContaining({ status: 'review' }) });
    expect(runner.ran(argStartsWith('mv', cardPath('ready', 'PRD-7'), cardPath('review', 'PRD-7')))).toBe(true);
    expect(runner.ran(argStartsWith('push'))).toBe(true);

    const written = parseCard(await store.read(cardPath('review', 'PRD-7')));
    expect(written.status).toBe('review');
    expect(written.updated).toBe('2026-06-06T12:00:00Z');
  });

  it('is a no-op when the card is dropped back in its own column', async () => {
    const { runner, git, store } = setup();
    const result = await moveCard(git, store, card('ready'), 'ready', ctx);
    expect(result.ok).toBe(true);
    expect(runner.ran(argStartsWith('mv'))).toBe(false);
  });

  it('on a lost race, resets to upstream and reports rejected', async () => {
    const { runner, git, store } = setup({ code: 1, stderr: 'rejected: non-fast-forward' });
    const result = await moveCard(git, store, card('ready'), 'review', ctx);

    expect(result.rejected).toBe(true);
    expect(result.ok).toBe(false);
    expect(runner.ran(argStartsWith('reset', '--hard', '@{u}'))).toBe(true);
    expect(runner.ran(argStartsWith('pull', '--rebase'))).toBe(true);
  });

  it('throws when the push fails for a non-race reason', async () => {
    const { git, store } = setup({ code: 128, stderr: 'fatal: remote hung up' });
    await expect(moveCard(git, store, card('ready'), 'review', ctx)).rejects.toThrow(/not a lost race/);
  });
});
