import { describe, it, expect } from 'vitest';
import { FakeFileStore } from '../../test/fakeFs';
import {
  Note,
  notePath,
  serializeNote,
  parseNote,
  appendNote,
  readAgentNotes,
  readAllNotes,
  grepNotes,
  recall,
} from './notes';

function note(over: Partial<Note> = {}): Note {
  return {
    agent: 'agent-1',
    at: '2026-06-06T12:00:00.000Z',
    tags: ['claim', 'ingest'],
    text: 'Reclaimed PRD-7 after the worker went dark.',
    ...over,
  };
}

describe('notePath', () => {
  it('sanitizes colons and dots out of the timestamp filename', () => {
    expect(notePath('agent-1', '2026-06-06T12:00:00.000Z')).toBe(
      'memory/agent-1/2026-06-06T12-00-00-000Z.md',
    );
  });
});

describe('serializeNote / parseNote', () => {
  it('round-trips an agent, timestamp, tags, and body', () => {
    const original = note();
    const parsed = parseNote(serializeNote(original));
    expect(parsed).toEqual(original);
  });

  it('round-trips a note with no tags', () => {
    const original = note({ tags: [] });
    expect(parseNote(serializeNote(original))).toEqual(original);
  });

  it('defaults missing tags to an empty list', () => {
    const parsed = parseNote('---\nagent: a\nat: 2026-06-06T00:00:00Z\n---\nbody');
    expect(parsed.tags).toEqual([]);
  });

  it('rejects a note missing its agent', () => {
    expect(() => parseNote('---\nat: 2026-06-06T00:00:00Z\n---\nbody')).toThrow(/agent/);
  });

  it('rejects a note missing its timestamp', () => {
    expect(() => parseNote('---\nagent: a\n---\nbody')).toThrow(/at/);
  });

  it('rejects frontmatter that is not a mapping', () => {
    expect(() => parseNote('---\n- just\n- a\n- list\n---\nbody')).toThrow(/mapping/);
  });
});

describe('appendNote', () => {
  it('writes the note to its per-agent sanitized path', async () => {
    const store = new FakeFileStore();
    await appendNote(store, note());
    expect(store.has('memory/agent-1/2026-06-06T12-00-00-000Z.md')).toBe(true);
  });
});

describe('readAgentNotes', () => {
  it('returns just the one agent’s notes', async () => {
    const store = new FakeFileStore();
    await appendNote(store, note({ agent: 'a', at: '2026-06-01T00:00:00Z', text: 'from a' }));
    await appendNote(store, note({ agent: 'b', at: '2026-06-02T00:00:00Z', text: 'from b' }));
    const notes = await readAgentNotes(store, 'a');
    expect(notes.map((n) => n.text)).toEqual(['from a']);
  });

  it('returns an empty list for an agent with no notes', async () => {
    expect(await readAgentNotes(new FakeFileStore(), 'nobody')).toEqual([]);
  });

  it('skips a malformed note file rather than throwing', async () => {
    const store = new FakeFileStore();
    await appendNote(store, note({ agent: 'a', at: '2026-06-01T00:00:00Z', text: 'good' }));
    store.seed('memory/a/garbage.md', 'not a note at all');
    const notes = await readAgentNotes(store, 'a');
    expect(notes.map((n) => n.text)).toEqual(['good']);
  });
});

describe('readAllNotes', () => {
  it('aggregates notes across every agent directory', async () => {
    const store = new FakeFileStore();
    await appendNote(store, note({ agent: 'a', at: '2026-06-01T00:00:00Z', text: 'from a' }));
    await appendNote(store, note({ agent: 'b', at: '2026-06-02T00:00:00Z', text: 'from b' }));
    const texts = (await readAllNotes(store)).map((n) => n.text).sort();
    expect(texts).toEqual(['from a', 'from b']);
  });
});

describe('grepNotes', () => {
  const older = note({ at: '2026-06-01T00:00:00Z', text: 'Built the parser', tags: ['build'] });
  const newer = note({ at: '2026-06-05T00:00:00Z', text: 'Wired the route', tags: ['BUILD'] });

  it('matches the body case-insensitively', () => {
    expect(grepNotes([older, newer], 'PARSER')).toEqual([older]);
  });

  it('matches a tag case-insensitively', () => {
    expect(grepNotes([older, newer], 'build').map((n) => n.text)).toEqual([
      'Wired the route',
      'Built the parser',
    ]);
  });

  it('returns everything for an empty query, newest first', () => {
    expect(grepNotes([older, newer], '').map((n) => n.at)).toEqual([newer.at, older.at]);
  });

  it('sorts matches newest first', () => {
    expect(grepNotes([older, newer], 'the').map((n) => n.at)).toEqual([newer.at, older.at]);
  });

  it('returns nothing when no note matches', () => {
    expect(grepNotes([older, newer], 'database')).toEqual([]);
  });
});

describe('recall', () => {
  it('reads every note and greps it end to end', async () => {
    const store = new FakeFileStore();
    await appendNote(store, note({ agent: 'a', at: '2026-06-01T00:00:00Z', text: 'parser work' }));
    await appendNote(store, note({ agent: 'b', at: '2026-06-05T00:00:00Z', text: 'parser fix' }));
    await appendNote(store, note({ agent: 'b', at: '2026-06-03T00:00:00Z', text: 'unrelated' }));
    const hits = await recall(store, 'parser');
    expect(hits.map((n) => n.at)).toEqual(['2026-06-05T00:00:00Z', '2026-06-01T00:00:00Z']);
  });
});
