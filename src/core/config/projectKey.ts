/**
 * A project's short key — the `AUTO` in `AUTO-0145`.
 *
 * Each project gets its own PRD sequence (so `automatos-ai` and `ClinicFlow` number
 * independently), and the key is what keeps those ids globally unique on one flat queue:
 * `AUTO-0145` and `CLINIC-0050` never collide as filenames. A user may set a short key
 * explicitly in `config.yml` (`key: AUTO`); when omitted we derive one from the name. The
 * control repo itself — a card with no project — uses {@link DEFAULT_PROJECT_KEY}, so plain
 * `PRD-NNNN` ids stay valid.
 */

/** The key for the control repo / an unmapped project — keeps bare `PRD-NNNN` ids valid. */
export const DEFAULT_PROJECT_KEY = 'PRD';

/** A usable key: letter-led, uppercase alphanumerics (no separators — those break id parsing). */
const KEY_RE = /^[A-Z][A-Z0-9]*$/;

/**
 * True when `value` is shaped like a key (letter-led alphanumerics, either case). Used by
 * the Settings form to spot an optional trailing `=KEY` on a `name=path` line without
 * mistaking a path segment for a key.
 */
export function isProjectKey(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(value);
}

function clean(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Derive a default key from a project name: uppercase, strip everything but letters and
 * digits. Falls back to {@link DEFAULT_PROJECT_KEY} when the name yields nothing a key can
 * start with (empty, or digit-led), so id minting always has a valid prefix to work with.
 */
export function deriveProjectKey(name: string): string {
  const candidate = clean(name);
  return KEY_RE.test(candidate) ? candidate : DEFAULT_PROJECT_KEY;
}

/**
 * Normalize a user-supplied key (uppercased, separators stripped); when it is blank or
 * unusable, derive one from `name` instead. The single boundary every key passes through,
 * so downstream code can treat `ProjectRepo.key` as always-present and always-valid.
 */
export function normalizeProjectKey(raw: unknown, name: string): string {
  if (typeof raw === 'string') {
    const candidate = clean(raw);
    if (KEY_RE.test(candidate)) {
      return candidate;
    }
  }
  return deriveProjectKey(name);
}
