import { describe, it, expect } from 'vitest';
import { FakeFileStore } from '../../test/fakeFs';
import {
  ChatMessage,
  Mailbox,
  messageId,
  messagePath,
  composeMessage,
  serializeMessage,
  parseMessage,
  isVisibleTo,
  inbox,
  sendMessage,
  readMessages,
  route,
} from './maildir';

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: '2026-06-06T12-00-00Z-alice-n1',
    from: 'alice',
    to: null,
    at: '2026-06-06T12:00:00Z',
    text: 'hello team',
    ...over,
  };
}

function mailbox(handle: string, channels: string[] = []): Mailbox {
  return { handle, channels: new Set(channels) };
}

describe('messageId / messagePath', () => {
  it('builds a sortable, filesystem-safe id from time, author, and nonce', () => {
    expect(messageId('2026-06-06T12:00:00.500Z', 'auto', 'a1b2')).toBe(
      '2026-06-06T12-00-00-500Z-auto-a1b2',
    );
  });

  it('lands the message under chat/', () => {
    expect(messagePath('x-y-z')).toBe('chat/x-y-z.md');
  });
});

describe('composeMessage', () => {
  it('stamps an id from the context and trims the body', () => {
    const m = composeMessage(
      { from: 'alice', to: '#general', text: '  hi  ' },
      { at: '2026-06-06T12:00:00Z', nonce: 'n1' },
    );
    expect(m).toEqual({
      id: '2026-06-06T12-00-00Z-alice-n1',
      from: 'alice',
      to: '#general',
      at: '2026-06-06T12:00:00Z',
      text: 'hi',
    });
  });
});

describe('serializeMessage / parseMessage', () => {
  it('round-trips a direct message', () => {
    const original = msg({ to: 'bob', text: 'just you' });
    expect(parseMessage(serializeMessage(original))).toEqual(original);
  });

  it('round-trips a broadcast (null recipient)', () => {
    const original = msg({ to: null });
    expect(parseMessage(serializeMessage(original))).toEqual(original);
  });

  it('rejects a message missing its author', () => {
    expect(() => parseMessage('---\nid: x\nat: 2026\n---\nhi')).toThrow(/from/);
  });

  it('rejects frontmatter that is not a mapping', () => {
    expect(() => parseMessage('---\n- a\n- b\n---\nhi')).toThrow(/mapping/);
  });
});

describe('isVisibleTo', () => {
  const bob = mailbox('bob', ['#general']);

  it('shows broadcasts to everyone', () => {
    expect(isVisibleTo(msg({ from: 'alice', to: null }), bob)).toBe(true);
  });

  it('shows direct messages addressed to the reader', () => {
    expect(isVisibleTo(msg({ from: 'alice', to: 'bob' }), bob)).toBe(true);
  });

  it('shows the reader their own sends', () => {
    expect(isVisibleTo(msg({ from: 'bob', to: 'alice' }), bob)).toBe(true);
  });

  it('shows channel messages only to members of that channel', () => {
    expect(isVisibleTo(msg({ from: 'alice', to: '#general' }), bob)).toBe(true);
    expect(isVisibleTo(msg({ from: 'alice', to: '#secret' }), bob)).toBe(false);
  });

  it('hides direct messages to someone else', () => {
    expect(isVisibleTo(msg({ from: 'alice', to: 'carol' }), bob)).toBe(false);
  });
});

describe('inbox', () => {
  it('filters to the reader’s messages, oldest first', () => {
    const messages = [
      msg({ id: 'm3', from: 'alice', to: 'carol', at: '2026-06-06T03:00:00Z' }), // not for bob
      msg({ id: 'm1', from: 'alice', to: null, at: '2026-06-06T01:00:00Z' }),
      msg({ id: 'm2', from: 'bob', to: 'alice', at: '2026-06-06T02:00:00Z' }),
    ];
    expect(inbox(messages, mailbox('bob')).map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('sendMessage / readMessages', () => {
  it('writes a message to its maildir path', async () => {
    const store = new FakeFileStore();
    await sendMessage(store, msg({ id: 'abc' }));
    expect(store.has('chat/abc.md')).toBe(true);
  });

  it('reads the whole transcript oldest first', async () => {
    const store = new FakeFileStore();
    await sendMessage(store, msg({ id: 'b', at: '2026-06-06T02:00:00Z', text: 'second' }));
    await sendMessage(store, msg({ id: 'a', at: '2026-06-06T01:00:00Z', text: 'first' }));
    expect((await readMessages(store)).map((m) => m.text)).toEqual(['first', 'second']);
  });

  it('skips a malformed message file', async () => {
    const store = new FakeFileStore();
    await sendMessage(store, msg({ id: 'good', text: 'kept' }));
    store.seed('chat/garbage.md', 'not a message');
    expect((await readMessages(store)).map((m) => m.text)).toEqual(['kept']);
  });

  it('two authors posting concurrently produce two distinct files', async () => {
    const store = new FakeFileStore();
    const a = composeMessage({ from: 'alice', to: null, text: 'a' }, { at: '2026-06-06T12:00:00Z', nonce: 'x' });
    const b = composeMessage({ from: 'bob', to: null, text: 'b' }, { at: '2026-06-06T12:00:00Z', nonce: 'y' });
    await sendMessage(store, a);
    await sendMessage(store, b);
    expect(store.has(messagePath(a.id))).toBe(true);
    expect(store.has(messagePath(b.id))).toBe(true);
    expect(a.id).not.toBe(b.id);
  });
});

describe('route', () => {
  it('reads the transcript and routes it to one mailbox end to end', async () => {
    const store = new FakeFileStore();
    await sendMessage(store, msg({ id: 'm1', from: 'alice', to: null, at: '2026-06-06T01:00:00Z', text: 'all' }));
    await sendMessage(store, msg({ id: 'm2', from: 'alice', to: 'bob', at: '2026-06-06T02:00:00Z', text: 'dm' }));
    await sendMessage(store, msg({ id: 'm3', from: 'alice', to: 'carol', at: '2026-06-06T03:00:00Z', text: 'nope' }));
    const seen = await route(store, mailbox('bob'));
    expect(seen.map((m) => m.text)).toEqual(['all', 'dm']);
  });
});
