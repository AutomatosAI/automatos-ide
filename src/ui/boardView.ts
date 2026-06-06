import { Board } from '../core/board/board';
import { Card } from '../core/cards/card';
import { CardStatus } from '../core/cards/status';
import { escapeHtml } from './html';

/**
 * Render a {@link Board} to webview HTML — the M0 cockpit view (13 §4).
 *
 * Pure: Board in, HTML string out, so the layout is unit-tested without a running VS
 * Code. Cards are draggable and each column is a drop zone; on drop the injected script
 * posts `{type:'move', id, to}` back to the extension, which performs the git mv (15 §2).
 * Every piece of card text is escaped — titles and owners are untrusted input.
 */

const COLUMN_LABEL: Readonly<Record<CardStatus, string>> = {
  ready: 'Inbox',
  'in-progress': 'In Progress',
  review: 'Review',
  done: 'Done',
};

export interface BoardViewOptions {
  /** CSP nonce for the inline drag script. */
  readonly nonce?: string;
}

export function renderBoardHtml(board: Board, options: BoardViewOptions = {}): string {
  const nonce = options.nonce ?? '';
  const columns = board.columns.map(renderColumn).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; padding: 8px; }
  .board { display: flex; gap: 12px; align-items: flex-start; }
  .column { flex: 1; min-width: 0; background: var(--vscode-editorWidget-background); border-radius: 6px; padding: 8px; }
  .column h2 { font-size: 12px; text-transform: uppercase; opacity: 0.7; margin: 0 0 8px; }
  .count { opacity: 0.5; font-weight: normal; }
  .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 6px 8px; margin-bottom: 6px; cursor: grab; }
  .card .id { font-size: 11px; opacity: 0.6; }
  .card .title { font-weight: 600; }
  .card .meta { font-size: 11px; opacity: 0.7; margin-top: 2px; }
  .empty { font-size: 12px; opacity: 0.4; font-style: italic; }
</style>
</head>
<body>
<div class="board">
${columns}
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let dragId = null;
  let dragFrom = null;
  for (const el of document.querySelectorAll('.card')) {
    el.addEventListener('dragstart', () => { dragId = el.dataset.id; dragFrom = el.dataset.status; });
  }
  for (const col of document.querySelectorAll('.column')) {
    col.addEventListener('dragover', (e) => e.preventDefault());
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragId && col.dataset.status !== dragFrom) {
        vscode.postMessage({ type: 'move', id: dragId, to: col.dataset.status });
      }
      dragId = null; dragFrom = null;
    });
  }
</script>
</body>
</html>`;
}

function renderColumn(column: Board['columns'][number]): string {
  const label = COLUMN_LABEL[column.status];
  const cards =
    column.cards.length === 0
      ? '<div class="empty">empty</div>'
      : column.cards.map(renderCard).join('\n');
  return `<section class="column" data-status="${column.status}">
  <h2>${escapeHtml(label)} <span class="count">${column.cards.length}</span></h2>
  ${cards}
</section>`;
}

function renderCard(card: Card): string {
  const meta = [card.owner ? `@${card.owner}` : null, card.engine, `P${card.priority}`]
    .filter((part): part is string => Boolean(part))
    .map(escapeHtml)
    .join(' · ');
  return `<div class="card" draggable="true" data-id="${escapeHtml(card.id)}" data-status="${card.status}">
    <div class="id">${escapeHtml(card.id)}</div>
    <div class="title">${escapeHtml(card.title)}</div>
    <div class="meta">${meta}</div>
  </div>`;
}
