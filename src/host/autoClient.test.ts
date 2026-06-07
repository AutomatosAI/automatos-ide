import { describe, it, expect } from 'vitest';
import { createAutoClient, FetchLike } from './autoClient';

interface Capture {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
}

/** A fake fetch that records the call and returns a canned SSE body. */
function fakeFetch(body: string, ok = true, status = 200): { fetchImpl: FetchLike; calls: Capture[] } {
  const calls: Capture[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, text: async () => body };
  };
  return { fetchImpl, calls };
}

const DONE = 'event: message\ndata: {"content":"hi there"}\n\nevent: done\ndata: {"conversation_id":"conv-1"}\n\n';

describe('createAutoClient', () => {
  it('POSTs to the widget-chat endpoint with the publishable key and parses the reply', async () => {
    const { fetchImpl, calls } = fakeFetch(DONE);
    const client = createAutoClient({
      baseUrl: 'https://api.automatos.app',
      apiKey: 'ak_pub_test',
      agentId: 'agent-7',
      fetchImpl,
    });

    const reply = await client.send('hey', null);

    expect(reply).toEqual({ text: 'hi there', conversationId: 'conv-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.automatos.app/api/widgets/chat');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers.Authorization).toBe('Bearer ak_pub_test');
    expect(calls[0].init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(calls[0].init.body)).toEqual({ message: 'hey', agent_id: 'agent-7' });
  });

  it('omits agent_id when none is configured and carries conversation_id on a continuation', async () => {
    const { fetchImpl, calls } = fakeFetch(DONE);
    const client = createAutoClient({
      baseUrl: 'https://api.automatos.app',
      apiKey: 'ak_pub_test',
      agentId: null,
      fetchImpl,
    });

    await client.send('again', 'conv-1');

    expect(JSON.parse(calls[0].init.body)).toEqual({ message: 'again', conversation_id: 'conv-1' });
  });

  it('sends an Origin header only when configured', async () => {
    const { fetchImpl, calls } = fakeFetch(DONE);
    const client = createAutoClient({
      baseUrl: 'https://api.automatos.app',
      apiKey: 'ak_pub_test',
      agentId: null,
      origin: 'https://app.automatos.app',
      fetchImpl,
    });

    await client.send('hi', null);

    expect(calls[0].init.headers.Origin).toBe('https://app.automatos.app');
  });

  it('throws on a non-2xx response', async () => {
    const { fetchImpl } = fakeFetch('', false, 401);
    const client = createAutoClient({
      baseUrl: 'https://api.automatos.app',
      apiKey: 'ak_pub_bad',
      agentId: null,
      fetchImpl,
    });

    await expect(client.send('hi', null)).rejects.toThrow(/HTTP 401/);
  });
});
