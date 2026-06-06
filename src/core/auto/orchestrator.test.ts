import { describe, it, expect } from 'vitest';
import { Card } from '../cards/card';
import { tick, Ledger, TickInput } from './orchestrator';

function inProgressCard(id: string, owner: string | null): Card {
  return {
    id,
    title: id,
    project: 'ide',
    status: 'in-progress',
    owner,
    branch: owner ? `feat/${id}` : null,
    priority: 1,
    created: '2026-01-01',
    updated: '2026-06-01T00:00:00Z',
    engine: null,
    validationCriteria: [],
    body: '',
  };
}

function input(over: Partial<TickInput> = {}): TickInput {
  return {
    inProgress: [],
    liveOwners: new Set<string>(),
    prevLedger: {},
    stallLimit: 3,
    ...over,
  };
}

describe('tick — reclaiming dead workers', () => {
  it('reclaims a card whose owner has no live heartbeat', () => {
    const result = tick(
      input({
        inProgress: [inProgressCard('PRD-1', 'ghost')],
        liveOwners: new Set(), // ghost is gone
      }),
    );
    expect(result.actions).toEqual([
      { kind: 'reclaim', cardId: 'PRD-1', reason: expect.stringContaining('not alive') },
    ]);
    expect(result.ledger['PRD-1']).toBeUndefined(); // dropped from the ledger
  });

  it('leaves a card with a live owner alone', () => {
    const result = tick(
      input({
        inProgress: [inProgressCard('PRD-1', 'agent-1')],
        liveOwners: new Set(['agent-1']),
      }),
    );
    expect(result.actions).toEqual([]);
    expect(result.ledger['PRD-1']).toMatchObject({ owner: 'agent-1', stallCycles: 0 });
  });
});

describe('tick — stall counting', () => {
  it('increments the stall counter while the same owner holds the card', () => {
    const prev: Ledger = { 'PRD-1': { cardId: 'PRD-1', owner: 'agent-1', stallCycles: 1 } };
    const result = tick(
      input({
        inProgress: [inProgressCard('PRD-1', 'agent-1')],
        liveOwners: new Set(['agent-1']),
        prevLedger: prev,
      }),
    );
    expect(result.ledger['PRD-1'].stallCycles).toBe(2);
    expect(result.actions).toEqual([]); // still under the limit of 3
  });

  it('resets the counter when a different owner takes over the card', () => {
    const prev: Ledger = { 'PRD-1': { cardId: 'PRD-1', owner: 'old', stallCycles: 5 } };
    const result = tick(
      input({
        inProgress: [inProgressCard('PRD-1', 'new')],
        liveOwners: new Set(['new']),
        prevLedger: prev,
      }),
    );
    expect(result.ledger['PRD-1'].stallCycles).toBe(0);
  });

  it('escalates once the stall counter reaches the limit', () => {
    const prev: Ledger = { 'PRD-1': { cardId: 'PRD-1', owner: 'agent-1', stallCycles: 2 } };
    const result = tick(
      input({
        inProgress: [inProgressCard('PRD-1', 'agent-1')],
        liveOwners: new Set(['agent-1']),
        prevLedger: prev,
        stallLimit: 3,
      }),
    );
    expect(result.ledger['PRD-1'].stallCycles).toBe(3);
    expect(result.actions).toEqual([
      { kind: 'escalate', cardId: 'PRD-1', reason: expect.stringContaining('without finishing') },
    ]);
  });
});

describe('tick — mixed board', () => {
  it('reclaims the dead and tracks the live in one pass', () => {
    const result = tick(
      input({
        inProgress: [inProgressCard('DEAD', 'ghost'), inProgressCard('LIVE', 'agent-1')],
        liveOwners: new Set(['agent-1']),
      }),
    );
    expect(result.actions.map((a) => a.kind)).toEqual(['reclaim']);
    expect(Object.keys(result.ledger)).toEqual(['LIVE']);
  });
});
