import * as vscode from 'vscode';
import { FileStore } from '../fs/fileStore';
import { GitOps } from '../git/gitOps';
import { MEMORY_DIR } from '../core/memory/notes';
import {
  DEFAULT_KEEP_RECENT,
  applyConsolidation,
  planConsolidationFor,
} from '../core/memory/consolidate';

/**
 * Consolidate every agent's cold notes into a digest, in one commit (23 §3).
 *
 * Boundary glue around the pure planner: list the agents under `memory/`, plan each
 * agent's fold, apply the plans (write digest + `git rm` originals + stage the digest),
 * then commit and push once. A push rejection means a teammate consolidated first, so we
 * discard our work and take their tree — the digest is regenerable, never worth a fight.
 */
export async function consolidateMemory(store: FileStore, git: GitOps): Promise<void> {
  const agents = await store.list(MEMORY_DIR);
  const ctx = { now: new Date().toISOString() };
  let applied = 0;
  for (const agent of agents) {
    const plan = await planConsolidationFor(store, agent, ctx, DEFAULT_KEEP_RECENT);
    if (plan) {
      await applyConsolidation(git, store, plan);
      applied += 1;
    }
  }
  if (applied === 0) {
    vscode.window.showInformationMessage('Memory consolidation: nothing to fold yet.');
    return;
  }
  await git.commit(`memory: consolidate ${applied} agent(s)`);
  const push = await git.push();
  if (push.rejected) {
    await git.resetHardToUpstream();
    await git.pullRebase();
    vscode.window.showInformationMessage('A teammate consolidated first — took their state.');
    return;
  }
  if (!push.ok) {
    vscode.window.showErrorMessage(`Consolidation push failed: ${push.stderr.trim()}`);
    return;
  }
  vscode.window.showInformationMessage(`Consolidated memory for ${applied} agent(s).`);
}
