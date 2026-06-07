import { GitRunner, GitResult } from './runner';

/**
 * Typed git operations the coordination layer needs, over a {@link GitRunner}.
 *
 * The one subtlety is {@link push}: a non-fast-forward rejection is NOT an error to
 * throw — it is the losing side of the claim CAS (33 §2), so it returns a structured
 * {@link PushResult} the loser contract can act on. A repo with no remote configured is
 * likewise not an error: the commit is already local, so push reports `localOnly` and the
 * board write stands, just unshared until a remote is added. Everything else throws.
 */

export interface PushResult {
  readonly ok: boolean;
  /** true when the push lost a race (someone else pushed first) — the CAS signal. */
  readonly rejected: boolean;
  /** true when the commit landed locally but the repo has no remote to broadcast to. */
  readonly localOnly: boolean;
  readonly stderr: string;
}

const REJECTION_MARKERS = ['rejected', 'non-fast-forward', 'fetch first', 'failed to push'];
const NO_REMOTE_MARKERS = ['no configured push destination'];

export class GitOps {
  constructor(
    private readonly runner: GitRunner,
    private readonly cwd: string,
  ) {}

  async pullRebase(): Promise<void> {
    await this.expect(['pull', '--rebase'], 'pull --rebase');
  }

  async mv(from: string, to: string): Promise<void> {
    await this.expect(['mv', from, to], `mv ${from} ${to}`);
  }

  async add(paths: readonly string[]): Promise<void> {
    await this.expect(['add', '--', ...paths], 'add');
  }

  async commit(message: string): Promise<void> {
    await this.expect(['commit', '-m', message], 'commit');
  }

  async rm(paths: readonly string[]): Promise<void> {
    await this.expect(['rm', '--', ...paths], 'rm');
  }

  async push(): Promise<PushResult> {
    const result = await this.runner.run(['push'], this.cwd);
    if (result.code === 0) {
      return { ok: true, rejected: false, localOnly: false, stderr: result.stderr };
    }
    if (isNoRemote(result)) {
      // A control repo with no remote (fresh `git init`, solo/offline use) has nowhere to
      // broadcast — but the commit already landed locally, so this is a local-only success,
      // not a failure. Board writes proceed; they're simply unshared until a remote exists.
      return { ok: true, rejected: false, localOnly: true, stderr: result.stderr };
    }
    return { ok: false, rejected: isRejection(result), localOnly: false, stderr: result.stderr };
  }

  /** The loser contract's first move: discard the lost commit, match upstream (33 §3). */
  async resetHardToUpstream(): Promise<void> {
    await this.expect(['reset', '--hard', '@{u}'], 'reset --hard @{u}');
  }

  /** Names (not paths) of files directly under `dir`, via `ls-files`. */
  async listFiles(dir: string): Promise<readonly string[]> {
    const result = await this.expect(['ls-files', '--', dir], 'ls-files');
    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  async worktreeAdd(path: string, branch: string, base: string): Promise<void> {
    await this.expect(['worktree', 'add', '-b', branch, path, base], 'worktree add');
  }

  /**
   * The checked-out branch name — the base a worker should fork from and PR back into.
   * A detached HEAD reports as `HEAD`; callers treat that as "no usable base" and fall
   * back to a default, since you can't open a PR against a detached commit.
   */
  async currentBranch(): Promise<string> {
    const result = await this.expect(['rev-parse', '--abbrev-ref', 'HEAD'], 'rev-parse HEAD');
    return result.stdout.trim();
  }

  async worktreePrune(): Promise<void> {
    await this.expect(['worktree', 'prune'], 'worktree prune');
  }

  private async expect(args: readonly string[], label: string): Promise<GitResult> {
    const result = await this.runner.run(args, this.cwd);
    if (result.code !== 0) {
      throw new Error(`git ${label} failed (code ${result.code}): ${result.stderr.trim()}`);
    }
    return result;
  }
}

function isRejection(result: GitResult): boolean {
  const haystack = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return REJECTION_MARKERS.some((marker) => haystack.includes(marker));
}

function isNoRemote(result: GitResult): boolean {
  const haystack = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return NO_REMOTE_MARKERS.some((marker) => haystack.includes(marker));
}
