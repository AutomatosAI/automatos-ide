/**
 * Secrets at runtime — injecting decrypted values into a worker (26 §3).
 *
 * A worker gets its secrets ONLY as environment variables on its terminal — never as a
 * file written into the worktree, which could be committed by accident. The decryption
 * itself (`sops -d`) is boundary I/O; what is OURS and pure is parsing the cleartext and
 * validating it into a safe env map. Validation is the security boundary: a malformed
 * variable name must fail loudly rather than silently corrupt a worker's environment.
 */

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

/** Parse a dotenv block (`KEY=value` lines) into a map. Blank lines and `#` comments are ignored. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      continue; // a line with no '=' is not an assignment
    }
    const key = line.slice(0, eq).trim();
    out[key] = unquote(line.slice(eq + 1).trim());
  }
  return out;
}

/**
 * Validate a secret map into an env object safe to inject into a worker's terminal.
 * Throws on any name that is not a POSIX env var — fail loudly at the boundary rather
 * than hand a worker a broken environment. Returns a frozen copy (never mutates input).
 */
export function toInjectableEnv(secrets: Record<string, string>): Readonly<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(secrets)) {
    if (!ENV_NAME.test(name)) {
      throw new Error(`not a valid environment variable name: ${JSON.stringify(name)}`);
    }
    if (value.includes('\0')) {
      throw new Error(`secret ${name} contains a null byte and cannot be an env value`);
    }
    env[name] = value;
  }
  return Object.freeze(env);
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}
