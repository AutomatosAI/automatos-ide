import { describe, it, expect } from 'vitest';
import { GitOps } from './gitOps';
import { FakeGitRunner, argStartsWith, argHas } from '../test/fakeGit';

const CWD = '/control';

describe('GitOps.push — the CAS signal', () => {
  it('reports success on exit 0', async () => {
    const runner = new FakeGitRunner();
    const result = await new GitOps(runner, CWD).push();
    expect(result).toEqual({ ok: true, rejected: false, localOnly: false, stderr: '' });
  });

  it('treats a repo with no remote as a local-only success, not a failure', async () => {
    const runner = new FakeGitRunner().on(argStartsWith('push'), {
      code: 128,
      stderr: 'fatal: No configured push destination.\nEither specify the URL from the command-line',
    });
    const result = await new GitOps(runner, CWD).push();
    expect(result.ok).toBe(true);
    expect(result.rejected).toBe(false);
    expect(result.localOnly).toBe(true);
  });

  it('classifies a non-fast-forward as a lost race (rejected)', async () => {
    const runner = new FakeGitRunner().on(argStartsWith('push'), {
      code: 1,
      stderr: '! [rejected]        main -> main (non-fast-forward)\nerror: failed to push some refs',
    });
    const result = await new GitOps(runner, CWD).push();
    expect(result.ok).toBe(false);
    expect(result.rejected).toBe(true);
  });

  it('does NOT mark an auth/network failure as rejected', async () => {
    const runner = new FakeGitRunner().on(argStartsWith('push'), {
      code: 128,
      stderr: 'fatal: could not read Username for https://github.com',
    });
    const result = await new GitOps(runner, CWD).push();
    expect(result.ok).toBe(false);
    expect(result.rejected).toBe(false);
    expect(result.localOnly).toBe(false);
  });
});

describe('GitOps mutations', () => {
  it('mv passes through to git mv', async () => {
    const runner = new FakeGitRunner();
    await new GitOps(runner, CWD).mv('prds/inbox/a.md', 'prds/in-progress/a.md');
    expect(runner.ran(argStartsWith('mv', 'prds/inbox/a.md', 'prds/in-progress/a.md'))).toBe(true);
  });

  it('commit passes the message', async () => {
    const runner = new FakeGitRunner();
    await new GitOps(runner, CWD).commit('claim PRD-0007');
    const call = runner.calls.find((c) => c.args[0] === 'commit');
    expect(call?.args).toEqual(['commit', '-m', 'claim PRD-0007']);
  });

  it('rm removes the given paths after a `--` guard', async () => {
    const runner = new FakeGitRunner();
    await new GitOps(runner, CWD).rm(['memory/a/old.md', 'memory/a/older.md']);
    expect(runner.ran(argStartsWith('rm', '--', 'memory/a/old.md', 'memory/a/older.md'))).toBe(true);
  });

  it('resetHardToUpstream runs reset --hard @{u}', async () => {
    const runner = new FakeGitRunner();
    await new GitOps(runner, CWD).resetHardToUpstream();
    expect(runner.ran(argStartsWith('reset', '--hard', '@{u}'))).toBe(true);
  });

  it('worktreeAdd builds the right argv', async () => {
    const runner = new FakeGitRunner();
    await new GitOps(runner, CWD).worktreeAdd('../.wt/x', 'feat/x', 'main');
    expect(runner.ran(argStartsWith('worktree', 'add', '-b', 'feat/x', '../.wt/x', 'main'))).toBe(
      true,
    );
  });
});

describe('GitOps reads + errors', () => {
  it('currentBranch returns the trimmed rev-parse output', async () => {
    const runner = new FakeGitRunner().on(argStartsWith('rev-parse', '--abbrev-ref', 'HEAD'), {
      stdout: 'master\n',
    });
    expect(await new GitOps(runner, CWD).currentBranch()).toBe('master');
  });

  it('listFiles splits ls-files output into trimmed names', async () => {
    const runner = new FakeGitRunner().on(argHas('ls-files'), {
      stdout: 'prds/inbox/a.md\nprds/inbox/b.md\n\n',
    });
    const files = await new GitOps(runner, CWD).listFiles('prds/inbox');
    expect(files).toEqual(['prds/inbox/a.md', 'prds/inbox/b.md']);
  });

  it('throws a labelled error when a non-push command fails', async () => {
    const runner = new FakeGitRunner().on(argStartsWith('pull'), {
      code: 1,
      stderr: 'merge conflict',
    });
    await expect(new GitOps(runner, CWD).pullRebase()).rejects.toThrow(/pull --rebase failed/);
  });
});
