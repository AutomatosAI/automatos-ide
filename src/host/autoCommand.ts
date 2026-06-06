import * as vscode from 'vscode';
import { FileStore } from '../fs/fileStore';
import { GitOps } from '../git/gitOps';
import { Card } from '../core/cards/card';
import { readBoard } from '../core/board/boardStore';
import { columnCards } from '../core/board/board';
import { cardPath } from '../core/board/layout';
import { serializeCard } from '../core/cards/frontmatter';
import { decomposePrd } from '../core/auto/decompose';
import { readHeartbeats, stalenessThresholdMs } from '../core/heartbeat/heartbeat';
import { workerLiveness, WorkerLiveness } from '../core/heartbeat/liveness';

/**
 * AUTO's two surfaces in the cockpit (21 §2, 22 §3) — making the overseer visible.
 *
 * AUTO does not build; it keeps the board honest and breaks PRDs down. Two host commands:
 *   - {@link autoStatus}: a read-only overseer report (the claim queue, who owns what,
 *     what AUTO watches) into an output channel — no git writes, safe to run any time.
 *   - {@link autoDecompose}: AUTO's one concrete write — split a PRD's `## Tasks`
 *     checklist into child `ready` cards and push them, so the team can claim the pieces.
 * The judgment (reclaim/escalate on stale workers) is the unattended loop's; it stays out
 * until heartbeats are wired, and the status report says so rather than faking it.
 */

let channel: vscode.OutputChannel | undefined;

function output(): vscode.OutputChannel {
  channel ??= vscode.window.createOutputChannel('Automatos AUTO');
  return channel;
}

export async function autoStatus(store: FileStore, heartbeatIntervalSeconds: number): Promise<void> {
  const board = await readBoard(store);
  const ready = columnCards(board, 'ready');
  const inProgress = columnCards(board, 'in-progress');
  const review = columnCards(board, 'review');
  const done = columnCards(board, 'done');

  const beats = await readHeartbeats(store);
  const threshold = stalenessThresholdMs(heartbeatIntervalSeconds);
  const liveness = workerLiveness(inProgress, beats, new Date().toISOString(), threshold);
  const titleById = new Map(inProgress.map((card) => [card.id, card.title]));

  const out = output();
  out.clear();
  out.appendLine('AUTO — workspace overseer');
  out.appendLine('I keep the board honest and route work. I do not build; the workers do.');
  out.appendLine('');
  out.appendLine(`Queue: ${ready.length} ready · ${inProgress.length} in progress · ${review.length} in review · ${done.length} done`);
  out.appendLine('');

  out.appendLine(`Next to claim (priority order):`);
  if (ready.length === 0) {
    out.appendLine('  (inbox empty — nothing to claim)');
  } else {
    for (const card of ready.slice(0, 5)) {
      out.appendLine(`  • ${card.id}  P${card.priority}  ${card.title}`);
    }
  }
  out.appendLine('');

  out.appendLine('In progress (worker liveness):');
  if (liveness.length === 0) {
    out.appendLine('  (no active workers)');
  } else {
    for (const row of liveness) {
      const title = titleById.get(row.cardId) ?? '';
      out.appendLine(`  • ${row.cardId}  @${row.owner ?? '(unowned)'}  ${livenessLabel(row)}  ${title}`);
    }
  }
  out.appendLine('');
  out.appendLine('What I watch: a worker whose heartbeat goes stale → reclaim its card to ready;');
  out.appendLine('a live worker stuck too long → escalate to a human. This view is read-only —');
  out.appendLine('auto-reclaim stays off until workers emit heartbeats, so a "no heartbeat" worker');
  out.appendLine('is reported as unknown, never reclaimed on a guess.');
  out.show(true);
}

/** Human-readable liveness for the status report: state plus how long since the last beat. */
function livenessLabel(row: WorkerLiveness): string {
  if (row.state === 'no-beat') {
    return 'no heartbeat yet';
  }
  const seconds = row.sinceMs === null ? '?' : Math.round(row.sinceMs / 1000);
  return `${row.state} (${seconds}s ago)`;
}

export async function autoDecompose(store: FileStore, git: GitOps, parent: Card): Promise<void> {
  const children = decomposePrd(parent, { now: new Date().toISOString() });
  if (children.length === 0) {
    vscode.window.showInformationMessage(
      `${parent.id} has no "## Tasks" checklist to split — add one, then decompose.`,
    );
    return;
  }

  const paths: string[] = [];
  for (const child of children) {
    const path = cardPath('ready', child.id);
    await store.write(path, serializeCard(child));
    paths.push(path);
  }
  await git.add(paths);
  await git.commit(`auto: decompose ${parent.id} into ${children.length} task(s)`);

  const push = await git.push();
  if (push.rejected) {
    await git.resetHardToUpstream();
    await git.pullRebase();
    vscode.window.showInformationMessage('A teammate changed the board first — took their state.');
    return;
  }
  if (!push.ok) {
    vscode.window.showErrorMessage(`Decompose push failed: ${push.stderr.trim()}`);
    return;
  }
  vscode.window.showInformationMessage(
    `AUTO split ${parent.id} into ${children.length} ready card(s): ${children.map((c) => c.id).join(', ')}`,
  );
}
