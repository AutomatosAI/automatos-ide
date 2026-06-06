import { Card, claimCard } from '../cards/card';
import { parseCard, serializeCard } from '../cards/frontmatter';
import { buildBoard, claimQueue } from '../board/board';
import { cardPath, folderPath, isCardFile } from '../board/layout';
import { GitOps } from '../../git/gitOps';
import { FileStore } from '../../fs/fileStore';

/**
 * The claim CAS — an agent grabs the next ready card by winning a push race (11 §4, 33 §3).
 *
 * The move IS the lock: claim a card by `git mv`-ing it inbox→in-progress, committing,
 * and pushing. A non-fast-forward push means someone claimed first — we LOST the race.
 * The loser's contract: discard our rejected commit (`reset --hard @{u}`), pull the
 * winner's state, and try the NEXT card — never the same one. One winner per card,
 * enforced by git, with no server or lock service.
 */

export interface ClaimContext {
  /** This agent's id, written as the card owner. */
  readonly owner: string;
  /** Clock → ISO timestamp; injected so claims are deterministic under test. */
  readonly now: () => string;
  /** The feature branch a claimed card gets; the worker builds on it. */
  readonly branchFor: (card: Card) => string;
}

/** A reasonable default branch name when the caller has no scheme of its own. */
export function defaultBranchFor(card: Card): string {
  return `feat/${card.id.toLowerCase()}`;
}

/** Read + parse the inbox, returning the ready cards in claim order (highest first). */
export async function readReadyQueue(store: FileStore): Promise<readonly Card[]> {
  const dir = folderPath('ready');
  const names = await store.list(dir);
  const cards: Card[] = [];
  for (const name of names) {
    if (!isCardFile(name)) {
      continue;
    }
    cards.push(parseCard(await store.read(`${dir}/${name}`)));
  }
  return claimQueue(buildBoard(cards));
}

/**
 * Claim the next ready card, or null when there is nothing left to win. Tries cards in
 * priority order; on each lost race it resets to upstream, pulls, and advances to the
 * next untried card — so a single call keeps fighting until it wins one or runs dry.
 */
export async function claimNextCard(
  git: GitOps,
  store: FileStore,
  ctx: ClaimContext,
): Promise<Card | null> {
  await git.pullRebase();
  const tried = new Set<string>();
  for (;;) {
    const queue = await readReadyQueue(store);
    const next = queue.find((card) => !tried.has(card.id));
    if (!next) {
      return null;
    }
    tried.add(next.id);
    const won = await claimSpecificCard(git, store, ctx, next);
    if (won) {
      return won;
    }
    // Lost the CAS: drop our rejected commit, take the winner's state, try the next.
    await git.resetHardToUpstream();
    await git.pullRebase();
  }
}

/**
 * Claim ONE chosen card via the same CAS as {@link claimNextCard}: `git mv`
 * inbox→in-progress, commit, push. Returns the claimed card, or null when the push lost
 * the race (a teammate claimed it first) so the caller can refresh. Throws only on a hard
 * push failure. This is the seam a manual "launch on this PRD" uses — the human picks the
 * card instead of taking the top of the queue, but the lock is identical.
 */
export async function claimSpecificCard(
  git: GitOps,
  store: FileStore,
  ctx: ClaimContext,
  card: Card,
): Promise<Card | null> {
  const claimed = claimCard(card, ctx.owner, ctx.branchFor(card), ctx.now());
  const from = cardPath('ready', card.id);
  const to = cardPath('in-progress', card.id);

  await git.mv(from, to);
  await store.write(to, serializeCard(claimed));
  await git.add([to]);
  await git.commit(`claim ${card.id}`);

  const push = await git.push();
  if (push.ok) {
    return claimed;
  }
  if (push.rejected) {
    return null;
  }
  throw new Error(`claim push failed for ${card.id} (not a lost race): ${push.stderr.trim()}`);
}
