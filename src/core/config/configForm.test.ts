import { describe, it, expect } from 'vitest';
import {
  configToDraft,
  emptyDraft,
  serializeConfig,
  validateDraft,
} from './configForm';
import { DEFAULT_CONFIG, parseConfig } from './config';

describe('configToDraft', () => {
  it('mirrors the default config into form-friendly strings', () => {
    const draft = configToDraft(DEFAULT_CONFIG);
    expect(draft.maxWorkers).toBe('4');
    expect(draft.defaultEngine).toBe('claude');
    expect(draft.pullIntervalSeconds).toBe('5');
    expect(draft.heartbeatIntervalSeconds).toBe('10');
    expect(draft.requireValidator).toBe(true);
    expect(draft.requireCi).toBe(true);
    expect(draft.consolidateEveryCards).toBe('');
    expect(draft.sopsRecipients).toBe('');
    expect(draft.projectRepos).toBe('');
  });

  it('flattens project_repos into newline-separated name=path lines', () => {
    const draft = configToDraft({
      ...DEFAULT_CONFIG,
      projectRepos: [
        { name: 'api', path: '../api' },
        { name: 'web', path: '../web' },
      ],
    });
    expect(draft.projectRepos).toBe('api=../api\nweb=../web');
  });

  it('flattens sops recipients into newline-separated lines', () => {
    const draft = configToDraft({
      ...DEFAULT_CONFIG,
      secrets: { sopsRecipients: ['age1abc', 'age1def'] },
    });
    expect(draft.sopsRecipients).toBe('age1abc\nage1def');
  });

  it('renders consolidateEveryCards as a string when set', () => {
    const draft = configToDraft({
      ...DEFAULT_CONFIG,
      memory: { consolidateEveryCards: 12, consolidateCron: null },
    });
    expect(draft.consolidateEveryCards).toBe('12');
  });
});

