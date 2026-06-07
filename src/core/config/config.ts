import YAML from 'yaml';
import { normalizeProjectKey } from './projectKey';

/**
 * `config.yml` — the control repo's single configuration file.
 *
 * Spec: 14-data-model.md §8. User-authored, so {@link parseConfig} validates at the
 * boundary and fills sensible kernel defaults for anything omitted. The result is a
 * fully-normalized, immutable {@link Config}.
 */

export const ENGINES = ['claude', 'codex', 'gemini'] as const;
export type Engine = (typeof ENGINES)[number];

export interface ProjectRepo {
  readonly name: string;
  readonly path: string;
  /** short key for this project's PRD ids (e.g. `AUTO` → `AUTO-0145`); derived if omitted. */
  readonly key: string;
}

export interface AgentConfig {
  readonly maxWorkers: number;
  readonly defaultEngine: Engine;
}

export interface SyncConfig {
  readonly pullIntervalSeconds: number;
  readonly heartbeatIntervalSeconds: number;
}

export interface VerificationConfig {
  readonly requireValidator: boolean;
  readonly requireCi: boolean;
}

export interface MemoryConfig {
  readonly consolidateEveryCards: number | null;
  readonly consolidateCron: string | null;
}

export interface SecretsConfig {
  readonly sopsRecipients: readonly string[];
}

export interface Config {
  readonly projectRepos: readonly ProjectRepo[];
  readonly agents: AgentConfig;
  readonly sync: SyncConfig;
  readonly verification: VerificationConfig;
  readonly memory: MemoryConfig;
  readonly secrets: SecretsConfig;
}

export const DEFAULT_CONFIG: Config = {
  projectRepos: [],
  agents: { maxWorkers: 4, defaultEngine: 'claude' },
  sync: { pullIntervalSeconds: 5, heartbeatIntervalSeconds: 10 },
  verification: { requireValidator: true, requireCi: true },
  memory: { consolidateEveryCards: null, consolidateCron: null },
  secrets: { sopsRecipients: [] },
};

export function parseConfig(raw: string): Config {
  const parsed: unknown = YAML.parse(raw) ?? {};
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('config.yml must be a YAML mapping');
  }
  const root = parsed as Record<string, unknown>;

  return {
    projectRepos: parseRepos(root.project_repos),
    agents: parseAgents(asRecord(root.agents)),
    sync: parseSync(asRecord(root.sync)),
    verification: parseVerification(asRecord(root.verification)),
    memory: parseMemory(asRecord(root.memory)),
    secrets: { sopsRecipients: parseStringArray(asRecord(root.secrets).sops_recipients) },
  };
}

export function isEngine(value: unknown): value is Engine {
  return typeof value === 'string' && (ENGINES as readonly string[]).includes(value);
}

function parseRepos(value: unknown): readonly ProjectRepo[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('config.yml: project_repos must be a list');
  }
  return value.map((entry, index): ProjectRepo => {
    const repo = asRecord(entry);
    const name = repo.name;
    const path = repo.path;
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(`config.yml: project_repos[${index}].name is required`);
    }
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error(`config.yml: project_repos[${index}].path is required`);
    }
    return { name, path, key: normalizeProjectKey(repo.key, name) };
  });
}

function parseAgents(agents: Record<string, unknown>): AgentConfig {
  const maxWorkers = numberOr(agents.max_workers, DEFAULT_CONFIG.agents.maxWorkers);
  if (!Number.isInteger(maxWorkers) || maxWorkers < 1) {
    throw new Error('config.yml: agents.max_workers must be a positive integer');
  }
  const engine = agents.default_engine ?? DEFAULT_CONFIG.agents.defaultEngine;
  if (!isEngine(engine)) {
    throw new Error(`config.yml: agents.default_engine must be one of ${ENGINES.join(', ')}`);
  }
  return { maxWorkers, defaultEngine: engine };
}

function parseSync(sync: Record<string, unknown>): SyncConfig {
  return {
    pullIntervalSeconds: positive(
      numberOr(sync.pull_interval_seconds, DEFAULT_CONFIG.sync.pullIntervalSeconds),
      'sync.pull_interval_seconds',
    ),
    heartbeatIntervalSeconds: positive(
      numberOr(sync.heartbeat_interval_seconds, DEFAULT_CONFIG.sync.heartbeatIntervalSeconds),
      'sync.heartbeat_interval_seconds',
    ),
  };
}

function parseVerification(v: Record<string, unknown>): VerificationConfig {
  return {
    requireValidator: boolOr(v.require_validator, DEFAULT_CONFIG.verification.requireValidator),
    requireCi: boolOr(v.require_ci, DEFAULT_CONFIG.verification.requireCi),
  };
}

function parseMemory(m: Record<string, unknown>): MemoryConfig {
  const everyCards = m.consolidate_every_cards;
  return {
    consolidateEveryCards: typeof everyCards === 'number' ? everyCards : null,
    consolidateCron: typeof m.consolidate_cron === 'string' ? m.consolidate_cron : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function positive(value: number, label: string): number {
  if (value <= 0) {
    throw new Error(`config.yml: ${label} must be greater than 0`);
  }
  return value;
}

function parseStringArray(value: unknown): readonly string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('config.yml: expected a list of strings');
  }
  return value.map((item) => String(item));
}
