import YAML from 'yaml';
import {
  Config,
  DEFAULT_CONFIG,
  ENGINES,
  Engine,
  ProjectRepo,
  isEngine,
} from './config';

/**
 * Form-side companion to {@link config.ts} for the M0 settings panel.
 *
 * The webview deals in strings and booleans, so we round-trip {@link Config} through a
 * {@link ConfigFormDraft} (HTML-form-shaped values), validate the draft field-by-field
 * collecting every error in one pass, and serialize the accepted result back to YAML for
 * `config.yml`. Validation lives here — not in the host — so it is pure, fully unit-tested,
 * and the panel can render inline errors next to the offending field without a round-trip.
 */

export interface ConfigFormDraft {
  readonly maxWorkers: string;
  readonly defaultEngine: string;
  readonly pullIntervalSeconds: string;
  readonly heartbeatIntervalSeconds: string;
  readonly requireValidator: boolean;
  readonly requireCi: boolean;
  /** Empty string means "no cadence" (consolidate_every_cards: null). */
  readonly consolidateEveryCards: string;
  /** Newline-separated `name=path` lines. */
  readonly projectRepos: string;
  /** Newline-separated public age keys. */
  readonly sopsRecipients: string;
}

export type ConfigFormErrors = Readonly<Partial<Record<keyof ConfigFormDraft, string>>>;

export type ValidationResult =
  | { readonly ok: true; readonly errors: ConfigFormErrors; readonly config: Config }
  | { readonly ok: false; readonly errors: ConfigFormErrors; readonly config?: undefined };

export function emptyDraft(): ConfigFormDraft {
  return configToDraft(DEFAULT_CONFIG);
}

export function configToDraft(config: Config): ConfigFormDraft {
  return {
    maxWorkers: String(config.agents.maxWorkers),
    defaultEngine: config.agents.defaultEngine,
    pullIntervalSeconds: String(config.sync.pullIntervalSeconds),
    heartbeatIntervalSeconds: String(config.sync.heartbeatIntervalSeconds),
    requireValidator: config.verification.requireValidator,
    requireCi: config.verification.requireCi,
    consolidateEveryCards:
      config.memory.consolidateEveryCards === null
        ? ''
        : String(config.memory.consolidateEveryCards),
    projectRepos: config.projectRepos.map((r) => `${r.name}=${r.path}`).join('\n'),
    sopsRecipients: config.secrets.sopsRecipients.join('\n'),
  };
}

export function validateDraft(draft: ConfigFormDraft): ValidationResult {
  const errors: Record<string, string> = {};

  const maxWorkers = parsePositiveInt(draft.maxWorkers);
  if (maxWorkers === null) {
    errors.maxWorkers = 'must be a positive integer';
  }

  const defaultEngine = draft.defaultEngine.trim();
  if (!isEngine(defaultEngine)) {
    errors.defaultEngine = `must be one of ${ENGINES.join(', ')}`;
  }

  const pullIntervalSeconds = parsePositiveNumber(draft.pullIntervalSeconds);
  if (pullIntervalSeconds === null) {
    errors.pullIntervalSeconds = 'must be a number greater than 0';
  }

  const heartbeatIntervalSeconds = parsePositiveNumber(draft.heartbeatIntervalSeconds);
  if (heartbeatIntervalSeconds === null) {
    errors.heartbeatIntervalSeconds = 'must be a number greater than 0';
  }

  const consolidateEveryCardsRaw = draft.consolidateEveryCards.trim();
  let consolidateEveryCards: number | null = null;
  if (consolidateEveryCardsRaw !== '') {
    const parsed = parsePositiveInt(consolidateEveryCardsRaw);
    if (parsed === null) {
      errors.consolidateEveryCards = 'must be a positive integer or blank';
    } else {
      consolidateEveryCards = parsed;
    }
  }

  const projectReposResult = parseProjectRepos(draft.projectRepos);
  if (projectReposResult.error) {
    errors.projectRepos = projectReposResult.error;
  }

  const sopsRecipients = parseLines(draft.sopsRecipients);

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const config: Config = {
    projectRepos: projectReposResult.repos ?? [],
    agents: {
      maxWorkers: maxWorkers as number,
      defaultEngine: defaultEngine as Engine,
    },
    sync: {
      pullIntervalSeconds: pullIntervalSeconds as number,
      heartbeatIntervalSeconds: heartbeatIntervalSeconds as number,
    },
    verification: {
      requireValidator: draft.requireValidator,
      requireCi: draft.requireCi,
    },
    memory: {
      consolidateEveryCards,
      consolidateCron: DEFAULT_CONFIG.memory.consolidateCron,
    },
    secrets: { sopsRecipients },
  };

  return { ok: true, errors: {}, config };
}

export function serializeConfig(config: Config): string {
  const root = {
    project_repos: config.projectRepos.map((r) => ({ name: r.name, path: r.path })),
    agents: {
      max_workers: config.agents.maxWorkers,
      default_engine: config.agents.defaultEngine,
    },
    sync: {
      pull_interval_seconds: config.sync.pullIntervalSeconds,
      heartbeat_interval_seconds: config.sync.heartbeatIntervalSeconds,
    },
    verification: {
      require_validator: config.verification.requireValidator,
      require_ci: config.verification.requireCi,
    },
    memory: {
      consolidate_every_cards: config.memory.consolidateEveryCards,
    },
    secrets: {
      sops_recipients: [...config.secrets.sopsRecipients],
    },
  };
  return YAML.stringify(root);
}

function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^-?\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function parsePositiveNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseLines(raw: string): readonly string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseProjectRepos(raw: string): {
  readonly repos?: readonly ProjectRepo[];
  readonly error?: string;
} {
  const repos: ProjectRepo[] = [];
  for (const [index, line] of parseLines(raw).entries()) {
    const eq = line.indexOf('=');
    if (eq <= 0 || eq === line.length - 1) {
      return { error: `line ${index + 1}: expected name=path` };
    }
    const name = line.slice(0, eq).trim();
    const path = line.slice(eq + 1).trim();
    repos.push({ name, path });
  }
  return { repos };
}
