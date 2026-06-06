import * as vscode from 'vscode';
import { FileStore, nodeFileStore } from './fs/fileStore';
import { execGitRunner } from './git/runner';
import { GitOps } from './git/gitOps';
import { controlRepoRoot } from './host/workspace';
import { currentHuman } from './host/githubAuth';
import { BoardPanel } from './host/boardPanel';
import { ChatPanel } from './host/chatPanel';
import { consolidateMemory } from './host/memoryCommand';

/**
 * Extension entry point. Activation is gated on `workspaceContains` the control repo's
 * `config.yml` (see package.json) so the cockpit only wakes inside a control repo.
 *
 * Each command resolves a fresh {@link Host} (root + FileStore + GitOps over the real
 * binaries) and hands it to the relevant subsystem. All durable state lives in git, never
 * in extension memory, so `deactivate` is a no-op by design.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('automatos.openBoard', () =>
      withHost((host) => {
        BoardPanel.show(context, host);
      }),
    ),
    vscode.commands.registerCommand('automatos.openChat', () =>
      withHost(async (host) => {
        const human = await currentHuman();
        if (!human) {
          vscode.window.showWarningMessage('Sign in to GitHub to use team chat.');
          return;
        }
        ChatPanel.show(context, { ...host, me: human.handle });
      }),
    ),
    vscode.commands.registerCommand('automatos.consolidateMemory', () =>
      withHost((host) => consolidateMemory(host.store, host.git)),
    ),
  );
}

export function deactivate(): void {
  // Intentionally empty: the substrate is git, so there is no in-memory state to flush.
}

interface Host {
  readonly root: string;
  readonly store: FileStore;
  readonly git: GitOps;
}

/**
 * Resolve the control repo and run `fn` against it, surfacing any failure as a notification
 * instead of an unhandled rejection. Built per-invocation so a repo opened after activation
 * is always picked up fresh.
 */
async function withHost(fn: (host: Host) => void | Promise<void>): Promise<void> {
  const root = await controlRepoRoot();
  if (!root) {
    vscode.window.showErrorMessage('Automatos: no control repo (config.yml) found in the workspace.');
    return;
  }
  const host: Host = { root, store: nodeFileStore(root), git: new GitOps(execGitRunner, root) };
  try {
    await fn(host);
  } catch (error) {
    vscode.window.showErrorMessage(`Automatos: ${(error as Error).message}`);
  }
}
