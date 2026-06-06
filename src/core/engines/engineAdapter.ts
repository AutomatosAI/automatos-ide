/**
 * How to launch each agent CLI headless (12 §3.3, Canopy model).
 *
 * We do not build agents — we spawn the EXISTING `claude` / `codex` / `gemini` CLIs in
 * a worktree, hand them a PRD as the prompt, and let them run one-shot to a PR. The
 * three differ in how they take a prompt and how they skip the interactive permission
 * gate, so the per-engine knowledge lives in one table here; everything else stays
 * engine-agnostic. Flags verified against each CLI's headless docs (2026-06).
 */

export interface LaunchCommand {
  readonly command: string;
  readonly args: readonly string[];
}

export interface LaunchOptions {
  /**
   * Skip the interactive permission gate (the `--dangerously-*` / `--yolo` flags).
   * Defaults to FALSE: bypassing every guard is dangerous, so it must be an explicit,
   * visible opt-in by the unattended supervisor — which only ever launches workers
   * inside a throwaway per-card worktree, never the user's main checkout.
   */
  readonly skipPermissions?: boolean;
}

interface EngineDef {
  readonly bin: string;
  readonly buildArgs: (prompt: string, skipPermissions: boolean) => string[];
  /**
   * Argv to open the engine INTERACTIVELY, seeded with the prompt — the manual-launch
   * path. Unlike the headless `buildArgs` (one-shot, for the unattended supervisor), this
   * drops the human into a live session they can watch and steer, so there is no
   * skip-permissions flag: the engine asks the watching human in-session instead.
   */
  readonly interactiveArgs: (prompt: string) => string[];
}

const ENGINE_DEFS: Readonly<Record<string, EngineDef>> = {
  claude: {
    bin: 'claude',
    buildArgs: (prompt, skip) => ['-p', prompt, ...(skip ? ['--dangerously-skip-permissions'] : [])],
    interactiveArgs: (prompt) => [prompt],
  },
  codex: {
    bin: 'codex',
    // codex takes flags before the positional prompt; exec is the non-interactive path.
    // The `--` terminates flag parsing so a PRD whose text starts with `-` can never be
    // smuggled in as an argument (flag injection).
    buildArgs: (prompt, skip) => [
      'exec',
      ...(skip ? ['--dangerously-bypass-approvals-and-sandbox'] : []),
      '--',
      prompt,
    ],
    interactiveArgs: (prompt) => ['--', prompt],
  },
  gemini: {
    bin: 'gemini',
    buildArgs: (prompt, skip) => ['-p', prompt, ...(skip ? ['--yolo'] : [])],
    interactiveArgs: (prompt) => ['-i', prompt],
  },
};

export function knownEngines(): readonly string[] {
  return Object.keys(ENGINE_DEFS);
}

export function engineBinary(engine: string): string {
  return engineDef(engine).bin;
}

/** Build the argv to launch an engine on `prompt`. Unattended (skip-permissions) by default. */
export function buildLaunchCommand(
  engine: string,
  prompt: string,
  opts: LaunchOptions = {},
): LaunchCommand {
  const def = engineDef(engine);
  const skip = opts.skipPermissions ?? false;
  return { command: def.bin, args: def.buildArgs(prompt, skip) };
}

/** Build the argv to open an engine interactively, seeded with `prompt` (manual launch). */
export function buildInteractiveLaunchCommand(engine: string, prompt: string): LaunchCommand {
  const def = engineDef(engine);
  return { command: def.bin, args: def.interactiveArgs(prompt) };
}

function engineDef(engine: string): EngineDef {
  const def = ENGINE_DEFS[engine];
  if (!def) {
    throw new Error(`unknown engine "${engine}" (known: ${knownEngines().join(', ')})`);
  }
  return def;
}
