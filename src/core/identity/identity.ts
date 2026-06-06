/**
 * Who is acting — deriving a stable handle from a GitHub identity (25 §1).
 *
 * Every actor in the system (a human, the AUTO overseer, an ephemeral worker) needs one
 * handle that is safe to use everywhere it lands: a card's `owner`, a chat `from`, a
 * heartbeat filename (`.heartbeats/<handle>.json`), a memory dir (`memory/<handle>/`).
 * Filenames and git refs are unforgiving, so the handle must be lowercase, hyphenated,
 * and free of surprises. The GitHub *session* (vscode.authentication) is boundary I/O
 * handled elsewhere; what is OURS and deterministic is turning a login into an
 * {@link Identity} — pure and validated at the edge.
 */

export type AgentKind = 'human' | 'auto' | 'worker';

export interface Identity {
  /** The GitHub login this identity descends from, as GitHub reports it. */
  readonly login: string;
  readonly kind: AgentKind;
  /** The fs/git-safe id stamped onto cards, heartbeats, chat, and notes. */
  readonly handle: string;
}

/** The single persistent overseer's handle — one logical AUTO per control repo. */
export const AUTO_HANDLE = 'auto';

const VALID_HANDLE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Reduce an arbitrary string to a safe handle: lowercase, non-alphanumerics folded to
 * single hyphens, no leading/trailing/doubled hyphens. Throws if nothing usable remains
 * — an empty or symbol-only login is not a valid identity.
 */
export function sanitizeHandle(raw: string): string {
  const cleaned = raw
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (cleaned.length === 0) {
    throw new Error(`cannot derive a handle from ${JSON.stringify(raw)}: no usable characters`);
  }
  return cleaned;
}

export function isValidHandle(handle: string): boolean {
  return VALID_HANDLE.test(handle);
}

/** A team member acting as themselves. */
export function humanIdentity(login: string): Identity {
  return { login, kind: 'human', handle: sanitizeHandle(login) };
}

/** The persistent orchestrator, hosted under an operator's login. */
export function autoIdentity(login: string): Identity {
  return { login, kind: 'auto', handle: AUTO_HANDLE };
}

/**
 * An ephemeral worker, attributable to the human who launched it and the engine it runs.
 * The nonce keeps concurrent workers distinct so their heartbeats never collide.
 */
export function workerIdentity(login: string, engine: string, nonce: string): Identity {
  return { login, kind: 'worker', handle: sanitizeHandle(`${login}-${engine}-${nonce}`) };
}
