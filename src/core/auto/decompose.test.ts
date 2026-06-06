import { describe, it, expect } from 'vitest';
import { Card } from '../cards/card';
import { parseTaskList, decompose, decomposePrd } from './decompose';

function prd(body: string, over: Partial<Card> = {}): Card {
  return {
    id: 'PRD-7',
    title: 'Big feature',
    project: 'ingest',
    status: 'ready',
    owner: null,
    branch: null,
    priority: 2,
    created: '2026-01-01',
    updated: null,
    engine: 'codex',
    validationCriteria: [],
    body,
    ...over,
  };
}

describe('parseTaskList', () => {
  it('returns nothing when there is no task section', () => {
    expect(parseTaskList('Just a description, no tasks.')).toEqual([]);
  });

  it('parses a checkbox list under a ## Tasks heading', () => {
    const specs = parseTaskList('## Tasks\n- [ ] Build the parser\n- [x] Wire the route\n');
    expect(specs.map((s) => s.title)).toEqual(['Build the parser', 'Wire the route']);
  });

  it('parses a numbered list and a "User Stories" heading', () => {
    const specs = parseTaskList('## User Stories\n1. First story\n2. Second story');
    expect(specs.map((s) => s.title)).toEqual(['First story', 'Second story']);
  });

  it('stops at the next heading', () => {
    const specs = parseTaskList('## Tasks\n- One\n\n## Notes\n- not a task');
    expect(specs.map((s) => s.title)).toEqual(['One']);
  });

  it('folds detail lines and nested bullets into the item body', () => {
    const specs = parseTaskList('## Tasks\n- Parent task\n  - nested detail\n  more prose\n- Next');
    expect(specs[0]).toEqual({ title: 'Parent task', body: 'nested detail\nmore prose' });
    expect(specs[1].title).toBe('Next');
  });
});

describe('decompose', () => {
  const ctx = { now: '2026-06-06T12:00:00Z' };

  it('materializes children with lineage ids inheriting parent fields', () => {
    const children = decompose(prd(''), [{ title: 'A', body: 'do a' }, { title: 'B', body: '' }], ctx);
    expect(children.map((c) => c.id)).toEqual(['PRD-7.1', 'PRD-7.2']);
    expect(children[0]).toMatchObject({
      title: 'A',
      project: 'ingest',
      engine: 'codex',
      priority: 2,
      status: 'ready',
      owner: null,
      created: '2026-06-06',
      body: 'do a',
    });
  });

  it('produces no children for an empty spec list', () => {
    expect(decompose(prd(''), [], ctx)).toEqual([]);
  });
});

describe('decomposePrd', () => {
  it('parses the parent body and materializes its children end to end', () => {
    const children = decomposePrd(prd('## Tasks\n- [ ] Parser\n- [ ] Route\n'), {
      now: '2026-06-06T00:00:00Z',
    });
    expect(children.map((c) => c.id)).toEqual(['PRD-7.1', 'PRD-7.2']);
    expect(children.map((c) => c.title)).toEqual(['Parser', 'Route']);
  });
});
