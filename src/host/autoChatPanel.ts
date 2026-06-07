import * as vscode from 'vscode';
import {
  AutoChatClient,
  AutoConversation,
  EMPTY_CONVERSATION,
  appendTurn,
  sendToAuto,
  toChatMessages,
} from '../core/chat/autoChat';
import { renderChatHtml } from '../ui/chatView';
import { makeNonce } from '../ui/nonce';

export interface AutoChatDeps {
  /** The wire transport to AUTO (host fetch + SSE); see {@link createAutoClient}. */
  readonly client: AutoChatClient;
  /** The reader's handle, so their turns render right-aligned. */
  readonly me: string;
}

/**
 * The AUTO chat panel — talk to the persistent orchestrator over the Automatos widget plane.
 *
 * Distinct from the team-chat panel ({@link ChatPanel}, human↔human over git): this is the
 * user↔AUTO conversation, so state is an in-memory {@link AutoConversation} (no git, no
 * watcher) that lives for the panel's lifetime. The pure fold — {@link sendToAuto} — and the
 * renderer — {@link renderChatHtml} via {@link toChatMessages} — are unit-tested; this class is
 * just the webview glue. A send is echoed optimistically with a "thinking" row, then replaced
 * by the canonical conversation once the reply lands.
 */
export class AutoChatPanel {
  private static current: AutoChatPanel | undefined;

  static show(context: vscode.ExtensionContext, deps: AutoChatDeps): void {
    if (AutoChatPanel.current) {
      AutoChatPanel.current.deps = deps;
      AutoChatPanel.current.panel.reveal();
      AutoChatPanel.current.paint(AutoChatPanel.current.conversation);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'automatosAutoChat',
      'Chat with AUTO',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    AutoChatPanel.current = new AutoChatPanel(panel, deps);
    context.subscriptions.push(panel);
  }

  private readonly disposables: vscode.Disposable[] = [];
  private conversation: AutoConversation = EMPTY_CONVERSATION;
  private sending = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private deps: AutoChatDeps,
  ) {
    this.panel.webview.onDidReceiveMessage((msg) => void this.onMessage(msg), null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.paint(this.conversation);
  }

  /** Repaint the webview from a conversation snapshot, optionally with a "thinking" row. */
  private paint(conversation: AutoConversation, pending?: string): void {
    this.panel.webview.html = renderChatHtml(toChatMessages(conversation, this.deps.me), {
      nonce: makeNonce(),
      me: this.deps.me,
      placeholder: 'Message AUTO…',
      pending,
    });
  }

  private async onMessage(msg: unknown): Promise<void> {
    if (!isSendMessage(msg) || this.sending) {
      return;
    }
    const text = msg.text.trim();
    if (!text) {
      return;
    }
    this.sending = true;
    // Echo the user's turn immediately with a "thinking" row so a slow reply still feels live.
    const echo = appendTurn(this.conversation, { role: 'user', text, at: new Date().toISOString() });
    this.paint(echo, 'AUTO is thinking…');
    try {
      this.conversation = await sendToAuto(
        this.conversation,
        text,
        this.deps.client,
        () => new Date().toISOString(),
      );
    } catch (error) {
      vscode.window.showErrorMessage(`AUTO chat: ${(error as Error).message}`);
    } finally {
      this.sending = false;
      this.paint(this.conversation);
    }
  }

  private dispose(): void {
    AutoChatPanel.current = undefined;
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
