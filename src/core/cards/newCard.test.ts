import { describe, it, expect } from 'vitest';
import { nextPrdId, newReadyCard } from './newCard';

describe('nextPrdId', () => {
  it('starts at PRD-0001 when nothing exists', () => {
    expect(nextPrdId([])).toBe('PRD-0001');
  });

  it('returns one past the highest existing PRD number', () => {
    expect(nextPrdId(['PRD-0001', 'PRD-0005', 'PRD-0003'])).toBe('PRD-0006');
  });

  it('ignores ids that are not PRD-NNNN', () => {
    expect(nextPrdId(['TASK-9', 'PRD-0002', 'notes'])).toBe('PRD-0003');
  });

  it('grows past four digits rather than wrapping', () => {
    expect(nextPrdId(['PRD-9999'])).toBe('PRD-10000');
  });
});

describe('newReadyCard', () => {
  it('mints an unclaimed ready card with a PRD scaffold', () => {
    const card = newReadyCard({
      id: 'PRD-0007',
      title: 'Add OAuth',
      project: 'automatos',
      priority: 2,
      now: '2026-06-06T10:00:00.000Z',
    });
    expect(card.status).toBe('ready');
    expect(card.owner).toBeNull();
    expect(card.branch).toBeNull();
    expect(card.engine).toBeNull();
    expect(card.created).toBe('2026-06-06');
    expect(card.updated).toBe('2026-06-06T10:00:00.000Z');
    expect(card.title).toBe('Add OAuth');
    expect(card.body).toContain('## Acceptance criteria');
    expect(card.body).toContain('## Tasks');
  });
});
