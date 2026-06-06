import { FileStore } from '../fs/fileStore';

/**
 * An in-memory {@link FileStore} for unit tests — a flat path→content map. Lives under
 * src/test so it is excluded from coverage. `list(dir)` returns the immediate child
 * names under `dir`, mirroring a non-recursive `readdir`.
 */
export class FakeFileStore implements FileStore {
  private readonly files = new Map<string, string>();

  seed(path: string, content: string): this {
    this.files.set(path, content);
    return this;
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: no such file '${path}'`), { code: 'ENOENT' });
    }
    return content;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async list(dir: string): Promise<readonly string[]> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const names = new Set<string>();
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) {
        continue;
      }
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      names.add(slash === -1 ? rest : rest.slice(0, slash));
    }
    return [...names];
  }
}
