import { describe, it, expect } from 'vitest';
import { Card } from '../cards/card';
import { planWorkers, freeSlots, engineForCard, PlanInput } from './supervisorPlan';

function card(id: string, over: Partial<Card> = {}): Card {
  return {
    id,
    title: id,
    project: 'ide',
    status: 'ready',
    owner: null,
    branch: null,
    priority: 3,
    created: '2026-01-01',
    updated: null,
    engine: null,
    validationCriteria: [],
    body: '',
    ...over,
  };
}

const base: Omit<PlanInput, 'readyCards'> = {
  maxWorkers: 4,
  liveWorkers: 0,
  defaultEngine: 'claude',
  usableEngines: ['claude', 'codex', 'gemini'],
  worktreeRoot: '../.worktrees',
};

describe('freeSlots', () => {
  it('is the headroom under max_workers, never negative', () => {
    expect(freeSlots(4, 1)).toBe(3);
    expect(freeSlots(4, 4)).toBe(0);
    expect(freeSlots(4, 9)).toBe(0);
  });
});

describe('engineForCard', () => {
  it('prefers the card override, else the config default', () => {
    expect(engineForCard(card('a', { engine: 'codex' }), 'claude')).toBe('codex');
    expect(engineForCard(card('a'), 'claude')).toBe('claude');
  });
});

describe('planWorkers', () => {
  it('launches one worker per ready card, capped by free slots', () => {
    const plan = planWorkers({
      ...base,
      liveWorkers: 2, // 2 free of 4
      readyCards: [card('PRD-1'), card('PRD-2'), card('PRD-3')],
    });
    expect(plan.map((w) => w.promptCard.id)).toEqual(['PRD-1', 'PRD-2']);
  });

  it('derives a per-card worktree path and branch', () => {
    const [worker] = planWorkers({ ...base, readyCards: [card('PRD-7')] });
    expect(worker.worktreePath).toBe('../.worktrees/PRD-7');
    expect(worker.branch).toBe('feat/prd-7');
    expect(worker.engine).toBe('claude');
  });

  it('uses a card engine override when usable', () => {
    const [worker] = planWorkers({
      ...base,
      readyCards: [card('PRD-1', { engine: 'gemini' })],
    });
    expect(worker.engine).toBe('gemini');
  });

  it('skips a card whose engine is not usable and fills the slot with the next', () => {
    const plan = planWorkers({
      ...base,
      maxWorkers: 1,
      usableEngines: ['claude'], // gemini failed preflight
      readyCards: [card('PRD-1', { engine: 'gemini' }), card('PRD-2')],
    });
    expect(plan.map((w) => w.promptCard.id)).toEqual(['PRD-2']);
  });

  it('launches nothing when every slot is occupied', () => {
    const plan = planWorkers({
      ...base,
      maxWorkers: 2,
      liveWorkers: 2,
      readyCards: [card('PRD-1')],
    });
    expect(plan).toEqual([]);
  });

  it('launches nothing when the inbox is empty', () => {
    expect(planWorkers({ ...base, readyCards: [] })).toEqual([]);
  });
});
