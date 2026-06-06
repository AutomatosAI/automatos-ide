import * as vscode from 'vscode';
import { dirname } from 'node:path';

export const CONFIG_FILENAME = 'config.yml';

/**
 * The control repo root — the directory that holds `config.yml`.
 *
 * Activation is gated on `workspaceContains` the config (see package.json), so a control
 * repo is open. The substrate (board, chat, memory, heartbeats) is rooted here; every
 * path we read or write is relative to it. Faithful to the activation glob, the config
 * may sit in a subfolder, so we locate the file and take its directory. Undefined when
 * none is found, so callers fail loudly instead of writing into the wrong tree.
 */
export async function controlRepoRoot(): Promise<string | undefined> {
  const found = await vscode.workspace.findFiles(`**/${CONFIG_FILENAME}`, '**/node_modules/**', 1);
  if (found.length > 0) {
    return dirname(found[0].fsPath);
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
