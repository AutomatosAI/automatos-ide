import * as vscode from 'vscode';
import { FileStore, nodeFileStore } from './fs/fileStore';
import { execGitRunner } from './git/runner';
import { GitOps } from './git/gitOps';
import { CONFIG_FILENAME, controlRepoRoot } from './host/workspace';
import { currentHuman } from './host/githubAuth';
import { BoardPanel } from './host/boardPanel';
import { ChatPanel } from './host/chatPanel';
import { consolidateMemory } from './host/memoryCommand';
import { launchWorkerForCard } from './host/launchWorker';
import { autoStatus, autoDecompose } from './host/autoCommand';
import { MenuTreeProvider } from './host/menuTree';
import { Config, DEFAULT_CONFIG, parseConfig } from './core/config/config';
import { nodeEngineProbe } from './proc/engineProbe';
import { readBoard } from './core/board/boardStore';
import { columnCards } from './core/board/board';
import { CARD_STATUSES } from './core/cards/status';
import { Card } from './core/cards/card';
import { PRDS_ROOT } from './core/board/layout';

/**
 * Extension entry point. Activation is gated on `workspaceContains` the control repo's
 * `config.yml` (see package.json) so the cockpit only wakes inside a control repo.
 *
 * Each command resolves a fresh {@link Host} (root + FileStore + GitOps over the real
 * binaries) and hands it to the relevant subsystem. The Activity Bar menu is the always-
 * present home: board, chat, memory, AUTO, and the launchable queue, reachable while you
 * edit any repo in a multi-root workspace. All durable state lives in git, never in
 * extension memory, so `deactivate` is a no-op by design.
 */
export function activate(context: vscode.ExtensionContext): void {
  void registerMenu(context);

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
    vscode.commands.registerCommand('automatos.autoStatus', () =>
      withHost((host) => autoStatus(host.store)),
    ),
    vscode.commands.registerCommand('automatos.autoDecompose', () =>
      withHost((host) => decomposeFlow(host)),
    ),
    vscode.commands.registerCommand('automatos.launchWorker', (arg: unknown) =>
      withHost((host) => launchFlow(host, arg)),
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

/** Build the Activity Bar menu over the control repo and keep it fresh on board changes. */
async function registerMenu(context: vscode.ExtensionContext): Promise<void> {
  const root = await controlRepoRoot();
  if (!root) {
    return;
  }
  const provider = new MenuTreeProvider(root, nodeFileStore(root));
  const view = vscode.window.createTreeView('automatosMenu', { treeDataProvider: provider });
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(root, `${PRDS_ROOT}/**`),
  );
  watcher.onDidChange(() => provider.refresh());
  watcher.onDidCreate(() => provider.refresh());
  watcher.onDidDelete(() => provider.refresh());
  context.subscriptions.push(view, watcher);
}

/** Launch a worker on a card chosen by arg (tree node / board id) or via a QuickPick. */
async function launchFlow(host: Host, arg: unknown): Promise<void> {
  const human = await currentHuman();
  if (!human) {
    vscode.window.showWarningMessage('Sign in to GitHub to launch a worker (it owns the card).');
    return;
  }
  const id = cardIdFromArg(arg);
  const card = id ? await cardById(host.store, id) : await pickCard(host.store, ['ready', 'in-progress'], 'Select a PRD to launch a worker on');
  if (!card) {
    return;
  }
  const config = await loadConfig(host.store);
  await launchWorkerForCard(
    { root: host.root, store: host.store, git: host.git, me: human.handle, config, probe: nodeEngineProbe() },
    card,
  );
}

/** Pick a ready PRD and have AUTO split its `## Tasks` checklist into child cards. */
async function decomposeFlow(host: Host): Promise<void> {
  const card = await pickCard(host.store, ['ready'], 'Select a PRD for AUTO to split into task cards');
  if (card) {
    await autoDecompose(host.store, host.git, card);
  }
}

async function loadConfig(store: FileStore): Promise<Config> {
  try {
    return parseConfig(await store.read(CONFIG_FILENAME));
  } catch {
    return DEFAULT_CONFIG;
  }
}

function cardIdFromArg(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg && typeof arg === 'object') {
    const obj = arg as { kind?: unknown; card?: { id?: unknown }; id?: unknown };
    if (obj.kind === 'card' && typeof obj.card?.id === 'string') {
      return obj.card.id;
    }
    if (typeof obj.id === 'string') {
      return obj.id;
    }
  }
  return undefined;
}

async function cardById(store: FileStore, id: string): Promise<Card | undefined> {
  const board = await readBoard(store);
  for (const status of CARD_STATUSES) {
    const found = columnCards(board, status).find((card) => card.id === id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

async function pickCard(
  store: FileStore,
  statuses: readonly ('ready' | 'in-progress')[],
  placeHolder: string,
): Promise<Card | undefined> {
  const board = await readBoard(store);
  const cards = statuses.flatMap((status) => columnCards(board, status));
  if (cards.length === 0) {
    vscode.window.showInformationMessage('No matching PRDs on the board yet.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    cards.map((card) => ({
      label: `${card.id}  ${card.title}`,
      description: [card.status, card.owner ? `@${card.owner}` : null, card.engine]
        .filter((part): part is string => Boolean(part))
        .join(' · '),
      card,
    })),
    { placeHolder },
  );
  return picked?.card;
}
