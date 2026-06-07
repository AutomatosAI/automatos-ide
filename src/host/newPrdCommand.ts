import * as vscode from 'vscode';
import { join } from 'node:path';
import { FileStore } from '../fs/fileStore';
import { GitOps } from '../git/gitOps';
import { readBoard } from '../core/board/boardStore';
import { Board, columnCards } from '../core/board/board';
import { CARD_STATUSES } from '../core/cards/status';
import { cardPath } from '../core/board/layout';
import { serializeCard } from '../core/cards/frontmatter';
import { newReadyCard } from '../core/cards/newCard';
import { nextPrdId } from '../core/cards/prdId';
import { Config } from '../core/config/config';
import { DEFAULT_PROJECT_KEY } from '../core/config/projectKey';

/**
 * The "New PRD" action — author a card and push it to the shared inbox (git-native).
 *
 * Pick the target project (or the control repo's own queue), prompt for a title, then mint
 * the next id in THAT project's sequence — `AUTO-0145` for `automatos-ai`, `PRD-0007` for
 * the control repo — as an unclaimed `ready` card with a PRD scaffold. Commit + push it to
 * `prds/inbox/`, then open it for editing. Teammates see it on their next pull/refresh —
 * there is no server and no webhook; the repo IS the broadcast. A lost push race (a teammate
 * added a card first) takes their state and asks for a re-run — the same compare-and-swap
 * contract every other board write uses.
 */
export async function newPrd(
  root: string,
  store: FileStore,
  git: GitOps,
  config: Config,
): Promise<void> {
  const target = await pickProject(config);
  if (!target) {
    return;
  }

  const title = await vscode.window.showInputBox({
    prompt: 'New PRD — a short, clear title',
    placeHolder: 'e.g. Add OAuth login to the settings panel',
    validateInput: (value) => (value.trim().length === 0 ? 'A title is required' : undefined),
  });
  if (!title) {
    return;
  }

  const board = await readBoard(store);
  const id = nextPrdId(boardCardIds(board), target.key);
  const card = newReadyCard({
    id,
    title: title.trim(),
    project: target.project,
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
    push.localOnly
      ? `Created ${id} locally — the control repo has no remote yet, so it isn't shared with the team. Add a remote to broadcast it.`
      : `Created ${id} in the inbox. Flesh out the PRD, then drag it to In Progress to launch a worker.`,
  );
}

/** The project a new PRD belongs to: its repo name (blank for the control repo) and PRD key. */
interface PrdTarget {
  readonly project: string;
  readonly key: string;
}

/** The control repo's own queue — no project, bare `PRD-NNNN` ids. */
const CONTROL_REPO_TARGET: PrdTarget = { project: '', key: DEFAULT_PROJECT_KEY };

/**
 * Ask which project the PRD is for. With no `project_repos` configured there's nothing to
 * choose, so we go straight to the control repo's queue; otherwise the user picks a project
 * (its key drives the id sequence) or that same control-repo queue. Returns undefined when
 * the picker is dismissed, so the caller aborts without minting anything.
 */
async function pickProject(config: Config): Promise<PrdTarget | undefined> {
  if (config.projectRepos.length === 0) {
    return CONTROL_REPO_TARGET;
  }
  const picked = await vscode.window.showQuickPick(
    [
      ...config.projectRepos.map((repo) => ({
        label: repo.name,
        description: `${repo.key} · ${repo.path}`,
        target: { project: repo.name, key: repo.key },
      })),
      {
        label: 'Control repo (no project)',
        description: `${DEFAULT_PROJECT_KEY} · the board's own queue`,
        target: CONTROL_REPO_TARGET,
      },
    ],
    { placeHolder: 'Which project is this PRD for?' },
  );
  return picked?.target;
}

/** Every card id on the board, across all columns — the pool {@link nextPrdId} numbers from. */
function boardCardIds(board: Board): readonly string[] {
  const ids: string[] = [];
  for (const status of CARD_STATUSES) {
    for (const card of columnCards(board, status)) {
      ids.push(card.id);
    }
  }
  return ids;
}
