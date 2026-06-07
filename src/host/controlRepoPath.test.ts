import { describe, expect, it } from 'vitest';
import { expandHome, normalizeControlRepoSetting } from './controlRepoPath';

const HOME = '/Users/dev';

describe('expandHome', () => {
  it('expands a bare ~ to home', () => {
    expect(expandHome('~', HOME)).toBe(HOME);
  });

  it('expands ~/sub to home/sub', () => {
    expect(expandHome('~/work/control', HOME)).toBe('/Users/dev/work/control');
  });

  it('leaves an absolute path untouched', () => {
    expect(expandHome('/srv/control', HOME)).toBe('/srv/control');
  });

  it('does not expand a ~ that is not a leading path segment', () => {
    expect(expandHome('/tmp/~backup', HOME)).toBe('/tmp/~backup');
  });
});

describe('normalizeControlRepoSetting', () => {
  it('returns undefined when unset', () => {
    expect(normalizeControlRepoSetting(undefined, HOME)).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(normalizeControlRepoSetting('', HOME)).toBeUndefined();
  });

  it('returns undefined for whitespace only', () => {
    expect(normalizeControlRepoSetting('   ', HOME)).toBeUndefined();
  });

  it('trims surrounding whitespace then expands ~', () => {
    expect(normalizeControlRepoSetting('  ~/control  ', HOME)).toBe('/Users/dev/control');
  });

  it('passes an absolute path through unchanged', () => {
    expect(normalizeControlRepoSetting('/srv/control', HOME)).toBe('/srv/control');
  });
});
