import { Card, withStatus } from '../cards/card';
import { CardStatus } from '../cards/status';
import { serializeCard } from '../cards/frontmatter';
import { cardPath } from './layout';
import { GitOps } from '../../git/gitOps';
import { FileStore } from '../../fs/fileStore';

/**
 * A human dragging a card between columns — git mv + push as the move (15 §2).
 *
 * Dragging a card is the manual counterpart of the claim CAS: rewrite the frontmatter
 * `status` (the source of truth), `git mv` the file to the new folder, commit, and push.
 * A non-fast-forward push means someone else moved the card first — the human lost the
 * race, so we discard our commit, take upstream, and report `rejected` for the board to
 * refresh. The `updated` stamp lets LWW reconcile a concurrent move deterministically.
 */

export interface MoveContext {
  /** ISO timestamp written as the card's `updated` (the LWW key). */
  readonly now: string;
}

export interface MoveResult {
  readonly ok: boolean;
  /** true when the push lost a race — the board should refresh from upstream. */
  readonly rejected: boolean;
  /** the card as we tried to move it (its new status). */
  readonly card: Card;
}

export async function moveCard(
  git: GitOps,
  store: FileStore,
  card: Card,
  toStatus: CardStatus,
  ctx: MoveContext,
): Promise<MoveResult> {
  if (card.status === toStatus) {
    return { ok: true, rejected: false, card }; // dropping a card back in its own column
  }

  const moved = withStatus(card, toStatus, ctx.now);
  await git.mv(cardPath(card.status, card.id), cardPath(toStatus, card.id));
  await store.write(cardPath(toStatus, card.id), serializeCard(moved));
  await git.add([cardPath(toStatus, card.id)]);
  await git.commit(`move ${card.id}: ${card.status} → ${toStatus}`);

  const push = await git.push();
  if (push.ok) {
    return { ok: true, rejected: false, card: moved };
  }
  if (push.rejected) {
    // Lost the race: drop our commit and take the winner's state so the tree stays clean.
    await git.resetHardToUpstream();
    await git.pullRebase();
    return { ok: false, rejected: true, card: moved };
  }
  throw new Error(`move push failed for ${card.id} (not a lost race): ${push.stderr.trim()}`);
}
