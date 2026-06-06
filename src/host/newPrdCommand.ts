import * as vscode from 'vscode';
import { join } from 'node:path';
import { FileStore } from '../fs/fileStore';
import { GitOps } from '../git/gitOps';
import { readBoard } from '../core/board/boardStore';
import { columnCards } from '../core/board/board';
import { CARD_STATUSES } from '../core/cards/status';
import { cardPath } from '../core/board/layout';
import { serializeCard } from '../core/cards/frontmatter';
import { nextPrdId, newReadyCard } from '../core/cards/newCard';

/**
 * The "New PRD" action — author a card and push it to the shared inbox (git-native).
 *
 * Prompt for a title, mint the next `PRD-NNNN` as an unclaimed `ready` card with a PRD
 * scaffold, commit + push it to `prds/inbox/`, then open it for editing. Teammates see it
 * on their next pull/refresh — there is no server and no webhook; the repo IS the
 * broadcast. A lost push race (a teammate added a card first) takes their state and asks
 * for a re-run — the same compare-and-swap contract every other board write uses.
 */
export async function newPrd(root: string, store: FileStore, git: GitOps): Promise<void> {
  const title = await vscode.window.showInputBox({
    prompt: 'New PRD — a short, clear title',
    placeHolder: 'e.g. Add OAuth login to the settings panel',
    validateInput: (value) => (value.trim().length === 0 ? 'A title is required' : undefined),
  });
  if (!title) {
    return;
  }

  const board = await readBoard(store);
  const ids: string[] = [];
  let project = 'automatos';
  for (const status of CARD_STATUSES) {
    for (const card of columnCards(board, status)) {
      ids.push(card.id);
      if (card.project) {
        project = card.project;
      }
    }
  }

  const id = nextPrdId(ids);
  const card = newReadyCard({
    id,
    title: title.trim(),
    project,
    priority: 2,
    now: new Date().toISOString(),
  });
  const path = cardPath('ready', id);
  await store.write(path, serializeCard(card));
  await git.add([path]);
  await git.commit(`prd: add ${id} ${card.title}`);

  const push = await git.push();
  if (push.rejected) {
    await git.resetHardToUpstream();
    await git.pullRebase();
    vscode.window.showInformationMessage(
      'A teammate updated the board first — pulled their state. Re-run New PRD to add yours.',
    );
    return;
  }
  if (!push.ok) {
    vscode.window.showErrorMessage(`New PRD push failed: ${push.stderr.trim()}`);
    return;
  }

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(join(root, path)));
  await vscode.window.showTextDocument(doc);
  vscode.window.showInformationMessage(
    `Created ${id} in the inbox. Flesh out the PRD, then drag it to In Progress to launch a worker.`,
  );
}
