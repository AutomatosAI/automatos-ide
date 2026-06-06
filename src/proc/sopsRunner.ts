import { CommandRunner } from './commandRunner';
import { sopsCommand } from '../core/secrets/sops';
import { parseDotenv, toInjectableEnv } from '../core/secrets/secretEnv';

/**
 * Decrypt a team secrets file and hand back a worker-injectable env map (26 §3).
 *
 * The only boundary step — shelling out to `sops -d` — lives here; the cleartext is
 * piped through stdout and never written to a worktree file. Parsing and validating the
 * result is the pure core ({@link parseDotenv} + {@link toInjectableEnv}), so a malformed
 * env name fails loudly. A non-zero exit from sops is surfaced, not swallowed.
 */
export async function loadTeamSecrets(
  runner: CommandRunner,
  file: string,
  cwd?: string,
): Promise<Readonly<Record<string, string>>> {
  const { command, args } = sopsCommand('decrypt', file);
  const result = await runner.run(command, args, cwd);
  if (result.code !== 0) {
    throw new Error(`sops decrypt failed for ${file} (code ${result.code}): ${result.stderr.trim()}`);
  }
  return toInjectableEnv(parseDotenv(result.stdout));
}
