import { describe, it, expect } from 'vitest';
import { EngineProbe, preflightEngine, preflightEngines } from './preflight';

/** A probe scripted from two name→bool maps; absent ⇒ false. */
function probe(onPath: Record<string, boolean>, loggedIn: Record<string, boolean>): EngineProbe {
  return {
    async onPath(bin) {
      return onPath[bin] ?? false;
    },
    async loggedIn(engine) {
      return loggedIn[engine] ?? false;
    },
  };
}

describe('preflightEngine', () => {
  it('passes when the CLI is on PATH and logged in', async () => {
    const r = await preflightEngine('claude', probe({ claude: true }, { claude: true }));
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/ready/);
  });

  it('fails with an install hint when the CLI is missing', async () => {
    const r = await preflightEngine('codex', probe({}, { codex: true }));
    expect(r).toMatchObject({ cliFound: false, loggedIn: false, ok: false });
    expect(r.detail).toMatch(/not found on PATH/);
  });

  it('fails with a login hint when installed but logged out', async () => {
    const r = await preflightEngine('gemini', probe({ gemini: true }, { gemini: false }));
    expect(r).toMatchObject({ cliFound: true, loggedIn: false, ok: false });
    expect(r.detail).toMatch(/not logged in/);
  });

  it('does not probe login for a missing binary', async () => {
    let loginProbed = false;
    const spyProbe: EngineProbe = {
      async onPath() {
        return false;
      },
      async loggedIn() {
        loginProbed = true;
        return true;
      },
    };
    await preflightEngine('claude', spyProbe);
    expect(loginProbed).toBe(false);
  });
});

describe('preflightEngines', () => {
  it('reports only the engines that pass as usable', async () => {
    const report = await preflightEngines(
      ['claude', 'codex', 'gemini'],
      probe({ claude: true, codex: true }, { claude: true }), // codex logged out, gemini missing
    );
    expect(report.usable).toEqual(['claude']);
    expect(report.ok).toBe(true);
    expect(report.results).toHaveLength(3);
  });

  it('is not ok when no engine is usable', async () => {
    const report = await preflightEngines(['claude'], probe({}, {}));
    expect(report.ok).toBe(false);
    expect(report.usable).toEqual([]);
  });
});
