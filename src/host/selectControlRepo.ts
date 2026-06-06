import * as vscode from 'vscode';
import { join } from 'node:path';
import { CONFIG_FILENAME } from './workspace';

/**
 * Pick a folder and remember it as the control repo (a machine-scoped setting), so the
 * cockpit drives that board from ANY window — you never have to open the control repo as
 * your workspace. A folder without `config.yml` is allowed (you may be about to create
 * one) but you are warned first, so a mis-click does not silently point the team at the
 * wrong tree.
 */
export async function selectControlRepo(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Use as control repo',
    title: 'Select your Automatos control repo (the folder with config.yml)',
  });
  if (!picked || picked.length === 0) {
    return;
  }
  const root = picked[0].fsPath;

  if (!(await fileExists(join(root, CONFIG_FILENAME)))) {
    const useAnyway = 'Use Anyway';
    const choice = await vscode.window.showWarningMessage(
      `No ${CONFIG_FILENAME} found in ${root}. Use it as the control repo anyway?`,
      { modal: true },
      useAnyway,
    );
    if (choice !== useAnyway) {
      return;
    }
  }

  await vscode.workspace
    .getConfiguration('automatos')
    .update('controlRepoPath', root, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`Automatos control repo set: ${root}`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(path));
    return true;
  } catch {
    return false;
  }
}
