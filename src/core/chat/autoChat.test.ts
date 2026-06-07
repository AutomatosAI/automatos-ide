import { describe, it, expect } from 'vitest';
import {
  AUTO_HANDLE,
  AutoChatClient,
  AutoConversation,
  AutoReply,
  EMPTY_CONVERSATION,
  appendTurn,
  sendToAuto,
  toChatMessages,
  withConversationId,
} from './autoChat';

/** Deterministic, strictly-increasing ISO clock so turn timestamps are assertable. */
function clock(): () => string {
  let n = 0;
  return () => `2026-06-07T00:00:${String(n++).padStart(2, '0')}Z`;
}

/** A fake transport that records how it was called and returns a fixed reply. */
function recordingClient(reply: AutoReply): {
  readonly client: AutoChatClient;
  readonly calls: Array<{ content: string; conversationId: string | null }>;
} {
  const calls: Array<{ content: string; conversationId: string | null }> = [];
  const client: AutoChatClient = {
    async send(content, conversationId) {
      calls.push({ content, conversationId });
      return reply;
    },
  };
  return { client, calls };
}

describe('appendTurn', () => {
  it('appends a turn without mutating the input', () => {
    const conv: AutoConversation = { conversationId: 'c1', turns: [] };
    const next = appendTurn(conv, { role: 'user', text: 'hi', at: 't0' });
    expect(next.turns).toHaveLength(1);
    expect(next.conversationId).toBe('c1');
    expect(conv.turns).toHaveLength(0);
  });
});

describe('withConversationId', () => {
  it('sets the id', () => {
    expect(withConversationId(EMPTY_CONVERSATION, 'c9').conversationId).toBe('c9');
  });

  it('returns the same reference when the id is unchanged', () => {
    const conv = withConversationId(EMPTY_CONVERSATION, 'c9');
    expect(withConversationId(conv, 'c9')).toBe(conv);
  });
});

describe('sendToAuto', () => {
  it('appends the user turn then the assistant reply, carrying the conversation id forward', async () => {
    const { client, calls } = recordingClient({ text: 'hello from auto', conversationId: 'conv-1' });

    const next = await sendToAuto(EMPTY_CONVERSATION, '  hey auto  ', client, clock());

    expect(next.turns).toEqual([
      { role: 'user', text: 'hey auto', at: '2026-06-07T00:00:00Z' },
      { role: 'assistant', text: 'hello from auto', at: '2026-06-07T00:00:01Z' },
    ]);
    expect(next.conversationId).toBe('conv-1');
    expect(calls).toEqual([{ content: 'hey auto', conversationId: null }]);
  });

  it('does not mutate the input conversation', async () => {
    const { client } = recordingClient({ text: 'a', conversationId: 'conv-1' });
    await sendToAuto(EMPTY_CONVERSATION, 'one', client, clock());
    expect(EMPTY_CONVERSATION.turns).toHaveLength(0);
    expect(EMPTY_CONVERSATION.conversationId).toBeNull();
  });

  it('reuses the established conversation id on the next send', async () => {
    const first = await sendToAuto(
      EMPTY_CONVERSATION,
      'one',
      recordingClient({ text: 'a', conversationId: 'conv-1' }).client,
      clock(),
    );
    const { client, calls } = recordingClient({ text: 'b', conversationId: 'conv-1' });

    await sendToAuto(first, 'two', client, clock());

    expect(calls[0]).toEqual({ content: 'two', conversationId: 'conv-1' });
  });
});

describe('toChatMessages', () => {
  it('maps turns to the chat-view shape, attributing the reader and AUTO', () => {
    const conv: AutoConversation = {
      conversationId: 'c1',
      turns: [
        { role: 'user', text: 'hi', at: 't0' },
        { role: 'assistant', text: 'yo', at: 't1' },
      ],
    };
    expect(toChatMessages(conv, 'gerard')).toEqual([
      { id: 'auto-0', from: 'gerard', to: null, at: 't0', text: 'hi' },
      { id: 'auto-1', from: AUTO_HANDLE, to: null, at: 't1', text: 'yo' },
    ]);
  });

  it('returns an empty transcript for an empty conversation', () => {
    expect(toChatMessages(EMPTY_CONVERSATION, 'me')).toEqual([]);
  });
});
