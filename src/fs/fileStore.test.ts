import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeFileStore } from './fileStore';

/**
 * The production store does real disk I/O, so these run against a throwaway temp dir.
 * The load-bearing case is the New-PRD regression: writing into a control repo that has
 * no `prds/inbox/` yet must create the folder, not ENOENT.
 */
describe('nodeFileStore', () => {
  async function withTempRoot(fn: (root: string) => Promise<void>): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), 'automatos-fs-'));
    try {
      await fn(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  it('creates missing parent directories on write (New PRD into an empty repo)', async () => {
    await withTempRoot(async (root) => {
      const store = nodeFileStore(root);
      await store.write('prds/inbox/PRD-0001.md', '# hi\n');
      expect((await readFile(join(root, 'prds/inbox/PRD-0001.md'))).toString()).toBe('# hi\n');
      expect(await store.read('prds/inbox/PRD-0001.md')).toBe('# hi\n');
    });
  });

  it('overwrites an existing file without error', async () => {
    await withTempRoot(async (root) => {
      const store = nodeFileStore(root);
      await store.write('prds/inbox/PRD-0001.md', 'first');
      await store.write('prds/inbox/PRD-0001.md', 'second');
      expect(await store.read('prds/inbox/PRD-0001.md')).toBe('second');
    });
  });

  it('list() returns [] for an absent directory', async () => {
    await withTempRoot(async (root) => {
      expect(await nodeFileStore(root).list('prds/inbox')).toEqual([]);
    });
  });
});
