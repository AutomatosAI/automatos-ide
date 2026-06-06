import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * The narrow seam between our logic and the real filesystem, rooted at one repo dir.
 *
 * Like {@link GitRunner}, this exists so the coordination layer (claim CAS, board
 * reads) is unit-testable against an in-memory fake with zero disk I/O. All paths are
 * repo-relative — the SAME strings we hand to git — so a card's git argv and its file
 * path never drift apart. {@link nodeFileStore} is the production implementation.
 */
export interface FileStore {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  /** File/dir names directly under `dir` (not recursive); empty when `dir` is absent. */
  list(dir: string): Promise<readonly string[]>;
}

export function nodeFileStore(root: string): FileStore {
  return {
    async read(path) {
      return (await readFile(join(root, path))).toString();
    },
    async write(path, content) {
      const full = join(root, path);
      // Create the queue folder on demand: a freshly-set control repo has no `prds/inbox/`
      // yet, and the first New PRD (or heartbeat) must not ENOENT on a missing parent.
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content);
    },
    async list(dir) {
      try {
        return await readdir(join(root, dir));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    },
  };
}
