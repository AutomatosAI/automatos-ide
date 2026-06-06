import { describe, it, expect } from 'vitest';
import { ChatMessage } from '../core/chat/maildir';
import { renderChatHtml } from './chatView';

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    from: 'alice',
    to: null,
    at: '2026-06-06T12:00:00Z',
    text: 'hello team',
    ...over,
  };
}

describe('renderChatHtml', () => {
  it('renders each message’s author, time, and body', () => {
    const html = renderChatHtml([msg({ from: 'bob', text: 'hi', at: '2026-06-06T01:00:00Z' })]);
    expect(html).toContain('bob');
    expect(html).toContain('2026-06-06T01:00:00Z');
    expect(html).toContain('hi');
  });

  it('shows the recipient on a directed message', () => {
    expect(renderChatHtml([msg({ to: '#general' })])).toContain('→ #general');
  });

  it('marks the reader’s own messages', () => {
    const html = renderChatHtml([msg({ from: 'me' })], { me: 'me' });
    expect(html).toContain('class="msg me"');
  });

  it('escapes untrusted message bodies and handles', () => {
    const html = renderChatHtml([msg({ from: '<b>x</b>', text: '<script>alert(1)</script>' })]);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<script>alert(1)');
  });

  it('shows an empty state with no messages', () => {
    expect(renderChatHtml([])).toContain('No messages yet.');
  });

  it('includes a compose form wired to the nonce', () => {
    const html = renderChatHtml([], { nonce: 'n0' });
    expect(html).toContain('<form id="compose">');
    expect(html).toContain('<script nonce="n0">');
  });
});
