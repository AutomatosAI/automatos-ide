import { FileStore } from '../../fs/fileStore';

/**
 * Worker liveness via heartbeat files (replacing Canopy's tmux pane-scraping).
 *
 * Each worker writes `.heartbeats/<agent>.json` every `heartbeat_interval_seconds`
 * with what it is doing and when. AUTO reads them to tell a live worker from a dead
 * one: if a beat is older than a few intervals, the process is presumed gone and its
 * card is reclaimed. The model is persistence-agnostic — it reads/writes through a
 * {@link FileStore}, so whether the dir is local or committed is a deployment choice.
 */

export interface Heartbeat {
  readonly agent: string;
  /** Card id the worker is on, or null when idle/between cards. */
  readonly card: string | null;
  /** Free-form phase: building | testing | reviewing | idle. */
  readonly status: string;
  /** ISO timestamp of this beat — the staleness key. */
  readonly at: string;
}

export const HEARTBEATS_DIR = '.heartbeats';

export function heartbeatPath(agent: string): string {
  return `${HEARTBEATS_DIR}/${agent}.json`;
}

/**
 * The beat FILE is keyed by card, not agent: one human launching three workers would
 * otherwise have all three overwrite a single `<agent>.json` and erase each other's
 * liveness. The card id is unique per worker, so `<card>.json` keeps them distinct. The
 * beat's `card` field still drives the join in {@link readHeartbeats} consumers.
 */
export function heartbeatPathForCard(cardId: string): string {
  return `${HEARTBEATS_DIR}/${cardId}.json`;
}

/** Milliseconds AUTO waits past the beat interval before presuming a worker dead. */
export function stalenessThresholdMs(intervalSeconds: number, missedBeats = 3): number {
  return intervalSeconds * missedBeats * 1000;
}

export function serializeHeartbeat(hb: Heartbeat): string {
  return `${JSON.stringify(hb, null, 2)}\n`;
}

/** Parse a heartbeat file (external input) — validates required fields at the boundary. */
export function parseHeartbeat(raw: string): Heartbeat {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('heartbeat must be a JSON object');
  }
  const hb = parsed as Record<string, unknown>;
  const agent = requireString(hb, 'agent');
  const status = requireString(hb, 'status');
  const at = requireString(hb, 'at');
  if (Number.isNaN(Date.parse(at))) {
    throw new Error(`heartbeat ${agent}: "at" is not a valid timestamp (${at})`);
  }
  const card = hb.card === null || hb.card === undefined ? null : String(hb.card);
  return { agent, card, status, at };
}

/** Age of a beat in ms relative to `now`; a missing/unparseable beat reads as +Infinity. */
export function ageMs(hb: Heartbeat, now: string): number {
  const then = Date.parse(hb.at);
  const current = Date.parse(now);
  if (Number.isNaN(then) || Number.isNaN(current)) {
    return Number.POSITIVE_INFINITY;
  }
  return current - then;
}

export function isStale(hb: Heartbeat, now: string, thresholdMs: number): boolean {
  return ageMs(hb, now) > thresholdMs;
}

export async function writeHeartbeat(store: FileStore, hb: Heartbeat): Promise<void> {
  await store.write(heartbeatPath(hb.agent), serializeHeartbeat(hb));
}

/** Read every heartbeat in the dir; skips non-json and unparseable files defensively. */
export async function readHeartbeats(store: FileStore): Promise<readonly Heartbeat[]> {
  const names = await store.list(HEARTBEATS_DIR);
  const beats: Heartbeat[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) {
      continue;
    }
    try {
      beats.push(parseHeartbeat(await store.read(`${HEARTBEATS_DIR}/${name}`)));
    } catch {
      // A half-written or corrupt beat is treated as "no beat" — its agent will simply
      // look stale, which is the safe failure (reclaim) rather than a hard crash.
    }
  }
  return beats;
}

/** The agents whose most recent beat is older than the staleness threshold. */
export function staleAgents(
  beats: readonly Heartbeat[],
  now: string,
  thresholdMs: number,
): readonly Heartbeat[] {
  return beats.filter((hb) => isStale(hb, now, thresholdMs));
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`heartbeat: "${key}" is required and must be a non-empty string`);
  }
  return value;
}
