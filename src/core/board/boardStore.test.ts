import { describe, it, expect } from 'vitest';
import { Card } from '../cards/card';
import { serializeCard } from '../cards/frontmatter';
import { CardStatus } from '../cards/status';
import { cardPath } from './layout';
import { columnCards } from './board';
import { readBoard } from './boardStore';
import { FakeFileStore } from '../../test/fakeFs';

function card(id: string, status: CardStatus, over: Partial<Card> = {}): Card {
  return {
    id,
    title: id,
    project: 'ide',
    status,
    owner: null,
    branch: null,
    priority: 1,
    created: '2026-01-01',
    updated: null,
    engine: null,
    validationCriteria: [],
    body: '',
    ...over,
  };
}

function seedCard(store: FakeFileStore, folderStatus: CardStatus, c: Card): void {
  store.seed(cardPath(folderStatus, c.id), serializeCard(c));
}

describe('readBoard', () => {
  it('groups cards into columns by their frontmatter status', async () => {
    const store = new FakeFileStore();
    seedCard(store, 'ready', card('PRD-1', 'ready'));
    seedCard(store, 'in-progress', card('PRD-2', 'in-progress'));
    seedCard(store, 'done', card('PRD-3', 'done'));
    const board = await readBoard(store);
    expect(columnCards(board, 'ready').map((c) => c.id)).toEqual(['PRD-1']);
    expect(columnCards(board, 'in-progress').map((c) => c.id)).toEqual(['PRD-2']);
    expect(columnCards(board, 'done').map((c) => c.id)).toEqual(['PRD-3']);
  });

  it('honors frontmatter status over the folder a card sits in', async () => {
    const store = new FakeFileStore();
    // physically in the inbox folder, but its frontmatter says review
    seedCard(store, 'ready', card('PRD-9', 'review'));
    const board = await readBoard(store);
    expect(columnCards(board, 'review').map((c) => c.id)).toEqual(['PRD-9']);
    expect(columnCards(board, 'ready')).toEqual([]);
  });

  it('collapses a card mid-transition (present in two folders) to the LWW winner', async () => {
    const store = new FakeFileStore();
    seedCard(store, 'ready', card('PRD-5', 'ready', { updated: '2026-06-01T00:00:00Z' }));
    seedCard(store, 'in-progress', card('PRD-5', 'in-progress', { updated: '2026-06-02T00:00:00Z' }));
    const board = await readBoard(store);
    expect(columnCards(board, 'in-progress').map((c) => c.id)).toEqual(['PRD-5']);
    expect(columnCards(board, 'ready')).toEqual([]);
  });

  it('skips a malformed card file rather than blanking the board', async () => {
    const store = new FakeFileStore();
    seedCard(store, 'ready', card('PRD-1', 'ready'));
    store.seed(cardPath('ready', 'broken'), 'not a card');
    const board = await readBoard(store);
    expect(columnCards(board, 'ready').map((c) => c.id)).toEqual(['PRD-1']);
  });

  it('returns empty columns for an empty repo', async () => {
    const board = await readBoard(new FakeFileStore());
    expect(board.columns.every((col) => col.cards.length === 0)).toBe(true);
  });
});
