import * as vscode from 'vscode';
import { FileStore } from '../fs/fileStore';
import { GitOps } from '../git/gitOps';
import { Config } from '../core/config/config';
import { Card, releaseCard } from '../core/cards/card';
import { serializeCard } from '../core/cards/frontmatter';
import { cardPath } from '../core/board/layout';
import { readBoard } from '../core/board/boardStore';
import { columnCards } from '../core/board/board';
import { readHeartbeats, stalenessThresholdMs } from '../core/heartbeat/heartbeat';
import { workerLiveness } from '../core/heartbeat/liveness';

/**
 * The reclaim CONSUMER — the destructive half of the overseer, kept CONFIRM-FIRST (21 §2).
 *
 * AUTO never yanks a card on its own here: it computes liveness, filters to workers that
 * are provably `stale` (a real beat that has aged out — NEVER `no-beat`, which is unknown),
 * and asks the human which to reclaim. Each confirmed card is released back to the inbox
 * via the same git-move-is-the-lock CAS a claim uses, so a teammate racing the board just
 * makes us lose and re-sync rather than clobber their state. The worktree/branch are left
 * intact so a re-claim resumes in place.
 */

export interface ReclaimDeps {
  readonly root: string;
  readonly store: FileStore;
  readonly git: GitOps;
  readonly config: Config;
  readonly now: () => string;
}

export async function reclaimStaleWorkers(deps: ReclaimDeps): Promise<void> {
  const board = await readBoard(deps.store);
  const inProgress = columnCards(board, 'in-progress');
  if (inProgress.length === 0) {
    vscode.window.showInformationMessage('No workers in progress — nothing to reclaim.');
    return;
  }

  const beats = await readHeartbeats(deps.store);
  const threshold = stalenessThresholdMs(deps.config.sync.heartbeatIntervalSeconds);
  const liveness = workerLiveness(inProgress, beats, deps.now(), threshold);
  const staleIds = new Set(
    liveness.filter((row) => row.state === 'stale').map((row) => row.cardId),
  );
  const stale = inProgress.filter((card) => staleIds.has(card.id));
  if (stale.length === 0) {
    vscode.window.showInformationMessage(
      'No stale workers to reclaim. (A worker with no heartbeat yet is left alone, never reclaimed on a guess.)',
    );
    return;
  }

  const picks = await vscode.window.showQuickPick(
    stale.map((card) => ({
      label: `${card.id}  ${card.title}`,
      description: `@${card.owner ?? '(unowned)'} · heartbeat stale`,
      picked: true,
      card,
    })),
    {
      canPickMany: true,
      placeHolder: 'Reclaim these stale workers? Their cards return to the inbox to be re-claimed.',
    },
  );
  if (!picks || picks.length === 0) {
    return;
  }

  const outcome = await reclaimCards(deps, picks.map((pick) => pick.card));
  if (outcome === 'lost-race') {
    vscode.window.showInformationMessage(
      'A teammate changed the board first — refreshed their state, nothing reclaimed.',
    );
    return;
  }
  vscode.window.showInformationMessage(
    `Reclaimed ${outcome.length} card(s) to the inbox: ${outcome.map((card) => card.id).join(', ')}`,
  );
}

/**
 * Move each chosen card in-progress→inbox, then commit + push as one CAS unit (mirroring
 * the claim engine in reverse). A rejected push means a teammate moved first: discard our
 * commit, take their state, and report the lost race so nothing is half-applied.
 */
async function reclaimCards(
  deps: ReclaimDeps,
  cards: readonly Card[],
): Promise<readonly Card[] | 'lost-race'> {
  const now = deps.now();
  const written: string[] = [];
  for (const card of cards) {
    const released = releaseCard(card, now);
    const from = cardPath('in-progress', card.id);
    const to = cardPath('ready', card.id);
    await deps.git.mv(from, to);
    await deps.store.write(to, serializeCard(released));
    written.push(to);
  }
  await deps.git.add(written);
  await deps.git.commit(
    `auto: reclaim ${cards.length} stale worker(s): ${cards.map((card) => card.id).join(', ')}`,
  );

  const push = await deps.git.push();
  if (push.rejected) {
    await deps.git.resetHardToUpstream();
    await deps.git.pullRebase();
    return 'lost-race';
  }
  if (!push.ok) {
    throw new Error(`reclaim push failed: ${push.stderr.trim()}`);
  }
  return cards;
}
