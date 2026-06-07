import { describe, it, expect } from 'vitest';
import { parsePrState, UNKNOWN_PR } from './prState';

describe('parsePrState', () => {
  it('reads a merged PR', () => {
    const pr = parsePrState('{"state":"MERGED","url":"https://github.com/o/r/pull/7"}');
    expect(pr).toEqual({ state: 'MERGED', merged: true, url: 'https://github.com/o/r/pull/7' });
  });

  it('reads an open PR as not merged', () => {
    const pr = parsePrState('{"state":"OPEN","url":"https://github.com/o/r/pull/8"}');
    expect(pr.state).toBe('OPEN');
    expect(pr.merged).toBe(false);
  });

  it('reads a closed (unmerged) PR as not merged', () => {
    expect(parsePrState('{"state":"CLOSED","url":"x"}').merged).toBe(false);
  });

  it('normalizes case (gh has reported lowercase in some versions)', () => {
    expect(parsePrState('{"state":"merged"}').merged).toBe(true);
  });

  it('falls back to UNKNOWN on malformed JSON (fail-closed)', () => {
    expect(parsePrState('not json')).toEqual(UNKNOWN_PR);
    expect(parsePrState('')).toEqual(UNKNOWN_PR);
  });

  it('falls back to UNKNOWN on a non-object payload', () => {
    expect(parsePrState('[]')).toEqual(UNKNOWN_PR);
    expect(parsePrState('42')).toEqual(UNKNOWN_PR);
    expect(parsePrState('null')).toEqual(UNKNOWN_PR);
  });

  it('treats an unfamiliar state as UNKNOWN and not merged', () => {
    const pr = parsePrState('{"state":"DRAFT"}');
    expect(pr.state).toBe('UNKNOWN');
    expect(pr.merged).toBe(false);
  });

  it('tolerates a missing url', () => {
    expect(parsePrState('{"state":"MERGED"}').url).toBeNull();
  });
});
