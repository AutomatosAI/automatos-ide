import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { EngineProbe } from '../core/engines/preflight';
import { CommandRunner, execCommandRunner } from './commandRunner';

/**
 * The production {@link EngineProbe}: PATH check by running `<bin> --version`, login
 * check by the presence of cached credential files under the home dir.
 *
 * The credential paths are a HEURISTIC (each CLI stores auth differently and may move
 * it between versions) kept in one table so they are easy to update; on macOS some
 * CLIs use the keychain instead of a file, in which case the login check may
 * under-report. It only ever gates an unattended launch, never blocks manual use.
 */

const CREDENTIAL_PATHS: Readonly<Record<string, readonly string[]>> = {
  claude: ['.claude/.credentials.json', '.claude.json'],
  codex: ['.codex/auth.json'],
  gemini: ['.gemini/oauth_creds.json', '.gemini/google_accounts.json'],
};

export function nodeEngineProbe(
  runner: CommandRunner = execCommandRunner,
  home: string = homedir(),
): EngineProbe {
  return {
    async onPath(bin) {
      const { code } = await runner.run(bin, ['--version']);
      return code === 0;
    },
    async loggedIn(engine) {
      const candidates = CREDENTIAL_PATHS[engine] ?? [];
      for (const rel of candidates) {
        if (await exists(join(home, rel))) {
          return true;
        }
      }
      return false;
    },
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
