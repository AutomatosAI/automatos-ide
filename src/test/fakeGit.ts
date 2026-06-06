import { GitRunner, GitResult } from '../git/runner';

/**
 * A scriptable fake {@link GitRunner} for unit tests — records every call and
 * returns canned results matched by argv, so coordination logic is tested with no
 * real git. Lives under src/test so it is excluded from coverage.
 */

interface ScriptedResponse {
  readonly match: (args: readonly string[]) => boolean;
  readonly result: GitResult;
}

export class FakeGitRunner implements GitRunner {
  readonly calls: { args: readonly string[]; cwd: string }[] = [];
  private readonly responses: ScriptedResponse[] = [];
  private fallback: GitResult = { code: 0, stdout: '', stderr: '' };

  on(match: (args: readonly string[]) => boolean, result: Partial<GitResult>): this {
    this.responses.push({ match, result: { code: 0, stdout: '', stderr: '', ...result } });
    return this;
  }

  setDefault(result: Partial<GitResult>): this {
    this.fallback = { code: 0, stdout: '', stderr: '', ...result };
    return this;
  }

  async run(args: readonly string[], cwd: string): Promise<GitResult> {
    this.calls.push({ args, cwd });
    const matched = this.responses.find((r) => r.match(args));
    return matched ? matched.result : this.fallback;
  }

  ran(predicate: (args: readonly string[]) => boolean): boolean {
    return this.calls.some((call) => predicate(call.args));
  }

  countWhere(predicate: (args: readonly string[]) => boolean): number {
    return this.calls.filter((call) => predicate(call.args)).length;
  }
}

export const argStartsWith =
  (...expected: string[]) =>
  (args: readonly string[]): boolean =>
    expected.every((value, index) => args[index] === value);

export const argHas =
  (needle: string) =>
  (args: readonly string[]): boolean =>
    args.includes(needle);
