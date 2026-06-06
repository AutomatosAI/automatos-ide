import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FileStore } from '../fs/fileStore';
import { GitOps } from '../git/gitOps';
import { execGitRunner } from '../git/runner';
import { Config } from '../core/config/config';
import { Card } from '../core/cards/card';
import { EngineProbe, preflightEngine } from '../core/engines/preflight';
import { buildInteractiveLaunchCommand } from '../core/engines/engineAdapter';
import { engineForCard, branchForCard } from '../core/supervisor/supervisorPlan';
import { buildWorkerPrompt } from '../core/worker/workerPrompt';
import { toShellCommandLine } from '../core/worker/launchShell';
import { claimSpecificCard } from '../core/claim/claimEngine';
import { projectRepoDir } from './projectRepoDir';
import { startHeartbeat } from './heartbeatBeater';

/**
 * Launch a CLI worker on one card — the headline action the cockpit was missing (12 §3.3).
 *
 * Boundary glue, so NOT unit-tested (no Extension Host under vitest); every decision it
 * makes is delegated to covered core — preflight, the claim CAS, the worker prompt, the
 * injection-safe shell line. The shape is: refuse an engine we can't run, take the card
 * via the same git lock a teammate would, resolve the repo the card's `project` targets
 * (NOT always the control repo — this is what makes the cockpit multi-repo), give the
 * worker its own worktree there so it never touches the user's checkout, then drop the
 * human into a live engine session they can watch and steer. Subscription login is
 * ambient in `~/.<engine>`, so nothing here ever sees a key.
 */

const WORKTREE_DIRNAME = '.automatos-worktrees';
/** Fallback PR base only when the target repo's branch can't be read (e.g. detached HEAD). */
const FALLBACK_BASE_BRANCH = 'main';

export interface LaunchDeps {
  readonly root: string;
  readonly store: FileStore;
  readonly git: GitOps;
  /** The launching human's handle — written as the card owner. */
  readonly me: string;
  readonly config: Config;
  readonly probe: EngineProbe;
}

export async function launchWorkerForCard(deps: LaunchDeps, card: Card): Promise<void> {
  const engine = engineForCard(card, deps.config.agents.defaultEngine);

  const pf = await preflightEngine(engine, deps.probe);
  if (!pf.ok) {
    vscode.window.showErrorMessage(`Can't launch ${engine}: ${pf.detail}`);
    return;
  }

  const claim = await resolveClaim(deps, card);
  if (!claim.ok) {
    vscode.window.showWarningMessage(claim.reason);
    return;
  }
  const claimed = claim.card;
  const branch = claimed.branch ?? branchForCard(card.id);

  const target = resolveTargetRepo(deps, claimed);
  if (!target.ok) {
    vscode.window.showErrorMessage(target.reason);
    return;
  }

  const worktreePath = resolve(target.repoPath, '..', WORKTREE_DIRNAME, card.id);
  try {
    if (!existsSync(worktreePath)) {
      await target.git.worktreeAdd(worktreePath, branch, 'HEAD');
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Couldn't make a worktree for ${card.id}: ${(error as Error).message}`,
    );
    return;
  }

  const baseBranch = await resolveBaseBranch(target.git);
  const prompt = buildWorkerPrompt(claimed, { branch, baseBranch });
  const { command, args } = buildInteractiveLaunchCommand(engine, prompt);
  const terminal = vscode.window.createTerminal({ name: `${engine} · ${card.id}`, cwd: worktreePath });
  terminal.show();
  terminal.sendText(toShellCommandLine(command, args));

  // Beat to the CONTROL repo's local `.heartbeats/` (deps.store), not the worktree — that
  // is where AUTO reads liveness. Self-stops when this terminal closes.
  startHeartbeat({
    store: deps.store,
    agent: deps.me,
    cardId: card.id,
    intervalSeconds: deps.config.sync.heartbeatIntervalSeconds,
    terminal,
  });

  vscode.window.showInformationMessage(`Launched ${engine} on ${card.id} — ${card.title}`);
}

type ClaimOutcome = { readonly ok: true; readonly card: Card } | { readonly ok: false; readonly reason: string };

/**
 * Decide how this card becomes launchable: a fresh `ready` card is claimed via the CAS;
 * a card already `in-progress` under me is resumed (re-launch into its existing worktree);
 * anything else is someone else's work or a finished card and is refused.
 */
async function resolveClaim(deps: LaunchDeps, card: Card): Promise<ClaimOutcome> {
  if (card.status === 'in-progress') {
    if (card.owner === deps.me) {
      return { ok: true, card };
    }
    return { ok: false, reason: `${card.id} is already in progress under @${card.owner ?? 'someone'}.` };
  }
  if (card.status !== 'ready') {
    return { ok: false, reason: `${card.id} is "${card.status}" — only ready cards can be launched.` };
  }
  const claimed = await claimSpecificCard(deps.git, deps.store, {
    owner: deps.me,
    now: () => new Date().toISOString(),
    branchFor: (c) => branchForCard(c.id),
  }, card);
  if (!claimed) {
    return { ok: false, reason: `${card.id} was claimed by a teammate first — board refreshed.` };
  }
  return { ok: true, card: claimed };
}

type TargetRepo =
  | { readonly ok: true; readonly repoPath: string; readonly git: GitOps }
  | { readonly ok: false; readonly reason: string };

/**
 * The repo this card builds in. A card whose `project` maps to a `project_repos` entry
 * (14 §8) builds in THAT repo — `~` is expanded and a relative path is resolved against
 * the control root, so config can be terse. A missing or unmatched project falls back to
 * the control repo itself (single-repo boards still work). A configured-but-absent path
 * is a config error we refuse loudly rather than silently building in the wrong tree.
 */
function resolveTargetRepo(deps: LaunchDeps, card: Card): TargetRepo {
  const repoPath = projectRepoDir(card, deps.config, deps.root);
  if (repoPath === deps.root) {
    return { ok: true, repoPath, git: deps.git };
  }
  if (!existsSync(repoPath)) {
    return {
      ok: false,
      reason: `Project repo "${card.project}" not found at ${repoPath}. Fix its path under project_repos in config.yml.`,
    };
  }
  return { ok: true, repoPath, git: new GitOps(execGitRunner, repoPath) };
}

/**
 * The branch the worker forks from is the branch it should PR back into, so read it from
 * the target repo. A detached HEAD (or any read failure) has no PR-able base, so we fall
 * back to `main` rather than telling the worker to target the literal string "HEAD".
 */
async function resolveBaseBranch(git: GitOps): Promise<string> {
  try {
    const branch = await git.currentBranch();
    return branch && branch !== 'HEAD' ? branch : FALLBACK_BASE_BRANCH;
  } catch {
    return FALLBACK_BASE_BRANCH;
  }
}
