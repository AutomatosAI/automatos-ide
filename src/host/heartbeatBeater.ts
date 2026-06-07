import * as vscode from 'vscode';
import { FileStore } from '../fs/fileStore';
import { Heartbeat, heartbeatPathForCard, serializeHeartbeat } from '../core/heartbeat/heartbeat';

/**
 * The heartbeat PRODUCER — the sidecar beater that makes AUTO's liveness view real (21 §2).
 *
 * Liveness here means one concrete thing: "is the engine terminal still open on THIS
 * machine?". While it is, we write a fresh beat to a LOCAL, gitignored `.heartbeats/`
 * every interval; when the human closes the terminal we stop, and the last beat ages into
 * staleness — that aging IS the death signal AUTO reads. We deliberately do NOT delete the
 * file (a vanished beat and a stale beat would be indistinguishable, and FileStore has no
 * delete by design): a stale beat is a confirm-first reclaim candidate, never an auto-yank.
 *
 * This is host glue (it owns a timer and a vscode listener), so it is not unit-tested; the
 * only logic it carries — the card-keyed path — is covered in the heartbeat core.
 */

const MIN_INTERVAL_SECONDS = 1;

export interface BeaterDeps {
  /** Writes under the CONTROL repo root, where AUTO reads `.heartbeats/` — not the worktree. */
  readonly store: FileStore;
  /** The launching human's handle, recorded truthfully as the beat's agent. */
  readonly agent: string;
  readonly cardId: string;
  readonly intervalSeconds: number;
  /** Beating stops when THIS terminal closes (the worker process is gone). */
  readonly terminal: vscode.Terminal;
}

/**
 * Begin beating for a launched worker and return a {@link vscode.Disposable} that stops it.
 * The beater also self-stops when its terminal closes, so callers that can't track the
 * disposable (e.g. a fire-and-forget launch) never leak a timer.
 */
export function startHeartbeat(deps: BeaterDeps): vscode.Disposable {
  const { store, agent, cardId, terminal } = deps;
  const periodMs = Math.max(deps.intervalSeconds, MIN_INTERVAL_SECONDS) * 1000;
  const path = heartbeatPathForCard(cardId);

  const writeBeat = (): void => {
    const hb: Heartbeat = { agent, card: cardId, status: 'building', at: new Date().toISOString() };
    // Fire-and-forget on purpose: a failed write just makes this worker look stale, which
    // AUTO surfaces as a confirm-first reclaim candidate — the safe failure, not a crash.
    void store.write(path, serializeHeartbeat(hb)).catch(() => undefined);
  };

  writeBeat(); // immediate first beat so a freshly launched worker reads as live at once
  const timer = setInterval(writeBeat, periodMs);

  let closeSub: vscode.Disposable | undefined;
  const stop = (): void => {
    clearInterval(timer);
    closeSub?.dispose();
    closeSub = undefined;
  };

  closeSub = vscode.window.onDidCloseTerminal((closed) => {
    if (closed === terminal) {
      stop();
    }
  });

  return { dispose: stop };
}
