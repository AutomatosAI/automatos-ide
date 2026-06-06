import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { FileStore } from '../fs/fileStore';
import { GitOps } from '../git/gitOps';
import { CHAT_DIR, composeMessage, messagePath, readMessages, sendMessage } from '../core/chat/maildir';
import { renderChatHtml } from '../ui/chatView';
import { makeNonce } from '../ui/nonce';

export interface ChatDeps {
  readonly root: string;
  readonly store: FileStore;
  readonly git: GitOps;
  /** The reader's handle — the `from` on everything they send. */
  readonly me: string;
}

/**
 * The team-chat panel — render the transcript, turn a send into a maildir push (M4).
 *
 * Boundary glue (not unit-tested); the pure parts — {@link composeMessage},
 * {@link readMessages}, {@link renderChatHtml} — are covered. One file per message means
 * concurrent sends never collide, so a send is just write + add + commit + push; a single
 * rebase-and-retry absorbs a lost push race because the unique filename re-applies
 * cleanly. A watcher on `chat/**` repaints when a teammate's message lands.
 */
export class ChatPanel {
  private static current: ChatPanel | undefined;

  static show(context: vscode.ExtensionContext, deps: ChatDeps): void {
    if (ChatPanel.current) {
      ChatPanel.current.panel.reveal();
      void ChatPanel.current.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'automatosChat',
      'Automatos Team Chat',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    ChatPanel.current = new ChatPanel(panel, deps);
    context.subscriptions.push(panel);
  }

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly deps: ChatDeps,
  ) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(deps.root, `${CHAT_DIR}/**`),
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
    const messages = await readMessages(this.deps.store);
    this.panel.webview.html = renderChatHtml(messages, { nonce: makeNonce(), me: this.deps.me });
  }

  private async onMessage(msg: unknown): Promise<void> {
    if (!isSendMessage(msg)) {
      return;
    }
    const text = msg.text.trim();
    if (!text) {
      return;
    }
    const message = composeMessage(
      { from: this.deps.me, to: null, text },
      { at: new Date().toISOString(), nonce: randomBytes(6).toString('hex') },
    );
    try {
      await sendMessage(this.deps.store, message);
      await this.deps.git.add([messagePath(message.id)]);
      await this.deps.git.commit(`chat: ${this.deps.me}`);
      let push = await this.deps.git.push();
      if (push.rejected) {
        await this.deps.git.pullRebase();
        push = await this.deps.git.push();
      }
      if (!push.ok) {
        vscode.window.showErrorMessage(`Send failed: ${push.stderr.trim()}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Send failed: ${(error as Error).message}`);
    }
    await this.refresh();
  }

  private dispose(): void {
    ChatPanel.current = undefined;
    for (const d of this.disposables.splice(0)) {
      d.dispose();
    }
  }
}

interface SendMessage {
  readonly type: 'send';
  readonly text: string;
}

function isSendMessage(msg: unknown): msg is SendMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'send' &&
    typeof (msg as { text?: unknown }).text === 'string'
  );
}
