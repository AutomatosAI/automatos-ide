import { describe, it, expect } from 'vitest';
import { Card } from '../cards/card';
import { Heartbeat, stalenessThresholdMs } from './heartbeat';
import { workerLiveness } from './liveness';

function card(id: string, owner: string): Card {
  return {
    id,
    title: id,
    project: 'ide',
    status: 'in-progress',
    owner,
    branch: `feat/${id.toLowerCase()}`,
    priority: 3,
    created: '2026-01-01',
    updated: null,
    engine: null,
    validationCriteria: [],
    body: '',
  };
}

function beat(over: Partial<Heartbeat> = {}): Heartbeat {
  return { agent: 'me', card: 'PRD-1', status: 'building', at: '2026-06-06T00:00:00Z', ...over };
}

const THRESHOLD = stalenessThresholdMs(10); // 30s

describe('workerLiveness', () => {
  it('marks a recent beat live with its age', () => {
    const rows = workerLiveness(
      [card('PRD-1', 'me')],
      [beat({ at: '2026-06-06T00:00:00Z' })],
      '2026-06-06T00:00:05Z',
      THRESHOLD,
    );
    expect(rows).toEqual([{ cardId: 'PRD-1', owner: 'me', state: 'live', sinceMs: 5000 }]);
  });

  it('marks a beat older than the threshold stale', () => {
    const rows = workerLiveness(
      [card('PRD-1', 'me')],
      [beat({ at: '2026-06-06T00:00:00Z' })],
      '2026-06-06T00:01:00Z', // 60s later, threshold is 30s
      THRESHOLD,
    );
    expect(rows[0].state).toBe('stale');
    expect(rows[0].sinceMs).toBe(60000);
  });

  it('reports no-beat (not dead) when the card has no heartbeat', () => {
    const rows = workerLiveness([card('PRD-9', 'me')], [], '2026-06-06T00:00:05Z', THRESHOLD);
    expect(rows).toEqual([{ cardId: 'PRD-9', owner: 'me', state: 'no-beat', sinceMs: null }]);
  });

  it('joins each card to the beat that names it', () => {
    const rows = workerLiveness(
      [card('PRD-1', 'ann'), card('PRD-2', 'bob')],
      [
        beat({ agent: 'ann', card: 'PRD-1', at: '2026-06-06T00:00:04Z' }),
        beat({ agent: 'bob', card: 'PRD-2', at: '2026-06-06T00:00:00Z' }),
      ],
      '2026-06-06T00:00:05Z',
      THRESHOLD,
    );
    expect(rows.map((r) => [r.cardId, r.sinceMs])).toEqual([
      ['PRD-1', 1000],
      ['PRD-2', 5000],
    ]);
  });

  it('uses the newest beat when several name the same card', () => {
    const rows = workerLiveness(
      [card('PRD-1', 'me')],
      [
        beat({ at: '2026-06-06T00:00:00Z' }),
        beat({ at: '2026-06-06T00:00:04Z' }),
        beat({ at: '2026-06-06T00:00:02Z' }),
      ],
      '2026-06-06T00:00:05Z',
      THRESHOLD,
    );
    expect(rows[0].sinceMs).toBe(1000);
  });
});
