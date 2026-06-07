import * as vscode from 'vscode';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { normalizeControlRepoSetting } from './controlRepoPath';
import { PRDS_ROOT } from '../core/board/layout';

export const CONFIG_FILENAME = 'config.yml';

/**
 * The control repo root — a directory that holds the `prds/` queue (a real control repo).
 *
 * Resolution order, most explicit first:
 *   1. the `automatos.controlRepoPath` setting — so the cockpit drives one board from ANY
 *      window, with no need to open the control repo as your workspace;
 *   2. auto-detect: a `config.yml` in the open workspace whose folder is a control repo.
 * Undefined when neither resolves, so callers fail loudly (and offer the picker) instead
 * of writing into the wrong tree.
 *
 * BOTH branches require the `prds/` marker, and that guard is load-bearing. A plain repo is
 * not a safe target: aim the board at a product repo and New PRD writes a card there, the
 * push is rejected (the branch is behind its remote), and the lost-race recovery runs
 * `git reset --hard` — silently deleting the card and risking real work. Requiring `prds/`
 * means only an actual control repo is ever chosen (a bare `config.yml` is ambiguous —
 * GitHub's `.github/ISSUE_TEMPLATE/config.yml` is also a `config.yml`).
 */
export async function controlRepoRoot(): Promise<string | undefined> {
  const configured = configuredControlRepo();
  if (configured && (await isControlRepo(configured))) {
    return configured;
  }
  // Scan several matches, not just the first: the real control repo may sort after a
  // decoy config.yml, so we keep looking until one is a true control repo.
  const candidates = await vscode.workspace.findFiles(
    `**/${CONFIG_FILENAME}`,
    '**/node_modules/**',
    16,
  );
  for (const candidate of candidates) {
    const dir = dirname(candidate.fsPath);
    if (await isControlRepo(dir)) {
      return dir;
    }
  }
  return undefined;
}

/**
 * A directory is a control repo only if it holds the `prds/` queue — the structural feature
 * every Automatos board has and no product repo does. The single guard both resolution
 * branches share, so the explicit setting can't aim the board somewhere destructive.
 */
async function isControlRepo(dir: string): Promise<boolean> {
  if (!(await isDirectory(dir))) {
    return false;
  }
  return isDirectory(join(dir, PRDS_ROOT));
}

/** The `automatos.controlRepoPath` setting, `~`-expanded, or undefined when left blank. */
function configuredControlRepo(): string | undefined {
  const raw = vscode.workspace.getConfiguration('automatos').get<string>('controlRepoPath');
  return normalizeControlRepoSetting(raw, homedir());
}

/** True when `path` resolves to an existing directory (follows symlinks). */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(path));
    return (stat.type & vscode.FileType.Directory) !== 0;
  } catch {
    return false;
  }
}
