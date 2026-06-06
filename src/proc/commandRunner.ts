import { execFile } from 'node:child_process';

/**
 * A narrow seam for running non-git processes (engine version probes, the validator's
 * test command). Same shape as {@link GitRunner} but general: never throws on a non-zero
 * exit — the caller inspects {@link ExecResult.code}. A binary that does not exist
 * resolves with code 127 (the shell's "command not found"), so PATH checks are a code
 * comparison, not a try/catch.
 */

export interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandRunner {
  run(command: string, args: readonly string[], cwd?: string): Promise<ExecResult>;
}

export const execCommandRunner: CommandRunner = {
  run(command, args, cwd) {
    return new Promise<ExecResult>((resolve) => {
      execFile(command, args as string[], { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve({ code: 127, stdout: '', stderr: `command not found: ${command}` });
          return;
        }
        const code =
          error && typeof (error as { code?: unknown }).code === 'number'
            ? (error as { code: number }).code
            : error
              ? 1
              : 0;
        resolve({ code, stdout: stdout.toString(), stderr: stderr.toString() });
      });
    });
  },
};
