import YAML from 'yaml';

/**
 * Team secrets at rest — SOPS + age policy (26 §2).
 *
 * Team-shared secrets live in git, but ONLY encrypted with SOPS to age recipients. This
 * module owns the deterministic, security-critical pieces: generating `.sops.yaml` from a
 * list of PUBLIC age recipients (and refusing, loudly, to ever write a private key there),
 * and building the `sops` CLI argv. Running `sops` is boundary I/O (a CommandRunner);
 * what is OURS and pure is the config and the command shape.
 */

export const SOPS_BIN = 'sops';

/** Which files in the control repo are encrypted. Conventionally everything under secrets/. */
export const DEFAULT_SECRETS_PATH_REGEX = 'secrets/.*\\.(ya?ml|json|env)$';

const PUBLIC_AGE_RECIPIENT = /^age1[0-9a-z]+$/;
const AGE_PRIVATE_KEY = /^AGE-SECRET-KEY-/i;

export interface SopsConfigOptions {
  /** Override which paths the creation rule encrypts. */
  readonly pathRegex?: string;
}

export function isPublicAgeRecipient(value: string): boolean {
  return PUBLIC_AGE_RECIPIENT.test(value);
}

/**
 * Guard a single recipient before it can reach `.sops.yaml`. The private-key check comes
 * first and is deliberately explicit: a leaked age private key is a worst-case incident.
 */
export function assertPublicAgeRecipient(value: string): void {
  if (AGE_PRIVATE_KEY.test(value)) {
    throw new Error(
      'refusing to write an age PRIVATE key into .sops.yaml — recipients must be public age keys (age1...)',
    );
  }
  if (!isPublicAgeRecipient(value)) {
    throw new Error(`not a valid public age recipient: ${JSON.stringify(value)}`);
  }
}

/** Build `.sops.yaml` content from public age recipients. Throws if the list is empty. */
export function buildSopsConfig(
  recipients: readonly string[],
  options: SopsConfigOptions = {},
): string {
  if (recipients.length === 0) {
    throw new Error('cannot build .sops.yaml with no recipients — nothing could decrypt');
  }
  recipients.forEach(assertPublicAgeRecipient);
  const config = {
    creation_rules: [
      {
        path_regex: options.pathRegex ?? DEFAULT_SECRETS_PATH_REGEX,
        age: recipients.join(','),
      },
    ],
  };
  return YAML.stringify(config);
}

export type SopsAction = 'encrypt' | 'decrypt';

export interface SopsCommand {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * Build the `sops` argv. Encrypt rewrites the file in place (recipients come from
 * `.sops.yaml`); decrypt prints cleartext to stdout, which the caller pipes — never to a
 * file in a worktree. The path is guarded so it can't be smuggled in as a flag.
 */
export function sopsCommand(action: SopsAction, file: string): SopsCommand {
  assertEncryptablePath(file);
  const args =
    action === 'encrypt' ? ['--encrypt', '--in-place', file] : ['--decrypt', file];
  return { command: SOPS_BIN, args };
}

function assertEncryptablePath(file: string): void {
  if (file.length === 0) {
    throw new Error('sops: file path is required');
  }
  if (file.startsWith('-')) {
    throw new Error(`sops: refusing a path that looks like a flag: ${JSON.stringify(file)}`);
  }
  if (/[\0\n\r]/.test(file)) {
    throw new Error('sops: file path contains illegal control characters');
  }
}
