import { describe, it, expect } from 'vitest';
import { Card } from '../core/cards/card';
import { CardStatus } from '../core/cards/status';
import { buildBoard } from '../core/board/board';
import { renderBoardHtml } from './boardView';

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

describe('renderBoardHtml', () => {
  it('renders all four column labels', () => {
    const html = renderBoardHtml(buildBoard([]));
    for (const label of ['Inbox', 'In Progress', 'Review', 'Done']) {
      expect(html).toContain(label);
    }
  });

  it('renders a draggable card with its id, status, and meta', () => {
    const board = buildBoard([card('PRD-1', 'in-progress', { owner: 'alice', engine: 'claude', priority: 2 })]);
    const html = renderBoardHtml(board);
    expect(html).toContain('draggable="true"');
    expect(html).toContain('data-id="PRD-1"');
    expect(html).toContain('data-status="in-progress"');
    expect(html).toContain('@alice · claude · P2');
  });

  it('escapes untrusted card titles', () => {
    const board = buildBoard([card('PRD-2', 'ready', { title: '<img src=x onerror=alert(1)>' })]);
    const html = renderBoardHtml(board);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });

  it('shows an empty marker for a column with no cards', () => {
    expect(renderBoardHtml(buildBoard([]))).toContain('class="empty"');
  });

  it('binds the CSP nonce to the inline script', () => {
    const html = renderBoardHtml(buildBoard([]), { nonce: 'abc123' });
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('<script nonce="abc123">');
  });
});
