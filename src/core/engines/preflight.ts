import { engineBinary } from './engineAdapter';

/**
 * Worker preflight: refuse to launch an engine we can't actually run (12 §3.3).
 *
 * The Canopy model assumes the CLIs already exist and are logged in (subscription
 * login is ambient in `~/.<engine>`). Before spawning anything we check two things per
 * engine — is the binary on PATH, and does it have cached credentials — so a missing
 * or logged-out CLI fails loudly at the gate instead of every worker dying on launch.
 *
 * The probing itself (PATH lookup, credential files) is I/O at the system boundary and
 * is INJECTED as an {@link EngineProbe}; the decision logic here stays pure and tested.
 */

export interface EngineProbe {
  /** Is the engine's binary resolvable and runnable on PATH? */
  onPath(bin: string): Promise<boolean>;
  /** Does the engine have cached subscription/login credentials? */
  loggedIn(engine: string): Promise<boolean>;
}

export interface EnginePreflight {
  readonly engine: string;
  readonly cliFound: boolean;
  readonly loggedIn: boolean;
  readonly ok: boolean;
  /** Human-readable reason, ready to surface in the UI. */
  readonly detail: string;
}

export interface PreflightReport {
  readonly results: readonly EnginePreflight[];
  /** Engines that passed — the only ones a worker may be launched with. */
  readonly usable: readonly string[];
  /** True when at least one engine is usable. */
  readonly ok: boolean;
}

export async function preflightEngine(
  engine: string,
  probe: EngineProbe,
): Promise<EnginePreflight> {
  const bin = engineBinary(engine);
  const cliFound = await probe.onPath(bin);
  if (!cliFound) {
    return {
      engine,
      cliFound: false,
      loggedIn: false,
      ok: false,
      detail: `${bin} not found on PATH — install the ${engine} CLI`,
    };
  }
  const loggedIn = await probe.loggedIn(engine);
  if (!loggedIn) {
    return {
      engine,
      cliFound: true,
      loggedIn: false,
      ok: false,
      detail: `${bin} is installed but not logged in — run \`${bin}\` once to sign in`,
    };
  }
  return { engine, cliFound: true, loggedIn: true, ok: true, detail: `${bin} ready` };
}

/** Preflight a set of engines and report which are usable. */
export async function preflightEngines(
  engines: readonly string[],
  probe: EngineProbe,
): Promise<PreflightReport> {
  const results = await Promise.all(engines.map((engine) => preflightEngine(engine, probe)));
  const usable = results.filter((r) => r.ok).map((r) => r.engine);
  return { results, usable, ok: usable.length > 0 };
}
