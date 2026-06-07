import type { AutoChatClient, AutoReply } from '../core/chat/autoChat';
import { parseSSE, reduceAutoStream } from '../core/chat/autoSSE';

/**
 * The host-side {@link AutoChatClient}: one POST to the Automatos widget-chat endpoint per turn.
 *
 * Deliberately dependency-free — Node's global `fetch` plus the pure {@link reduceAutoStream}
 * fold — so the extension gains no new runtime dependency over the wire contract the browser
 * SDK also speaks. The publishable key (`ak_pub_*`, client-safe, origin-restricted) is sent raw
 * as a Bearer token; the secret `ak_srv_*` key must NEVER reach this path. v1 reads the whole
 * event stream then renders the final message rather than streaming token-by-token.
 */

/** Minimal shape of `fetch` we depend on, so we need no DOM/undici types to build or test this. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface AutoClientConfig {
  /** Automatos API base, e.g. `https://api.automatos.app` (no trailing slash). */
  readonly baseUrl: string;
  /** Publishable workspace key, `ak_pub_*`. */
  readonly apiKey: string;
  /** AUTO agent public id, or null to use the workspace default agent. */
  readonly agentId: string | null;
  /** Origin to present for an origin-restricted publishable key, when the workspace requires one. */
  readonly origin?: string;
  /** Injected for tests; defaults to the Node global `fetch`. */
  readonly fetchImpl?: FetchLike;
}

export function createAutoClient(config: AutoClientConfig): AutoChatClient {
  const doFetch = config.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  return {
    async send(content: string, conversationId: string | null): Promise<AutoReply> {
      const res = await doFetch(`${config.baseUrl}/api/widgets/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${config.apiKey}`,
          ...(config.origin ? { Origin: config.origin } : {}),
        },
        body: JSON.stringify({
          message: content,
          ...(conversationId ? { conversation_id: conversationId } : {}),
          ...(config.agentId ? { agent_id: config.agentId } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(`AUTO chat request failed (HTTP ${res.status})`);
      }
      return reduceAutoStream(parseSSE(await res.text()), conversationId ?? undefined);
    },
  };
}
