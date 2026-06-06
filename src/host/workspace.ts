import * as vscode from 'vscode';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { normalizeControlRepoSetting } from './controlRepoPath';

export const CONFIG_FILENAME = 'config.yml';

/**
 * The control repo root — the directory that holds `config.yml`.
 *
 * Resolution order, most explicit first:
 *   1. the `automatos.controlRepoPath` setting — so the cockpit drives one board from ANY
 *      window, with no need to open the control repo as your workspace;
 *   2. a `config.yml` found anywhere in the open workspace (the original auto-detect);
 *   3. the first workspace folder, as a last resort.
 * Undefined only when nothing is configured and nothing is open, so callers fail loudly
 * instead of writing into the wrong tree.
 */
export async function controlRepoRoot(): Promise<string | undefined> {
  const configured = configuredControlRepo();
  if (configured && (await isDirectory(configured))) {
    return configured;
  }
  const found = await vscode.workspace.findFiles(`**/${CONFIG_FILENAME}`, '**/node_modules/**', 1);
  if (found.length > 0) {
    return dirname(found[0].fsPath);
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
