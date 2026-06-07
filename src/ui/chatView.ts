import { ChatMessage } from '../core/chat/maildir';
import { escapeHtml } from './html';

/**
 * Render a chat transcript to webview HTML — the M4 team-chat view (24 §4).
 *
 * Pure: messages in, HTML out, unit-tested without VS Code. The compose box posts
 * `{type:'send', text}` back to the extension, which writes a new maildir file and
 * pushes. Author handles and bodies are untrusted, so every interpolation is escaped.
 */

export interface ChatViewOptions {
  /** CSP nonce for the inline send script. */
  readonly nonce?: string;
  /** The reader's own handle, so their messages can be marked. */
  readonly me?: string;
  /** Compose-box placeholder; defaults to the team-chat prompt. */
  readonly placeholder?: string;
  /** A muted "…is typing" row shown under the transcript while a reply is in flight. */
  readonly pending?: string;
}

const DEFAULT_PLACEHOLDER = 'Message the team…';

export function renderChatHtml(
  messages: readonly ChatMessage[],
  options: ChatViewOptions = {},
): string {
  const nonce = options.nonce ?? '';
  const placeholder = escapeHtml(options.placeholder ?? DEFAULT_PLACEHOLDER);
  const pending = options.pending
    ? `<div class="msg pending"><div class="text">${escapeHtml(options.pending)}</div></div>`
    : '';
  const body =
    messages.length === 0 && !pending
      ? '<div class="empty">No messages yet.</div>'
      : messages.map((m) => renderMessage(m, options.me)).join('\n') + pending;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; display: flex; flex-direction: column; height: 100vh; }
  .transcript { flex: 1; overflow-y: auto; padding: 8px; }
  .msg { margin-bottom: 8px; }
  .msg.me { text-align: right; }
  .msg .who { font-size: 11px; opacity: 0.6; }
  .msg .text { white-space: pre-wrap; }
  .empty { opacity: 0.4; font-style: italic; padding: 8px; }
  .msg.pending .text { opacity: 0.5; font-style: italic; }
  form { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--vscode-widget-border); }
  textarea { flex: 1; resize: none; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 4px 12px; cursor: pointer; }
</style>
</head>
<body>
<div class="transcript">
${body}
</div>
<form id="compose">
  <textarea id="text" rows="2" placeholder="${placeholder}"></textarea>
  <button type="submit">Send</button>
</form>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('compose');
  const text = document.getElementById('text');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = text.value.trim();
    if (value) {
      vscode.postMessage({ type: 'send', text: value });
      text.value = '';
    }
  });
</script>
</body>
</html>`;
}

function renderMessage(msg: ChatMessage, me?: string): string {
  const mine = me !== undefined && msg.from === me;
  const to = msg.to ? ` → ${escapeHtml(msg.to)}` : '';
  return `<div class="msg${mine ? ' me' : ''}">
    <div class="who">${escapeHtml(msg.from)}${to} · ${escapeHtml(msg.at)}</div>
    <div class="text">${escapeHtml(msg.text)}</div>
  </div>`;
}
