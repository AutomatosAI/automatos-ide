import { execFile } from 'node:child_process';

/**
 * The narrow seam between our git logic and the real `git` binary.
 *
 * Everything that touches git goes through {@link GitRunner}, so the coordination
 * logic (claim CAS, board moves, worktrees) is unit-testable against a fake runner
 * with zero real repos. {@link execGitRunner} is the production implementation.
 */

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitRunner {
  run(args: readonly string[], cwd: string): Promise<GitResult>;
}

export const execGitRunner: GitRunner = {
  run(args, cwd) {
    return new Promise<GitResult>((resolve) => {
      execFile(
        'git',
        args as string[],
        { cwd, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const code =
            error && typeof (error as { code?: unknown }).code === 'number'
              ? (error as { code: number }).code
              : error
                ? 1
                : 0;
          resolve({ code, stdout: stdout.toString(), stderr: stderr.toString() });
        },
      );
    });
  },
};
