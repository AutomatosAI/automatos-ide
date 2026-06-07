import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROJECT_KEY,
  deriveProjectKey,
  isProjectKey,
  normalizeProjectKey,
} from './projectKey';

describe('DEFAULT_PROJECT_KEY', () => {
  it('is PRD — the key for the control repo / unmapped project', () => {
    expect(DEFAULT_PROJECT_KEY).toBe('PRD');
  });
});

describe('deriveProjectKey', () => {
  it('uppercases and strips non-alphanumerics', () => {
    expect(deriveProjectKey('dr-green')).toBe('DRGREEN');
    expect(deriveProjectKey('web-app')).toBe('WEBAPP');
    expect(deriveProjectKey('api')).toBe('API');
  });

  it('keeps a long name verbatim — the user can shorten it with an explicit key', () => {
    expect(deriveProjectKey('automatos-ai')).toBe('AUTOMATOSAI');
  });

  it('falls back to PRD when the name yields no letter-leading key', () => {
    expect(deriveProjectKey('')).toBe('PRD');
    expect(deriveProjectKey('---')).toBe('PRD');
    expect(deriveProjectKey('3d-engine')).toBe('PRD');
  });
});

describe('isProjectKey', () => {
  it('accepts a letter-led alphanumeric token in either case', () => {
    expect(isProjectKey('AUTO')).toBe(true);
    expect(isProjectKey('auto')).toBe(true);
    expect(isProjectKey('A1')).toBe(true);
  });

  it('rejects anything with separators or a leading digit (so paths are not mistaken for keys)', () => {
    expect(isProjectKey('../web')).toBe(false);
    expect(isProjectKey('b/c')).toBe(false);
    expect(isProjectKey('2fa')).toBe(false);
    expect(isProjectKey('')).toBe(false);
  });
});

describe('normalizeProjectKey', () => {
  it('honours an explicit key, uppercased and cleaned', () => {
    expect(normalizeProjectKey('AUTO', 'automatos-ai')).toBe('AUTO');
    expect(normalizeProjectKey('clinic', 'ClinicFlowPlatform')).toBe('CLINIC');
    expect(normalizeProjectKey('a-b', 'whatever')).toBe('AB');
  });

  it('derives from the name when the key is blank, missing, or unusable', () => {
    expect(normalizeProjectKey(undefined, 'dr-green')).toBe('DRGREEN');
    expect(normalizeProjectKey('', 'dr-green')).toBe('DRGREEN');
    expect(normalizeProjectKey('   ', 'web-app')).toBe('WEBAPP');
    expect(normalizeProjectKey('123', 'web-app')).toBe('WEBAPP');
  });
});
