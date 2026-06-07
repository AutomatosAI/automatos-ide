import * as vscode from 'vscode';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { normalizeControlRepoSetting } from './controlRepoPath';
import { PRDS_ROOT } from '../core/board/layout';

export const CONFIG_FILENAME = 'config.yml';

/**
 * The control repo root — the directory that holds `config.yml` AND the `prds/` queue.
 *
 * Resolution order, most explicit first:
 *   1. the `automatos.controlRepoPath` setting — so the cockpit drives one board from ANY
 *      window, with no need to open the control repo as your workspace;
 *   2. auto-detect: a `config.yml` in the open workspace whose folder ALSO holds a `prds/`
 *      directory.
 * Undefined when neither resolves, so callers fail loudly (and offer the picker) instead
 * of writing into the wrong tree.
 *
 * The `prds/` requirement is load-bearing: `config.yml` alone is ambiguous — GitHub's
 * issue-template config (`.github/ISSUE_TEMPLATE/config.yml`) is also a `config.yml`, and
 * matching it once aimed New PRD at a product repo and pushed cards there. `parseConfig`
 * is too lenient to tell them apart, so we discriminate on the directory shape that only
 * an Automatos control repo has.
 */
export async function controlRepoRoot(): Promise<string | undefined> {
  const configured = configuredControlRepo();
  if (configured && (await isDirectory(configured))) {
    return configured;
  }
  // Scan several matches, not just the first: the real control repo may sort after a
  // decoy config.yml, so we keep looking until one has the sibling `prds/` tree.
  const candidates = await vscode.workspace.findFiles(
    `**/${CONFIG_FILENAME}`,
    '**/node_modules/**',
    16,
  );
  for (const candidate of candidates) {
    const dir = dirname(candidate.fsPath);
    if (await isDirectory(join(dir, PRDS_ROOT))) {
      return dir;
    }
  }
  return undefined;
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
