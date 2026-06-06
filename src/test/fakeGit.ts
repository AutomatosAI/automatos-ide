import { GitRunner, GitResult } from '../git/runner';

/**
 * A scriptable fake {@link GitRunner} for unit tests — records every call and
 * returns canned results matched by argv, so coordination logic is tested with no
 * real git. Lives under src/test so it is excluded from coverage.
 */

interface ScriptedResponse {
  readonly match: (args: readonly string[]) => boolean;
  readonly results: readonly GitResult[];
  next: number;
}

function fill(result: Partial<GitResult>): GitResult {
  return { code: 0, stdout: '', stderr: '', ...result };
}

export class FakeGitRunner implements GitRunner {
  readonly calls: { args: readonly string[]; cwd: string }[] = [];
  private readonly responses: ScriptedResponse[] = [];
  private fallback: GitResult = { code: 0, stdout: '', stderr: '' };

  /**
   * Script a response for argv matching `match`. Pass an array to return different
   * results on successive matches (the last element sticks) — e.g. `[reject, ok]` to
   * model losing a push race once and then winning.
   */
  on(
    match: (args: readonly string[]) => boolean,
    result: Partial<GitResult> | readonly Partial<GitResult>[],
  ): this {
    const results = (Array.isArray(result) ? result : [result]).map(fill);
    this.responses.push({ match, results, next: 0 });
    return this;
  }

  setDefault(result: Partial<GitResult>): this {
    this.fallback = fill(result);
    return this;
  }

  async run(args: readonly string[], cwd: string): Promise<GitResult> {
    this.calls.push({ args, cwd });
    const matched = this.responses.find((r) => r.match(args));
    if (!matched) {
      return this.fallback;
    }
    const result = matched.results[Math.min(matched.next, matched.results.length - 1)];
    matched.next += 1;
    return result;
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
