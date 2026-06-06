import { join } from 'node:path';

/**
 * Resolve the user's `automatos.controlRepoPath` setting to an absolute path.
 *
 * Pure (no vscode, no fs) so the normalization is unit-tested: trim, treat blank as
 * "unset", and expand a leading `~` to the home directory the way a shell would. The
 * caller (host/workspace) does the fs existence check and the vscode settings read; this
 * file is just the string rule, kept honest by tests.
 */

/** Expand a leading `~` / `~/…` to the given home directory; leave other paths untouched. */
export function expandHome(path: string, home: string): string {
  if (path === '~') {
    return home;
  }
  if (path.startsWith('~/')) {
    return join(home, path.slice(2));
  }
  return path;
}

/**
 * Normalize a raw setting value into an absolute control-repo path, or `undefined` when the
 * setting is blank/whitespace — meaning "fall back to workspace auto-detection".
 */
export function normalizeControlRepoSetting(
  raw: string | undefined,
  home: string,
): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  return expandHome(trimmed, home);
}
