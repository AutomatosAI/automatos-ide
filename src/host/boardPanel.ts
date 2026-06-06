import * as vscode from 'vscode';
import { FileStore } from '../fs/fileStore';
import { GitOps } from '../git/gitOps';
import { readBoard } from '../core/board/boardStore';
import { moveCard } from '../core/board/moveCard';
import { Board, columnCards } from '../core/board/board';
import { Card } from '../core/cards/card';
import { CARD_STATUSES, isCardStatus } from '../core/cards/status';
import { PRDS_ROOT } from '../core/board/layout';
import { renderBoardHtml } from '../ui/boardView';
import { makeNonce } from '../ui/nonce';

export interface BoardDeps {
  readonly root: string;
  readonly store: FileStore;
  readonly git: GitOps;
}

/**
 * The Kanban cockpit panel — render the board, turn a drag into a git move (M0/M1).
 *
 * Boundary glue, so it is NOT unit-tested (there is no Extension Host under vitest); the
 * logic it delegates to — {@link readBoard}, {@link moveCard}, {@link renderBoardHtml} —
 * is pure and covered. A FileSystemWatcher on `prds/**` refreshes the view whenever any
 * teammate's push lands, so the board reflects shared git state, never local memory. A
 * fresh CSP nonce per render means only our own inline drag script runs.
 */
export class BoardPanel {
  private static current: BoardPanel | undefined;

  static show(context: vscode.ExtensionContext, deps: BoardDeps): void {
    if (BoardPanel.current) {
      BoardPanel.current.panel.reveal();
      void BoardPanel.current.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'automatosBoard',
      'Automatos Board',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    BoardPanel.current = new BoardPanel(panel, deps);
    context.subscriptions.push(panel);
  }

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly deps: BoardDeps,
  ) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(deps.root, `${PRDS_ROOT}/**`),
    );
    watcher.onDidChange(() => void this.refresh(), null, this.disposables);
    watcher.onDidCreate(() => void this.refresh(), null, this.disposables);
    watcher.onDidDelete(() => void this.refresh(), null, this.disposables);
    this.disposables.push(watcher);

    this.panel.webview.onDidReceiveMessage((msg) => void this.onMessage(msg), null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const board = await readBoard(this.deps.store);
    this.panel.webview.html = renderBoardHtml(board, { nonce: makeNonce() });
  }

  private async onMessage(msg: unknown): Promise<void> {
    if (!isMoveMessage(msg) || !isCardStatus(msg.to)) {
      return;
    }
    const board = await readBoard(this.deps.store);
    const card = findCard(board, msg.id);
    if (!card) {
      return;
    }
    try {
      const result = await moveCard(this.deps.git, this.deps.store, card, msg.to, {
        now: new Date().toISOString(),
      });
      if (result.rejected) {
        vscode.window.showInformationMessage(
          `"${card.title}" was moved by a teammate first — refreshed to their state.`,
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Move failed: ${(error as Error).message}`);
    }
    await this.refresh();
  }

  private dispose(): void {
    BoardPanel.current = undefined;
    for (const d of this.disposables.splice(0)) {
      d.dispose();
    }
  }
}

interface MoveMessage {
  readonly type: 'move';
  readonly id: string;
  readonly to: string;
}

function isMoveMessage(msg: unknown): msg is MoveMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'move' &&
    typeof (msg as { id?: unknown }).id === 'string' &&
    typeof (msg as { to?: unknown }).to === 'string'
  );
}

function findCard(board: Board, id: string): Card | undefined {
  for (const status of CARD_STATUSES) {
    const found = columnCards(board, status).find((c) => c.id === id);
    if (found) {
      return found;
    }
  }
  return undefined;
}