describe('validateDraft', () => {
  it('accepts a clean default draft', () => {
    const result = validateDraft(configToDraft(DEFAULT_CONFIG));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.config).toEqual(DEFAULT_CONFIG);
  });

  it('rejects a non-numeric maxWorkers with an inline error', () => {
    const draft = { ...configToDraft(DEFAULT_CONFIG), maxWorkers: 'twelve' };
    const result = validateDraft(draft);
    expect(result.ok).toBe(false);
    expect(result.errors.maxWorkers).toMatch(/positive integer/i);
    expect(result.config).toBeUndefined();
  });

  it('rejects a zero maxWorkers', () => {
    const draft = { ...configToDraft(DEFAULT_CONFIG), maxWorkers: '0' };
    const result = validateDraft(draft);
    expect(result.errors.maxWorkers).toMatch(/positive integer/i);
  });

  it('rejects a fractional maxWorkers', () => {
    const draft = { ...configToDraft(DEFAULT_CONFIG), maxWorkers: '2.5' };
    const result = validateDraft(draft);
    expect(result.errors.maxWorkers).toMatch(/positive integer/i);
  });

  it('rejects an unknown engine', () => {
    const draft = { ...configToDraft(DEFAULT_CONFIG), defaultEngine: 'cursor' };
    const result = validateDraft(draft);
    expect(result.errors.defaultEngine).toMatch(/claude/i);
  });

  it('rejects a zero pull interval', () => {
    const draft = { ...configToDraft(DEFAULT_CONFIG), pullIntervalSeconds: '0' };
    const result = validateDraft(draft);
    expect(result.errors.pullIntervalSeconds).toMatch(/greater than 0/i);
  });

  it('rejects a negative heartbeat interval', () => {
    const draft = { ...configToDraft(DEFAULT_CONFIG), heartbeatIntervalSeconds: '-1' };
    const result = validateDraft(draft);
    expect(result.errors.heartbeatIntervalSeconds).toMatch(/greater than 0/i);
  });

  it('rejects a blank pull interval', () => {
    const draft = { ...configToDraft(DEFAULT_CONFIG), pullIntervalSeconds: '   ' };
    const result = validateDraft(draft);
    expect(result.errors.pullIntervalSeconds).toMatch(/greater than 0/i);
  });

  it('rejects a project_repos line whose path side is empty', () => {
    const draft = { ...configToDraft(DEFAULT_CONFIG), projectRepos: 'api=' };
    const result = validateDraft(draft);
    expect(result.errors.projectRepos).toMatch(/name=path/i);
  });

  it('numbers project_repos errors by line', () => {
    const draft = {
      ...configToDraft(DEFAULT_CONFIG),
      projectRepos: 'api=../api\nweb=../web\nbroken',
    };
    const result = validateDraft(draft);
    expect(result.errors.projectRepos).toMatch(/line 3/i);
  });

  it('rejects a non-integer consolidateEveryCards', () => {
    const draft = { ...configToDraft(DEFAULT_CONFIG), consolidateEveryCards: 'lots' };
    const result = validateDraft(draft);
    expect(result.errors.consolidateEveryCards).toMatch(/integer/i);
  });

  it('treats an empty consolidateEveryCards as "no cadence"', () => {
    const draft = { ...configToDraft(DEFAULT_CONFIG), consolidateEveryCards: '   ' };
    const result = validateDraft(draft);
    expect(result.ok).toBe(true);
    expect(result.config?.memory.consolidateEveryCards).toBeNull();
  });

  it('parses project_repos line by line', () => {
    const draft = {
      ...configToDraft(DEFAULT_CONFIG),
      projectRepos: 'api=../api\nweb=../web',
    };
    const result = validateDraft(draft);
    expect(result.ok).toBe(true);
    expect(result.config?.projectRepos).toEqual([
      { name: 'api', path: '../api' },
      { name: 'web', path: '../web' },
    ]);
  });

  it('rejects a project_repos line that lacks an = separator', () => {
    const draft = {
      ...configToDraft(DEFAULT_CONFIG),
      projectRepos: 'api ../api',
    };
    const result = validateDraft(draft);
    expect(result.errors.projectRepos).toMatch(/name=path/i);
  });

  it('parses sops recipients line by line, ignoring blanks', () => {
    const draft = {
      ...configToDraft(DEFAULT_CONFIG),
      sopsRecipients: 'age1abc\n\nage1def\n',
    };
    const result = validateDraft(draft);
    expect(result.ok).toBe(true);
    expect(result.config?.secrets.sopsRecipients).toEqual(['age1abc', 'age1def']);
  });

  it('collects every field error in a single pass', () => {
    const draft = {
      ...configToDraft(DEFAULT_CONFIG),
      maxWorkers: '0',
      defaultEngine: 'cursor',
      pullIntervalSeconds: '-3',
    };
    const result = validateDraft(draft);
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(
      ['defaultEngine', 'maxWorkers', 'pullIntervalSeconds'].sort(),
    );
  });
});

describe('serializeConfig', () => {
  it('round-trips through parseConfig', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      projectRepos: [{ name: 'api', path: '../api' }],
      agents: { maxWorkers: 2, defaultEngine: 'codex' as const },
      sync: { pullIntervalSeconds: 3, heartbeatIntervalSeconds: 8 },
      verification: { requireValidator: false, requireCi: true },
      memory: { consolidateEveryCards: 10, consolidateCron: null },
      secrets: { sopsRecipients: ['age1abc'] },
    };
    const yaml = serializeConfig(cfg);
    expect(parseConfig(yaml)).toEqual(cfg);
  });

  it('uses snake_case keys, mirroring config.yml on disk', () => {
    const yaml = serializeConfig(DEFAULT_CONFIG);
    expect(yaml).toMatch(/project_repos:/);
    expect(yaml).toMatch(/max_workers:/);
    expect(yaml).toMatch(/default_engine:/);
    expect(yaml).toMatch(/pull_interval_seconds:/);
    expect(yaml).toMatch(/require_validator:/);
    expect(yaml).toMatch(/sops_recipients:/);
    expect(yaml).not.toMatch(/maxWorkers/);
  });
});

describe('emptyDraft', () => {
  it('produces a draft that validates to DEFAULT_CONFIG', () => {
    const result = validateDraft(emptyDraft());
    expect(result.ok).toBe(true);
    expect(result.config).toEqual(DEFAULT_CONFIG);
  });
});
