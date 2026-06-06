import { Card, resolveByLww } from '../cards/card';
import { CardStatus, CARD_STATUSES } from '../cards/status';

/**
 * The board: cards grouped into status columns for rendering and selection.
 *
 * Spec: 14-data-model.md §2.1. The frontmatter `status` decides which column a card
 * lands in — NOT the folder it was read from. Two jobs live here, both pure:
 *   - {@link dedupeByLww}: collapse divergent copies of the same id (offline workers)
 *     to the last-writer-wins winner, so a card never appears twice.
 *   - {@link compareCards}: the deterministic claim order (lower priority first), so
 *     every agent independently picks the same next card to race for (11 §4).
 */

export interface Column {
  readonly status: CardStatus;
  readonly cards: readonly Card[];
}

export interface Board {
  readonly columns: readonly Column[];
}

/**
 * Total order for claim selection and stable rendering:
 *   1. lower `priority` number wins (priority 1 outranks priority 5),
 *   2. then older `created` wins (FIFO within a priority),
 *   3. then `id` ascending — a stable tie-break so the order is fully deterministic.
 */
export function compareCards(a: Card, b: Card): number {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  if (a.created !== b.created) {
    return a.created < b.created ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Collapse cards that share an id to a single last-write-wins winner (14 §2.1).
 * Insertion order of the surviving ids is preserved so the result is deterministic.
 */
export function dedupeByLww(cards: readonly Card[]): readonly Card[] {
  const winners = new Map<string, Card>();
  for (const card of cards) {
    const existing = winners.get(card.id);
    winners.set(card.id, existing ? resolveByLww(existing, card) : card);
  }
  return [...winners.values()];
}

/**
 * Group cards into the four status columns (in {@link CARD_STATUSES} order), each
 * sorted by {@link compareCards}. Divergent copies are reconciled first, so the same
 * card never lands in two columns.
 */
export function buildBoard(cards: readonly Card[]): Board {
  const buckets = new Map<CardStatus, Card[]>();
  for (const status of CARD_STATUSES) {
    buckets.set(status, []);
  }
  for (const card of dedupeByLww(cards)) {
    buckets.get(card.status)?.push(card);
  }
  const columns = CARD_STATUSES.map((status) => ({
    status,
    cards: (buckets.get(status) ?? []).sort(compareCards),
  }));
  return { columns };
}

/** The cards in one column, already in claim/render order. Empty if none. */
export function columnCards(board: Board, status: CardStatus): readonly Card[] {
  return board.columns.find((column) => column.status === status)?.cards ?? [];
}

/**
 * The ready cards in the order an agent should race for them (11 §4). The claim loop
 * tries these in turn: on a lost race it advances to the NEXT, never retrying a loss.
 */
export function claimQueue(board: Board): readonly Card[] {
  return columnCards(board, 'ready');
}
