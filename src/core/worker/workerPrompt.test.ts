import { describe, it, expect } from 'vitest';
import { Card } from '../cards/card';
import { buildWorkerPrompt, directionFileFor } from './workerPrompt';

function card(over: Partial<Card> = {}): Card {
  return {
    id: 'PRD-7',
    title: 'Add the thing',
    project: 'ide',
    status: 'in-progress',
    owner: 'agent-1',
    branch: 'feat/prd-7',
    priority: 1,
    created: '2026-01-01',
    updated: null,
    engine: null,
    validationCriteria: [{ text: 'the thing works', done: false }],
    body: 'Build the thing per the design.',
    ...over,
  };
}

const ctx = { branch: 'feat/prd-7', baseBranch: 'main' };

describe('directionFileFor', () => {
  it('maps each engine to its standing-direction filename', () => {
    expect(directionFileFor('claude')).toBe('CLAUDE.md');
    expect(directionFileFor('codex')).toBe('AGENTS.md');
    expect(directionFileFor('gemini')).toBe('GEMINI.md');
  });

  it('throws on an unknown engine', () => {
    expect(() => directionFileFor('cursor')).toThrow(/unknown engine/);
  });
});

describe('buildWorkerPrompt', () => {
  it('embeds the card id, title and body', () => {
    const prompt = buildWorkerPrompt(card(), ctx);
    expect(prompt).toContain('Card PRD-7: Add the thing');
    expect(prompt).toContain('Build the thing per the design.');
  });

  it('renders acceptance criteria as a checklist', () => {
    const prompt = buildWorkerPrompt(card(), ctx);
    expect(prompt).toContain('- [ ] the thing works');
  });

  it('falls back to a clear note when there are no criteria', () => {
    const prompt = buildWorkerPrompt(card({ validationCriteria: [] }), ctx);
    expect(prompt).toContain('No explicit acceptance criteria');
  });

  it('states the one-shot contract: build, PR into base, move to review, then exit', () => {
    const prompt = buildWorkerPrompt(card(), ctx);
    expect(prompt).toContain('branch `feat/prd-7`');
    expect(prompt).toContain('into `main`');
    expect(prompt).toContain('prds/review/');
    expect(prompt).toMatch(/Exit\. Do NOT claim/);
  });

  it('handles an empty body without producing a blank section', () => {
    const prompt = buildWorkerPrompt(card({ body: '   ' }), ctx);
    expect(prompt).toContain('(no PRD body provided)');
  });
});
