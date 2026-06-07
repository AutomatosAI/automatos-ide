/**
 * PRD ids: a per-project key plus a zero-padded number, e.g. `AUTO-0145`, `CLINIC-0050`,
 * or `PRD-0007` for the control repo's own queue.
 *
 * The number sequence is scoped to the key, so every project counts up independently while
 * the ids stay globally unique on one flat `prds/` queue — no per-project folders, no
 * filename collisions. Pure string math; no board or git knowledge lives here.
 */

const PRD_ID_RE = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/;

export interface PrdId {
  readonly key: string;
  readonly num: number;
}

/** Split `KEY-NNNN` into its uppercase key and number, or null when it doesn't match. */
export function parsePrdId(id: string): PrdId | null {
  const match = PRD_ID_RE.exec(id);
  if (!match) {
    return null;
  }
  return { key: match[1].toUpperCase(), num: Number(match[2]) };
}

/** Build an id from a key and number, zero-padding the number to four digits. */
export function formatPrdId(key: string, num: number): string {
  return `${key}-${String(num).padStart(4, '0')}`;
}

/**
 * The next free id for `key`, given the ids already on the board. Only ids sharing this key
 * count toward the sequence, so a new project starts at `0001` no matter how high other
 * projects have climbed. Key matching is case-insensitive; the result is always uppercase.
 */
export function nextPrdId(existingIds: readonly string[], key: string): string {
  const wanted = key.toUpperCase();
  let max = 0;
  for (const id of existingIds) {
    const parsed = parsePrdId(id);
    if (parsed && parsed.key === wanted) {
      max = Math.max(max, parsed.num);
    }
  }
  return formatPrdId(wanted, max + 1);
}
