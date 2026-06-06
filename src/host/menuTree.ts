import * as vscode from 'vscode';
import { join } from 'node:path';
import { FileStore } from '../fs/fileStore';
import { Card } from '../core/cards/card';
import { readBoard } from '../core/board/boardStore';
import { columnCards } from '../core/board/board';
import { cardPath } from '../core/board/layout';

/**
 * The Activity Bar menu — one always-present home for the cockpit (the missing "menu").
 *
 * A tree, not three buried palette commands: top-level actions (board, chat, memory, AUTO)
 * plus the live queue (ready cards you can launch, in-progress cards you can resume). It
 * lives in the sidebar, so it stays reachable while you edit ANY repo in a multi-root
 * workspace — you never have to re-open the control repo to drive the team. A
 * FileSystemWatcher (wired by the caller) calls {@link refresh} when a teammate's push
 * lands, so the queue reflects shared git state, not local memory. With no control repo
 * resolved yet, the tree still offers a "Set control repo" action so the sidebar is never
 * a dead end.
 */

type MenuNode =
  | { readonly kind: 'action'; readonly label: string; readonly commandId: string; readonly icon: string }
  | { readonly kind: 'group'; readonly label: string; readonly status: 'ready' | 'in-progress'; readonly icon: string }
  | { readonly kind: 'card'; readonly card: Card };

const ACTIONS: readonly { label: string; commandId: string; icon: string }[] = [
  { label: 'New PRD', commandId: 'automatos.newPrd', icon: 'add' },
  { label: 'Open Board', commandId: 'automatos.openBoard', icon: 'layout' },
  { label: 'Team Chat', commandId: 'automatos.openChat', icon: 'comment-discussion' },
  { label: 'AUTO Status', commandId: 'automatos.autoStatus', icon: 'pulse' },
  { label: 'Split a PRD into tasks', commandId: 'automatos.autoDecompose', icon: 'list-tree' },
  { label: 'Consolidate Memory', commandId: 'automatos.consolidateMemory', icon: 'archive' },
  { label: 'Settings', commandId: 'automatos.openSettings', icon: 'settings-gear' },
  { label: 'Set Control Repo', commandId: 'automatos.selectControlRepo', icon: 'root-folder' },
];

/** Shown when no control repo is resolved yet — the only way out of an empty sidebar. */
const BOOTSTRAP_ACTION: MenuNode = {
  kind: 'action',
  label: 'Set control repo to get started',
  commandId: 'automatos.selectControlRepo',
  icon: 'root-folder',
};

export class MenuTreeProvider implements vscode.TreeDataProvider<MenuNode> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly root: string | undefined,
    private readonly store: FileStore | undefined,
  ) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(node: MenuNode): vscode.TreeItem {
    if (node.kind === 'action') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(node.icon);
      item.command = { command: node.commandId, title: node.label };
      return item;
    }
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon(node.icon);
      item.contextValue = 'automatosGroup';
      return item;
    }
    const card = node.card;
    const item = new vscode.TreeItem(`${card.id}  ${card.title}`, vscode.TreeItemCollapsibleState.None);
    item.description = [card.owner ? `@${card.owner}` : null, card.engine, `P${card.priority}`]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
    item.tooltip = card.title;
    item.contextValue = 'automatosCard';
    item.iconPath = new vscode.ThemeIcon(card.status === 'ready' ? 'circle-outline' : 'sync');
    item.command = {
      command: 'vscode.open',
      title: 'Open PRD',
      arguments: [vscode.Uri.file(join(this.root ?? '', cardPath(card.status, card.id)))],
    };
    return item;
  }

  async getChildren(node?: MenuNode): Promise<MenuNode[]> {
    if (!node) {
      if (!this.root || !this.store) {
        return [BOOTSTRAP_ACTION];
      }
      return [
        ...ACTIONS.map((a) => ({ kind: 'action', ...a }) as MenuNode),
        { kind: 'group', label: 'Ready to launch', status: 'ready', icon: 'inbox' },
        { kind: 'group', label: 'In progress', status: 'in-progress', icon: 'gear' },
      ];
    }
    if (node.kind === 'group') {
      if (!this.store) {
        return [];
      }
      const board = await readBoard(this.store);
      return columnCards(board, node.status).map((card) => ({ kind: 'card', card }) as MenuNode);
    }
    return [];
  }
}
