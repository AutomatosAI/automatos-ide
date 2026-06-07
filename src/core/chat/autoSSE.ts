import type { AutoReply } from './autoChat';

/**
 * Pure parsing of the Automatos widget-chat SSE stream into an {@link AutoReply}.
 *
 * The wire transport (fetch, auth, the open socket) is the host's job; this module only
 * folds the raw event-stream text the server returns into the assistant's text plus the
 * server thread id. Keeping it pure means the protocol is unit-tested without a network.
 *
 * Event contract (POST /api/widgets/chat): `message` carries an assistant text delta in
 * `data.content`; `done` carries the thread id in `data.conversation_id`; `error` carries a
 * human message in `data.message`; tool lifecycle events (`tool-start`/`tool-end`/…) carry
 * no transcript text and are ignored here.
 */

export interface SSEEvent {
  readonly event: string;
  readonly data: unknown;
}

/** Parse raw `text/event-stream` bytes into discrete events, JSON-decoding each `data:` payload. */
export function parseSSE(raw: string): readonly SSEEvent[] {
  const events: SSEEvent[] = [];
  for (const block of raw.replace(/\r\n/g, '\n').split('\n\n')) {
    let name = 'message';
    const dataLines: string[] = [];
    let hasField = false;
    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) {
        continue;
      }
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const rawValue = colon === -1 ? '' : line.slice(colon + 1);
      const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
      if (field === 'event') {
        name = value;
        hasField = true;
      } else if (field === 'data') {
        dataLines.push(value);
        hasField = true;
      }
    }
    if (hasField) {
      events.push({ event: name, data: decodeData(dataLines.join('\n')) });
    }
  }
  return events;
}

/**
 * Fold a parsed event stream into the assistant reply.
 *
 * Accumulates `message` deltas into the final text, takes the thread id from `done`, and
 * throws on an `error` event. `fallbackConversationId` (the thread we were continuing) is
 * used when the server omits the id on a continuation; with neither, the stream is malformed.
 */
export function reduceAutoStream(
  events: readonly SSEEvent[],
  fallbackConversationId?: string,
): AutoReply {
  let text = '';
  let conversationId = fallbackConversationId;
  for (const { event, data } of events) {
    if (event === 'error') {
      throw new Error(stringField(data, 'message') ?? 'AUTO chat failed');
    }
    if (event === 'message') {
      text += stringField(data, 'content') ?? '';
    } else if (event === 'done') {
      conversationId = stringField(data, 'conversation_id') ?? conversationId;
    }
  }
  if (conversationId === undefined) {
    throw new Error('AUTO reply did not include a conversation id');
  }
  return { text, conversationId };
}

/** JSON-decode an event payload, leaving it as the raw string when it is not JSON. */
function decodeData(raw: string): unknown {
  if (raw === '') {
    return '';
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function stringField(data: unknown, key: string): string | undefined {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}
