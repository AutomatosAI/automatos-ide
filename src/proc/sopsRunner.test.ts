import { describe, it, expect } from 'vitest';
import { CommandRunner, ExecResult } from './commandRunner';
import { loadTeamSecrets } from './sopsRunner';

function fakeRunner(result: Partial<ExecResult>): CommandRunner & { lastArgs?: readonly string[] } {
  const runner: CommandRunner & { lastArgs?: readonly string[] } = {
    async run(_command, args) {
      runner.lastArgs = args;
      return { code: 0, stdout: '', stderr: '', ...result };
    },
  };
  return runner;
}

describe('loadTeamSecrets', () => {
  it('decrypts via sops and returns a validated env map', async () => {
    const runner = fakeRunner({ stdout: 'API_TOKEN=abc\nDB_URL=postgres://x\n' });
    const env = await loadTeamSecrets(runner, 'secrets/team.env');
    expect(env).toEqual({ API_TOKEN: 'abc', DB_URL: 'postgres://x' });
    expect(runner.lastArgs).toEqual(['--decrypt', 'secrets/team.env']);
  });

  it('throws when sops exits non-zero', async () => {
    const runner = fakeRunner({ code: 1, stderr: 'no matching creation rule' });
    await expect(loadTeamSecrets(runner, 'secrets/team.env')).rejects.toThrow(/sops decrypt failed/);
  });

  it('propagates env-name validation from the pure core', async () => {
    const runner = fakeRunner({ stdout: 'bad-name=x\n' });
    await expect(loadTeamSecrets(runner, 'secrets/team.env')).rejects.toThrow(/valid environment variable name/);
  });
});
