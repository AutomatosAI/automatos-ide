import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FileStore } from '../fs/fileStore';
import { GitOps } from '../git/gitOps';
import { Config } from '../core/config/config';
import { Card } from '../core/cards/card';
import { EngineProbe, preflightEngine } from '../core/engines/preflight';
import { buildInteractiveLaunchCommand } from '../core/engines/engineAdapter';
import { engineForCard, branchForCard } from '../core/supervisor/supervisorPlan';
import { buildWorkerPrompt } from '../core/worker/workerPrompt';
import { toShellCommandLine } from '../core/worker/launchShell';
import { claimSpecificCard } from '../core/claim/claimEngine';

/**
 * Launch a CLI worker on one card — the headline action the cockpit was missing (12 §3.3).
 *
 * Boundary glue, so NOT unit-tested (no Extension Host under vitest); every decision it
 * makes is delegated to covered core — preflight, the claim CAS, the worker prompt, the
 * injection-safe shell line. The shape is: refuse an engine we can't run, take the card
 * via the same git lock a teammate would, give the worker its own worktree so it never
 * touches the user's checkout, then drop the human into a live engine session they can
 * watch and steer. Subscription login is ambient in `~/.<engine>`, so nothing here ever
 * sees a key.
 */

const WORKTREE_DIRNAME = '.automatos-worktrees';
const BASE_BRANCH = 'main';

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

  const worktreePath = resolve(deps.root, '..', WORKTREE_DIRNAME, card.id);
  try {
    if (!existsSync(worktreePath)) {
      await deps.git.worktreeAdd(worktreePath, branch, 'HEAD');
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Couldn't make a worktree for ${card.id}: ${(error as Error).message}`,
    );
    return;
  }

  const prompt = buildWorkerPrompt(claimed, { branch, baseBranch: BASE_BRANCH });
  const { command, args } = buildInteractiveLaunchCommand(engine, prompt);
  const terminal = vscode.window.createTerminal({ name: `${engine} · ${card.id}`, cwd: worktreePath });
  terminal.show();
  terminal.sendText(toShellCommandLine(command, args));
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
