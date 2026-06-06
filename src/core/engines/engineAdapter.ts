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
  /** Skip the interactive permission gate for unattended runs. Default true. */
  readonly skipPermissions?: boolean;
}

interface EngineDef {
  readonly bin: string;
  readonly buildArgs: (prompt: string, skipPermissions: boolean) => string[];
}

const ENGINE_DEFS: Readonly<Record<string, EngineDef>> = {
  claude: {
    bin: 'claude',
    buildArgs: (prompt, skip) => ['-p', prompt, ...(skip ? ['--dangerously-skip-permissions'] : [])],
  },
  codex: {
    bin: 'codex',
    // codex takes flags before the positional prompt; exec is the non-interactive path.
    buildArgs: (prompt, skip) => [
      'exec',
      ...(skip ? ['--dangerously-bypass-approvals-and-sandbox'] : []),
      prompt,
    ],
  },
  gemini: {
    bin: 'gemini',
    buildArgs: (prompt, skip) => ['-p', prompt, ...(skip ? ['--yolo'] : [])],
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
  const skip = opts.skipPermissions ?? true;
  return { command: def.bin, args: def.buildArgs(prompt, skip) };
}

function engineDef(engine: string): EngineDef {
  const def = ENGINE_DEFS[engine];
  if (!def) {
    throw new Error(`unknown engine "${engine}" (known: ${knownEngines().join(', ')})`);
  }
  return def;
}
