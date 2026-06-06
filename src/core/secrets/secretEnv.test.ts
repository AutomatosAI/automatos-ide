import { describe, it, expect } from 'vitest';
import { parseDotenv, toInjectableEnv } from './secretEnv';

describe('parseDotenv', () => {
  it('parses KEY=value lines into a map', () => {
    expect(parseDotenv('API_TOKEN=abc123\nDB_URL=postgres://x')).toEqual({
      API_TOKEN: 'abc123',
      DB_URL: 'postgres://x',
    });
  });

  it('ignores blank lines and comments', () => {
    expect(parseDotenv('\n# a comment\nKEY=value\n   \n')).toEqual({ KEY: 'value' });
  });

  it('strips matching surrounding quotes from values', () => {
    expect(parseDotenv('A="quoted"\nB=\'single\'\nC=bare')).toEqual({
      A: 'quoted',
      B: 'single',
      C: 'bare',
    });
  });

  it('keeps = signs that appear inside the value', () => {
    expect(parseDotenv('TOKEN=a=b=c')).toEqual({ TOKEN: 'a=b=c' });
  });

  it('skips lines with no assignment', () => {
    expect(parseDotenv('not an assignment\nKEY=ok')).toEqual({ KEY: 'ok' });
  });
});

describe('toInjectableEnv', () => {
  it('passes through valid POSIX env names', () => {
    const env = toInjectableEnv({ API_TOKEN: 'x', _PRIVATE: 'y', N1: 'z' });
    expect(env).toEqual({ API_TOKEN: 'x', _PRIVATE: 'y', N1: 'z' });
  });

  it('rejects a name that is not a valid env var', () => {
    expect(() => toInjectableEnv({ 'bad-name': 'x' })).toThrow(/valid environment variable name/);
    expect(() => toInjectableEnv({ '1LEADING': 'x' })).toThrow(/valid environment variable name/);
  });

  it('rejects a value containing a null byte', () => {
    expect(() => toInjectableEnv({ TOKEN: 'a\0b' })).toThrow(/null byte/);
  });

  it('returns a frozen object without mutating the input', () => {
    const input = { API_TOKEN: 'x' };
    const env = toInjectableEnv(input);
    expect(Object.isFrozen(env)).toBe(true);
    expect(() => {
      (env as Record<string, string>).API_TOKEN = 'y';
    }).toThrow();
    expect(input.API_TOKEN).toBe('x');
  });
});
