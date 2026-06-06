import YAML from 'yaml';
import { splitFrontmatter } from '../cards/frontmatter';
import { FileStore } from '../../fs/fileStore';

/**
 * Agent memory — durable notes a worker leaves for its future self and others (23 §2).
 *
 * A note is a small markdown file under `memory/<agent>/`, with frontmatter (who, when,
 * tags) and a free-text body. Recall is deliberately dumb: read the notes and grep them
 * (no embeddings, no vector store — this is the git-native reality, not Automatos's
 * cloud body). Parse/serialize/grep are pure; reads and writes go through a FileStore.
 */

export interface Note {
  readonly agent: string;
  /** ISO timestamp the note was written — also its sort key and filename seed. */
  readonly at: string;
  readonly tags: readonly string[];
  readonly text: string;
}

export const MEMORY_DIR = 'memory';

export function notePath(agent: string, at: string): string {
  return `${MEMORY_DIR}/${agent}/${at.replace(/[:.]/g, '-')}.md`;
}

export function serializeNote(note: Note): string {
  const fm = YAML.stringify({ agent: note.agent, at: note.at, tags: [...note.tags] }).trimEnd();
  return `---\n${fm}\n---\n${note.text.trim()}\n`;
}

export function parseNote(raw: string): Note {
  const { frontmatter, body } = splitFrontmatter(raw);
  const parsed: unknown = YAML.parse(frontmatter) ?? {};
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('note frontmatter must be a YAML mapping');
  }
  const fm = parsed as Record<string, unknown>;
  const agent = requireString(fm, 'agent');
  const at = requireString(fm, 'at');
  const tags = Array.isArray(fm.tags) ? fm.tags.map((t) => String(t)) : [];
  return { agent, at, tags, text: body.trim() };
}

export async function appendNote(store: FileStore, note: Note): Promise<void> {
  await store.write(notePath(note.agent, note.at), serializeNote(note));
}

/** Read one agent's notes (or `[]` if it has none yet). */
export async function readAgentNotes(store: FileStore, agent: string): Promise<readonly Note[]> {
  return readNotesIn(store, `${MEMORY_DIR}/${agent}`);
}

/** Read every agent's notes across the memory dir. */
export async function readAllNotes(store: FileStore): Promise<readonly Note[]> {
  const agents = await store.list(MEMORY_DIR);
  const all: Note[] = [];
  for (const agent of agents) {
    all.push(...(await readNotesIn(store, `${MEMORY_DIR}/${agent}`)));
  }
  return all;
}

/**
 * Grep notes for a query (case-insensitive), matching the body or any tag, newest
 * first. An empty query returns everything (still newest-first) — a plain "recall all".
 */
export function grepNotes(notes: readonly Note[], query: string): readonly Note[] {
  const q = query.trim().toLowerCase();
  const matches = q.length === 0 ? [...notes] : notes.filter((note) => noteMatches(note, q));
  return matches.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Convenience: read every note and grep it. */
export async function recall(store: FileStore, query: string): Promise<readonly Note[]> {
  return grepNotes(await readAllNotes(store), query);
}

async function readNotesIn(store: FileStore, dir: string): Promise<Note[]> {
  const names = await store.list(dir);
  const notes: Note[] = [];
  for (const name of names) {
    if (!name.endsWith('.md')) {
      continue;
    }
    try {
      notes.push(parseNote(await store.read(`${dir}/${name}`)));
    } catch {
      // a malformed note is skipped, not fatal to recall
    }
  }
  return notes;
}

function noteMatches(note: Note, lowerQuery: string): boolean {
  return (
    note.text.toLowerCase().includes(lowerQuery) ||
    note.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

function requireString(fm: Record<string, unknown>, key: string): string {
  const value = fm[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`note frontmatter: "${key}" is required and must be a non-empty string`);
  }
  return value;
}
