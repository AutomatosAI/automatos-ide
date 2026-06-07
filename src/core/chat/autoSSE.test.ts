import { describe, it, expect } from 'vitest';
import { parseSSE, reduceAutoStream } from './autoSSE';

describe('parseSSE', () => {
  it('parses an event with a JSON data payload', () => {
    const events = parseSSE('event: message\ndata: {"content":"hi"}\n\n');
    expect(events).toEqual([{ event: 'message', data: { content: 'hi' } }]);
  });

  it('parses several events separated by blank lines', () => {
    const events = parseSSE(
      'event: message\ndata: {"content":"a"}\n\nevent: done\ndata: {"conversation_id":"c1"}\n\n',
    );
    expect(events).toEqual([
      { event: 'message', data: { content: 'a' } },
      { event: 'done', data: { conversation_id: 'c1' } },
    ]);
  });

  it('tolerates CRLF line endings and a missing space after the colon', () => {
    const events = parseSSE('event:message\r\ndata:{"content":"x"}\r\n\r\n');
    expect(events).toEqual([{ event: 'message', data: { content: 'x' } }]);
  });

  it('joins multiple data lines with a newline', () => {
    const events = parseSSE('data: line one\ndata: line two\n\n');
    expect(events).toEqual([{ event: 'message', data: 'line one\nline two' }]);
  });

  it('ignores comment lines and trailing noise', () => {
    const events = parseSSE(': keep-alive\n\nevent: done\ndata: {"conversation_id":"c9"}\n\n\n');
    expect(events).toEqual([{ event: 'done', data: { conversation_id: 'c9' } }]);
  });

  it('keeps a non-JSON payload as a raw string', () => {
    const events = parseSSE('event: message\ndata: not-json\n\n');
    expect(events).toEqual([{ event: 'message', data: 'not-json' }]);
  });

  it('returns nothing for an empty stream', () => {
    expect(parseSSE('')).toEqual([]);
  });
});

describe('reduceAutoStream', () => {
  it('accumulates message deltas and takes the conversation id from done', () => {
    const reply = reduceAutoStream([
      { event: 'message', data: { content: 'Hel' } },
      { event: 'message', data: { content: 'lo' } },
      { event: 'done', data: { conversation_id: 'conv-1' } },
    ]);
    expect(reply).toEqual({ text: 'Hello', conversationId: 'conv-1' });
  });

  it('ignores tool lifecycle events', () => {
    const reply = reduceAutoStream([
      { event: 'tool-start', data: { name: 'search' } },
      { event: 'message', data: { content: 'done thinking' } },
      { event: 'tool-end', data: { name: 'search' } },
      { event: 'done', data: { conversation_id: 'conv-2' } },
    ]);
    expect(reply).toEqual({ text: 'done thinking', conversationId: 'conv-2' });
  });

  it('throws with the server message on an error event', () => {
    expect(() =>
      reduceAutoStream([{ event: 'error', data: { message: 'rate limited' } }]),
    ).toThrow(/rate limited/);
  });

  it('falls back to the continued conversation id when done omits one', () => {
    const reply = reduceAutoStream(
      [{ event: 'message', data: { content: 'more' } }],
      'conv-prev',
    );
    expect(reply).toEqual({ text: 'more', conversationId: 'conv-prev' });
  });

  it('prefers a fresh done id over the fallback', () => {
    const reply = reduceAutoStream(
      [{ event: 'done', data: { conversation_id: 'conv-new' } }],
      'conv-prev',
    );
    expect(reply.conversationId).toBe('conv-new');
  });

  it('throws when no conversation id is available at all', () => {
    expect(() => reduceAutoStream([{ event: 'message', data: { content: 'x' } }])).toThrow(
      /conversation id/,
    );
  });
});
