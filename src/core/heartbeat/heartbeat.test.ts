import { describe, it, expect } from 'vitest';
import {
  Heartbeat,
  parseHeartbeat,
  serializeHeartbeat,
  isStale,
  ageMs,
  stalenessThresholdMs,
  writeHeartbeat,
  readHeartbeats,
  staleAgents,
  heartbeatPath,
  heartbeatPathForCard,
} from './heartbeat';
import { FakeFileStore } from '../../test/fakeFs';

const beat = (over: Partial<Heartbeat> = {}): Heartbeat => ({
  agent: 'agent-1',
  card: 'PRD-1',
  status: 'building',
  at: '2026-06-06T00:00:00Z',
  ...over,
});

describe('heartbeat serialize/parse round-trip', () => {
  it('parses what it serializes', () => {
    const hb = beat();
    expect(parseHeartbeat(serializeHeartbeat(hb))).toEqual(hb);
  });

  it('reads a null card (idle worker) back as null', () => {
    expect(parseHeartbeat(serializeHeartbeat(beat({ card: null }))).card).toBeNull();
  });

  it('rejects a beat missing required fields', () => {
    expect(() => parseHeartbeat('{"agent":"a","status":"x"}')).toThrow(/"at" is required/);
  });

  it('rejects a non-timestamp "at"', () => {
    expect(() => parseHeartbeat('{"agent":"a","status":"x","at":"not-a-date"}')).toThrow(
      /not a valid timestamp/,
    );
  });
});

describe('heartbeat file paths', () => {
  it('keys the agent path by agent', () => {
    expect(heartbeatPath('worker-7')).toBe('.heartbeats/worker-7.json');
  });

  it('keys the card path by card id so concurrent workers never collide', () => {
    expect(heartbeatPathForCard('PRD-0007')).toBe('.heartbeats/PRD-0007.json');
    expect(heartbeatPathForCard('PRD-1')).not.toBe(heartbeatPathForCard('PRD-2'));
  });

  it('lands in the dir readHeartbeats scans, so a card-keyed beat is discoverable', async () => {
    const store = new FakeFileStore();
    store.seed(
      heartbeatPathForCard('PRD-9'),
      serializeHeartbeat(beat({ agent: 'ann', card: 'PRD-9' })),
    );
    const all = await readHeartbeats(store);
    expect(all.map((b) => b.card)).toEqual(['PRD-9']);
  });
});

describe('staleness', () => {
  const threshold = stalenessThresholdMs(10); // 3 missed 10s beats = 30_000ms

  it('treats a fresh beat as alive', () => {
    expect(isStale(beat({ at: '2026-06-06T00:00:00Z' }), '2026-06-06T00:00:25Z', threshold)).toBe(
      false,
    );
  });

  it('treats a beat older than the threshold as dead', () => {
    expect(isStale(beat({ at: '2026-06-06T00:00:00Z' }), '2026-06-06T00:00:31Z', threshold)).toBe(
      true,
    );
  });

  it('measures age in ms between beat and now', () => {
    expect(ageMs(beat({ at: '2026-06-06T00:00:00Z' }), '2026-06-06T00:00:05Z')).toBe(5000);
  });
});

describe('heartbeat store', () => {
  it('writes to .heartbeats/<agent>.json and reads it back', async () => {
    const store = new FakeFileStore();
    await writeHeartbeat(store, beat({ agent: 'worker-7' }));
    expect(store.has(heartbeatPath('worker-7'))).toBe(true);
    const all = await readHeartbeats(store);
    expect(all.map((b) => b.agent)).toEqual(['worker-7']);
  });

  it('skips a corrupt beat instead of throwing', async () => {
    const store = new FakeFileStore();
    await writeHeartbeat(store, beat({ agent: 'good' }));
    store.seed('.heartbeats/bad.json', '{ not valid json');
    const all = await readHeartbeats(store);
    expect(all.map((b) => b.agent)).toEqual(['good']);
  });

  it('finds only the agents whose last beat is stale', async () => {
    const store = new FakeFileStore();
    await writeHeartbeat(store, beat({ agent: 'alive', at: '2026-06-06T00:00:20Z' }));
    await writeHeartbeat(store, beat({ agent: 'dead', at: '2026-06-06T00:00:00Z' }));
    const stale = staleAgents(await readHeartbeats(store), '2026-06-06T00:00:31Z', stalenessThresholdMs(10));
    expect(stale.map((b) => b.agent)).toEqual(['dead']);
  });
});
