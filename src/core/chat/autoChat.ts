import type { ChatMessage } from './maildir';

/**
 * A conversation with AUTO — the persistent orchestrator agent — over Automatos.
 *
 * Distinct from the team maildir ({@link ./maildir}): that is human↔human over git; this is
 * the user talking to the AUTO agent through the Automatos widget-chat endpoint. The wire
 * transport (auth, fetch, SSE) is the host's job and enters only through {@link AutoChatClient},
 * so everything here stays pure, vscode-free, and unit-tested. State is immutable: every fold
 * returns a NEW {@link AutoConversation}; the input is never mutated. The transcript is rendered
 * by reusing the team {@link renderChatHtml} via {@link toChatMessages}.
 */

/** The handle AUTO's turns are attributed to in the rendered transcript. */
export const AUTO_HANDLE = 'AUTO';

/** One turn in a conversation with AUTO. */
export interface AutoTurn {
  readonly role: 'user' | 'assistant';
  readonly text: string;
  /** ISO timestamp the turn was recorded. */
  readonly at: string;
}

/** Immutable state of an AUTO conversation: the server thread id (null until the first reply) and the turns so far. */
export interface AutoConversation {
  readonly conversationId: string | null;
  readonly turns: readonly AutoTurn[];
}

export const EMPTY_CONVERSATION: AutoConversation = { conversationId: null, turns: [] };

/** AUTO's reply to a single message, plus the server thread id to continue. */
export interface AutoReply {
  readonly text: string;
  readonly conversationId: string;
}

/**
 * The transport seam: send one message to AUTO and await its reply.
 *
 * Implemented at the host boundary over the Automatos widget-chat endpoint; faked in tests so
 * the conversation logic needs no network. `conversationId` is null on the first message of a
 * thread and the server-assigned id thereafter.
 */
export interface AutoChatClient {
  send(content: string, conversationId: string | null): Promise<AutoReply>;
}

/** Append a turn, returning a new conversation. */
export function appendTurn(conversation: AutoConversation, turn: AutoTurn): AutoConversation {
  return { ...conversation, turns: [...conversation.turns, turn] };
}

/** Carry the server thread id forward, returning the same reference when it is unchanged. */
export function withConversationId(conversation: AutoConversation, conversationId: string): AutoConversation {
  return conversation.conversationId === conversationId
    ? conversation
    : { ...conversation, conversationId };
}

/**
 * Send `content` to AUTO and fold the exchange into a new conversation.
 *
 * Records the user turn first, then the assistant turn once the reply lands, carrying the
 * server thread id forward so the next send continues the same conversation. Pure given an
 * injected clock and client; the input conversation is never mutated. The caller (host) is
 * responsible for rejecting empty input — mirrors the team-chat boundary guard.
 */
export async function sendToAuto(
  conversation: AutoConversation,
  content: string,
  client: AutoChatClient,
  now: () => string,
): Promise<AutoConversation> {
  const text = content.trim();
  const withUser = appendTurn(conversation, { role: 'user', text, at: now() });
  const reply = await client.send(text, conversation.conversationId);
  return appendTurn(withConversationId(withUser, reply.conversationId), {
    role: 'assistant',
    text: reply.text,
    at: now(),
  });
}

/** Render an AUTO conversation in the maildir {@link ChatMessage} shape so the existing chat view can draw it. */
export function toChatMessages(conversation: AutoConversation, me: string): readonly ChatMessage[] {
  return conversation.turns.map((turn, index) => ({
    id: `auto-${index}`,
    from: turn.role === 'user' ? me : AUTO_HANDLE,
    to: null,
    at: turn.at,
    text: turn.text,
  }));
}
