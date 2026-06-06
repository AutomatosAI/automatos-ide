import { describe, it, expect } from 'vitest';
import {
  AUTO_HANDLE,
  sanitizeHandle,
  isValidHandle,
  humanIdentity,
  autoIdentity,
  workerIdentity,
} from './identity';

describe('sanitizeHandle', () => {
  it('lowercases and keeps an already-safe login intact', () => {
    expect(sanitizeHandle('Octocat')).toBe('octocat');
  });

  it('folds runs of symbols and spaces into single hyphens', () => {
    expect(sanitizeHandle('Ada  Lovelace!!')).toBe('ada-lovelace');
  });

  it('strips leading, trailing, and doubled hyphens', () => {
    expect(sanitizeHandle('--weird__name--')).toBe('weird-name');
  });

  it('throws when nothing usable remains', () => {
    expect(() => sanitizeHandle('   ')).toThrow(/no usable characters/);
    expect(() => sanitizeHandle('!!!')).toThrow(/no usable characters/);
  });

  it('produces a valid handle from anything it accepts', () => {
    for (const raw of ['Octocat', 'Ada Lovelace', 'a.b.c', 'X---Y']) {
      expect(isValidHandle(sanitizeHandle(raw))).toBe(true);
    }
  });
});

describe('isValidHandle', () => {
  it('accepts lowercase alphanumerics with internal hyphens', () => {
    expect(isValidHandle('octocat')).toBe(true);
    expect(isValidHandle('ada-lovelace-claude-7')).toBe(true);
  });

  it('rejects uppercase, leading/trailing hyphens, and empties', () => {
    expect(isValidHandle('Octocat')).toBe(false);
    expect(isValidHandle('-nope')).toBe(false);
    expect(isValidHandle('nope-')).toBe(false);
    expect(isValidHandle('')).toBe(false);
  });
});

describe('humanIdentity', () => {
  it('derives a human handle from the login, preserving the raw login', () => {
    expect(humanIdentity('Octocat')).toEqual({
      login: 'Octocat',
      kind: 'human',
      handle: 'octocat',
    });
  });
});

describe('autoIdentity', () => {
  it('uses the fixed AUTO handle while recording its operator', () => {
    expect(autoIdentity('Octocat')).toEqual({
      login: 'Octocat',
      kind: 'auto',
      handle: AUTO_HANDLE,
    });
  });
});

describe('workerIdentity', () => {
  it('builds a unique, attributable handle from login, engine, and nonce', () => {
    expect(workerIdentity('Octocat', 'claude', 'a1')).toEqual({
      login: 'Octocat',
      kind: 'worker',
      handle: 'octocat-claude-a1',
    });
  });

  it('keeps concurrent workers distinct via the nonce', () => {
    const a = workerIdentity('octocat', 'claude', '1');
    const b = workerIdentity('octocat', 'claude', '2');
    expect(a.handle).not.toBe(b.handle);
    expect(isValidHandle(a.handle)).toBe(true);
    expect(isValidHandle(b.handle)).toBe(true);
  });
});
