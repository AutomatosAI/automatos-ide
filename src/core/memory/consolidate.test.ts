import { describe, it, expect } from 'vitest';
import { FakeFileStore } from '../../test/fakeFs';
import { Note, appendNote, parseNote, serializeNote, notePath } from './notes';
import {
  DIGEST_TAG,
  shouldConsolidate,
  selectForConsolidation,
  buildDigest,
  planConsolidation,
  planConsolidationFor,
  applyConsolidation,
} from './consolidate';
import { GitOps } from '../../git/gitOps';
import { FakeGitRunner, argStartsWith } from '../../test/fakeGit';

function note(at: string, over: Partial<Note> = {}): Note {
  return { agent: 'agent-1', at, tags: [], text: `note ${at}`, ...over };
}

// Notes dated day-1 .. day-N for an agent (ascending), newest last.
function days(n: number, agent = 'agent-1'): Note[] {
  return Array.from({ length: n }, (_, i) =>
    note(`2026-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`, { agent, text: `day ${i + 1}` }),
  );
}

describe('shouldConsolidate', () => {
  it('fires once enough cards have finished since the last run', () => {
    expect(shouldConsolidate(20, 20)).toBe(true);
    expect(shouldConsolidate(21, 20)).toBe(true);
    expect(shouldConsolidate(19, 20)).toBe(false);
  });

  it('stays disabled when the threshold is null or non-positive', () => {
    expect(shouldConsolidate(1000, null)).toBe(false);
    expect(shouldConsolidate(1000, 0)).toBe(false);
    expect(shouldConsolidate(1000, -5)).toBe(false);
  });
});

describe('selectForConsolidation', () => {
  it('keeps the most recent notes and folds the older ones, newest first', () => {
    const sel = selectForConsolidation(days(6), 4);
    expect(sel.keep.map((n) => n.text)).toEqual(['day 6', 'day 5', 'day 4', 'day 3']);
    expect(sel.fold.map((n) => n.text)).toEqual(['day 2', 'day 1']);
  });

  it('folds nothing when notes fit within the keep window', () => {
    const sel = selectForConsolidation(days(3), 5);
    expect(sel.keep).toHaveLength(3);
    expect(sel.fold).toEqual([]);
  });
});

describe('buildDigest', () => {
  const ctx = { now: '2026-06-10T00:00:00Z' };

  it('lays the folded notes out oldest first under dated headings', () => {
    const fold = [note('2026-06-02T00:00:00Z', { text: 'second' }), note('2026-06-01T00:00:00Z', { text: 'first' })];
    const digest = buildDigest('agent-1', fold, ctx);
    expect(digest.agent).toBe('agent-1');
    expect(digest.at).toBe('2026-06-10T00:00:00Z');
    expect(digest.text).toBe(
      'Consolidated 2 notes (2026-06-01T00:00:00Z … 2026-06-02T00:00:00Z).\n\n' +
        '### 2026-06-01T00:00:00Z\nfirst\n\n### 2026-06-02T00:00:00Z\nsecond',
    );
  });

  it('marks the digest and unions the folded tags, deduped and sorted', () => {
    const fold = [
      note('2026-06-02T00:00:00Z', { tags: ['route', 'build'] }),
      note('2026-06-01T00:00:00Z', { tags: ['build'] }),
    ];
    expect(buildDigest('agent-1', fold, ctx).tags).toEqual([DIGEST_TAG, 'build', 'route']);
  });

  it('does not duplicate the marker tag if a folded note already carries it', () => {
    const fold = days(2).map((n) => ({ ...n, tags: [DIGEST_TAG] }));
    expect(buildDigest('agent-1', fold, ctx).tags).toEqual([DIGEST_TAG]);
  });
});

describe('planConsolidation', () => {
  const ctx = { now: '2026-06-30T00:00:00Z' };

  it('plans a digest plus the archived paths when there are cold notes to fold', () => {
    const plan = planConsolidation('agent-1', days(7), ctx, 5);
    expect(plan).not.toBeNull();
    expect(plan!.keptCount).toBe(5);
    expect(plan!.archivedPaths).toEqual([
      notePath('agent-1', '2026-06-02T00:00:00Z'),
      notePath('agent-1', '2026-06-01T00:00:00Z'),
    ]);
    expect(plan!.digest.tags).toContain(DIGEST_TAG);
  });

  it('returns null when fewer than two notes would be folded', () => {
    expect(planConsolidation('agent-1', days(6), ctx, 5)).toBeNull();
    expect(planConsolidation('agent-1', days(2), ctx, 5)).toBeNull();
  });

  it('produces a digest that parses back as a valid note', () => {
    const plan = planConsolidation('agent-1', days(8), ctx, 5)!;
    const reparsed = parseNote(serializeNote(plan.digest));
    expect(reparsed.text).toContain('Consolidated 3 notes');
    expect(reparsed.tags).toContain(DIGEST_TAG);
  });
});

describe('planConsolidationFor', () => {
  const ctx = { now: '2026-06-30T00:00:00Z' };

  it('reads one agent’s notes and plans their consolidation', async () => {
    const store = new FakeFileStore();
    for (const n of days(7, 'a')) {
      await appendNote(store, n);
    }
    for (const n of days(3, 'b')) {
      await appendNote(store, n);
    }
    const plan = await planConsolidationFor(store, 'a', ctx, 5);
    expect(plan).not.toBeNull();
    expect(plan!.agent).toBe('a');
    expect(plan!.archivedPaths.every((p) => p.startsWith('memory/a/'))).toBe(true);
  });

  it('returns null for an agent below the fold threshold', async () => {
    const store = new FakeFileStore();
    for (const n of days(6, 'a')) {
      await appendNote(store, n);
    }
    expect(await planConsolidationFor(store, 'a', ctx, 5)).toBeNull();
  });
});

describe('applyConsolidation', () => {
  const ctx = { now: '2026-06-30T00:00:00Z' };

  it('writes the digest, git rm’s the originals, and stages the digest', async () => {
    const store = new FakeFileStore();
    for (const n of days(7, 'a')) {
      await appendNote(store, n);
    }
    const plan = await planConsolidationFor(store, 'a', ctx, 5);
    const runner = new FakeGitRunner();
    await applyConsolidation(new GitOps(runner, '/repo'), store, plan!);

    const digestPath = notePath('a', ctx.now);
    expect(store.has(digestPath)).toBe(true);
    expect(parseNote(await store.read(digestPath)).tags).toContain(DIGEST_TAG);
    expect(runner.ran(argStartsWith('rm', '--', ...plan!.archivedPaths))).toBe(true);
    expect(runner.ran(argStartsWith('add', '--', digestPath))).toBe(true);
  });
});
