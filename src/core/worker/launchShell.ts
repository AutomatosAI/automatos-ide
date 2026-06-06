/**
 * Turn a {command, argv} into one POSIX shell line safe to hand a terminal (12 §3.3).
 *
 * The manual launcher spawns the engine in an integrated terminal so the human can watch
 * and steer it; a terminal runs a SHELL line, not an argv, so we have to render the argv
 * back to a string. The prompt is attacker-shaped (a PRD body can contain `$()`, backticks,
 * `;`, newlines), so every token is wrapped in single quotes — inside which the shell
 * expands NOTHING — and the only dangerous character, the single quote itself, is closed,
 * escaped, and reopened (`'\''`). No `$`, subshell, or separator can ever break out.
 */

/** Single-quote one argument so the shell treats it as a single, literal token. */
export function posixShellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** Render a command + argv as one injection-safe POSIX shell line. */
export function toShellCommandLine(command: string, args: readonly string[]): string {
  return [command, ...args].map(posixShellQuote).join(' ');
}
