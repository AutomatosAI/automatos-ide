import { describe, it, expect } from 'vitest';
import { parseConfig, DEFAULT_CONFIG } from './config';

describe('parseConfig defaults', () => {
  it('returns kernel defaults for an empty document', () => {
    const cfg = parseConfig('');
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });

  it('keeps defaults for sections the user omits', () => {
    const cfg = parseConfig('project_repos:\n  - name: ingest\n    path: ../ingest\n');
    expect(cfg.agents.maxWorkers).toBe(4);
    expect(cfg.agents.defaultEngine).toBe('claude');
    expect(cfg.verification.requireValidator).toBe(true);
  });
});

describe('parseConfig project_repos', () => {
  it('parses a list of repos', () => {
    const cfg = parseConfig(`project_repos:
  - name: ingest-service
    path: ../ingest-service
  - name: web-app
    path: ../web-app
`);
    expect(cfg.projectRepos).toHaveLength(2);
    expect(cfg.projectRepos[1]).toEqual({ name: 'web-app', path: '../web-app', key: 'WEBAPP' });
  });

  it('honours an explicit key and derives one when it is omitted', () => {
    const cfg = parseConfig(`project_repos:
  - name: automatos-ai
    path: ../automatos-ai
    key: AUTO
  - name: dr-green
    path: ../dr-green
`);
    expect(cfg.projectRepos[0].key).toBe('AUTO');
    expect(cfg.projectRepos[1].key).toBe('DRGREEN');
  });

  it('throws when a repo is missing its path', () => {
    expect(() => parseConfig('project_repos:\n  - name: ingest\n')).toThrow(/path is required/);
  });
});

describe('parseConfig validation', () => {
  it('parses a full document', () => {
    const cfg = parseConfig(`agents:
  max_workers: 2
  default_engine: codex
sync:
  pull_interval_seconds: 3
  heartbeat_interval_seconds: 8
verification:
  require_validator: false
  require_ci: true
memory:
  consolidate_every_cards: 10
secrets:
  sops_recipients:
    - age1abc
    - age1def
`);
    expect(cfg.agents.maxWorkers).toBe(2);
    expect(cfg.agents.defaultEngine).toBe('codex');
    expect(cfg.sync.pullIntervalSeconds).toBe(3);
    expect(cfg.verification.requireValidator).toBe(false);
    expect(cfg.memory.consolidateEveryCards).toBe(10);
    expect(cfg.secrets.sopsRecipients).toEqual(['age1abc', 'age1def']);
  });

  it('rejects an unknown engine', () => {
    expect(() => parseConfig('agents:\n  default_engine: cursor\n')).toThrow(/default_engine/);
  });

  it('rejects a non-positive max_workers', () => {
    expect(() => parseConfig('agents:\n  max_workers: 0\n')).toThrow(/positive integer/);
  });

  it('rejects a zero sync interval', () => {
    expect(() => parseConfig('sync:\n  pull_interval_seconds: 0\n')).toThrow(/greater than 0/);
  });
});

describe('parseConfig automatos', () => {
  it('defaults to the public api base url and a null agent id', () => {
    const cfg = parseConfig('');
    expect(cfg.automatos).toEqual({ baseUrl: 'https://api.automatos.app', agentId: null });
  });

  it('reads base_url and agent_id', () => {
    const cfg = parseConfig(`automatos:
  base_url: https://auto.example.com
  agent_id: agent-123
`);
    expect(cfg.automatos).toEqual({ baseUrl: 'https://auto.example.com', agentId: 'agent-123' });
  });

  it('trims a trailing slash from base_url', () => {
    const cfg = parseConfig('automatos:\n  base_url: https://auto.example.com/\n');
    expect(cfg.automatos.baseUrl).toBe('https://auto.example.com');
  });

  it('falls back to the default base url when base_url is blank', () => {
    const cfg = parseConfig('automatos:\n  base_url: "   "\n');
    expect(cfg.automatos.baseUrl).toBe('https://api.automatos.app');
  });
});
