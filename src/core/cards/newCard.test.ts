import { describe, it, expect } from 'vitest';
import { newReadyCard } from './newCard';

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
