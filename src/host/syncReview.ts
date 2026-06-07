import * as vscode from 'vscode';
import { FileStore } from '../fs/fileStore';
import { GitOps } from '../git/gitOps';
import { Config } from '../core/config/config';
import { Card, withStatus } from '../core/cards/card';
import { readBoard } from '../core/board/boardStore';
import { columnCards } from '../core/board/board';
import { cardPath } from '../core/board/layout';
import { serializeCard } from '../core/cards/frontmatter';
import { CommandRunner } from '../proc/commandRunner';
import { parsePrState, PrState, UNKNOWN_PR } from '../core/review/prState';
import { projectRepoDir } from './projectRepoDir';

/**
 * Close the board loop: advance review cards whose PR has merged to done (22 §3).
 *
 * A worker ends by opening a PR and moving its card to `review`; until that PR merges the
 * card should sit there. This is the missing watcher — for each review card it asks `gh`
 * (in the card's OWN project repo, so multi-repo boards work) whether the PR merged, then
 * moves the merged ones review→done in the CONTROL repo using the same git-mv + push CAS
 * a claim uses. Read-only on `gh`, fail-closed on anything it can't read, and a lost push
 * race just asks the human to re-run — it never advances a card on a guess.
 */

export interface SyncReviewDeps {
  readonly root: string;
  readonly store: FileStore;
  readonly git: GitOps;
  readonly config: Config;
  /** Runs `gh`; injected so the flow is a seam, not a hard dependency on a binary. */
  readonly run: CommandRunner;
  /** Clock → ISO timestamp, injected for deterministic `updated` stamps. */
  readonly now: () => string;
}

export async function syncReview(deps: SyncReviewDeps): Promise<void> {
  const board = await readBoard(deps.store);
  const review = columnCards(board, 'review');
  if (review.length === 0) {
    vscode.window.showInformationMessage('Nothing in Review to sync.');
    return;
  }

  if ((await deps.run.run('gh', ['--version'])).code === 127) {
    vscode.window.showErrorMessage('GitHub CLI (gh) not found — install it to sync review status.');
    return;
  }

  const merged: Card[] = [];
  let unreadable = 0;
  for (const card of review) {
    const outcome = await prStateForCard(deps, card);
    if (!outcome.read) {
      unreadable += 1;
    } else if (outcome.pr.merged) {
      merged.push(card);
    }
  }

  if (merged.length === 0) {
    const tail = unreadable > 0 ? ` (${unreadable} with no readable PR — is gh authenticated?)` : '';
    vscode.window.showInformationMessage(`Review: ${review.length} card(s), none merged yet${tail}.`);
    return;
  }

  const advanced = await advanceToDone(deps, merged);
  if (advanced.length > 0) {
    vscode.window.showInformationMessage(
      `Advanced ${advanced.length} merged card(s) to Done: ${advanced.map((c) => c.id).join(', ')}.`,
    );
  }
}

interface PrReadout {
  /** false when we couldn't read the PR at all (no branch, gh error) — never advance. */
  readonly read: boolean;
  readonly pr: PrState;
}

/** Ask `gh` in the card's project repo whether its PR merged. Never throws. */
async function prStateForCard(deps: SyncReviewDeps, card: Card): Promise<PrReadout> {
  if (!card.branch) {
    return { read: false, pr: UNKNOWN_PR };
  }
  const cwd = projectRepoDir(card, deps.config, deps.root);
  const result = await deps.run.run('gh', ['pr', 'view', card.branch, '--json', 'state,url'], cwd);
  if (result.code !== 0) {
    return { read: false, pr: UNKNOWN_PR };
  }
  return { read: true, pr: parsePrState(result.stdout) };
}

/**
 * Move merged cards review→done in one commit, then push under the claim CAS: a lost race
 * discards the batch and pulls the winner's state so the human can re-run, rather than
 * forcing a divergent board. Returns the cards actually landed (empty on a lost/failed push).
 */
async function advanceToDone(deps: SyncReviewDeps, cards: readonly Card[]): Promise<readonly Card[]> {
  const advanced: Card[] = [];
  for (const card of cards) {
    const done = withStatus(card, 'done', deps.now());
    const to = cardPath('done', card.id);
    await deps.git.mv(cardPath('review', card.id), to);
    await deps.store.write(to, serializeCard(done));
    await deps.git.add([to]);
    advanced.push(done);
  }

  await deps.git.commit(`auto: advance ${advanced.length} merged card(s) to done`);

  const push = await deps.git.push();
  if (push.rejected) {
    await deps.git.resetHardToUpstream();
    await deps.git.pullRebase();
    vscode.window.showInformationMessage('A teammate changed the board first — took their state. Re-run Sync Review.');
    return [];
  }
  if (!push.ok) {
    vscode.window.showErrorMessage(`Review sync push failed: ${push.stderr.trim()}`);
    return [];
  }
  return advanced;
}
