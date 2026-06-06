import { describe, it, expect } from 'vitest';
import { Card } from '../cards/card';
import { CardStatus } from '../cards/status';
import { buildBoard, columnCards, claimQueue, compareCards, dedupeByLww } from './board';

function card(over: Partial<Card> & Pick<Card, 'id'>): Card {
  return {
    title: over.id,
    project: 'ide',
    status: 'ready',
    owner: null,
    branch: null,
    priority: 3,
    created: '2026-01-01',
    updated: null,
    engine: null,
    validationCriteria: [],
    body: '',
    ...over,
  };
}

describe('compareCards — claim order', () => {
  it('orders by priority ascending (lower number is higher priority)', () => {
    const a = card({ id: 'a', priority: 5 });
    const b = card({ id: 'b', priority: 1 });
    expect([a, b].sort(compareCards).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('breaks a priority tie by older created first', () => {
    const newer = card({ id: 'newer', priority: 1, created: '2026-03-01' });
    const older = card({ id: 'older', priority: 1, created: '2026-01-01' });
    expect([newer, older].sort(compareCards).map((c) => c.id)).toEqual(['older', 'newer']);
  });

  it('breaks a priority+created tie by id ascending', () => {
    const z = card({ id: 'z', priority: 1, created: '2026-01-01' });
    const a = card({ id: 'a', priority: 1, created: '2026-01-01' });
    expect([z, a].sort(compareCards).map((c) => c.id)).toEqual(['a', 'z']);
  });
});

describe('buildBoard', () => {
  it('always renders all four columns in fixed order, even when empty', () => {
    const board = buildBoard([]);
    expect(board.columns.map((c) => c.status)).toEqual<CardStatus[]>([
      'ready',
      'in-progress',
      'review',
      'done',
    ]);
    expect(board.columns.every((c) => c.cards.length === 0)).toBe(true);
  });

  it('routes a card to the column named by its frontmatter status, not its folder', () => {
    const board = buildBoard([card({ id: 'x', status: 'review' })]);
    expect(columnCards(board, 'ready')).toHaveLength(0);
    expect(columnCards(board, 'review').map((c) => c.id)).toEqual(['x']);
  });

  it('sorts within a column by claim order', () => {
    const board = buildBoard([
      card({ id: 'low', priority: 9 }),
      card({ id: 'high', priority: 1 }),
      card({ id: 'mid', priority: 5 }),
    ]);
    expect(claimQueue(board).map((c) => c.id)).toEqual(['high', 'mid', 'low']);
  });
});

describe('dedupeByLww — divergent copies (14 §2.1)', () => {
  it('keeps the newer updated copy when the same id appears twice', () => {
    const stale = card({ id: 'dup', status: 'ready', updated: '2026-01-01T00:00:00Z' });
    const fresh = card({ id: 'dup', status: 'in-progress', updated: '2026-02-01T00:00:00Z' });
    const winners = dedupeByLww([stale, fresh]);
    expect(winners).toHaveLength(1);
    expect(winners[0].status).toBe('in-progress');
  });

  it('never lands a duplicated card in two columns', () => {
    const inInbox = card({ id: 'dup', status: 'ready', updated: '2026-01-01T00:00:00Z' });
    const inProgress = card({ id: 'dup', status: 'in-progress', updated: '2026-02-01T00:00:00Z' });
    const board = buildBoard([inInbox, inProgress]);
    expect(columnCards(board, 'ready')).toHaveLength(0);
    expect(columnCards(board, 'in-progress').map((c) => c.id)).toEqual(['dup']);
  });
});
