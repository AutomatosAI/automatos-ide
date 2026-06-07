import { describe, it, expect } from 'vitest';
import { parsePrdId, formatPrdId, nextPrdId } from './prdId';

describe('formatPrdId', () => {
  it('zero-pads the number to four digits behind the key', () => {
    expect(formatPrdId('CLINIC', 50)).toBe('CLINIC-0050');
    expect(formatPrdId('PRD', 7)).toBe('PRD-0007');
  });

  it('grows past four digits rather than wrapping', () => {
    expect(formatPrdId('PRD', 10000)).toBe('PRD-10000');
  });
});

describe('parsePrdId', () => {
  it('splits a keyed id into its uppercase key and number', () => {
    expect(parsePrdId('AUTO-0145')).toEqual({ key: 'AUTO', num: 145 });
    expect(parsePrdId('PRD-0002')).toEqual({ key: 'PRD', num: 2 });
  });

  it('uppercases the key so matching is case-insensitive', () => {
    expect(parsePrdId('auto-0003')).toEqual({ key: 'AUTO', num: 3 });
  });

  it('returns null for anything that is not KEY-NNNN', () => {
    expect(parsePrdId('notanid')).toBeNull();
    expect(parsePrdId('PRD-')).toBeNull();
    expect(parsePrdId('-0001')).toBeNull();
    expect(parsePrdId('9X-0001')).toBeNull();
  });
});

describe('nextPrdId — per-project sequences', () => {
  it('starts a brand-new project key at 0001', () => {
    expect(nextPrdId([], 'PRD')).toBe('PRD-0001');
    expect(nextPrdId(['AUTO-0145', 'CLINIC-0049'], 'DRGREEN')).toBe('DRGREEN-0001');
  });

  it('returns one past the highest number FOR THAT KEY only', () => {
    expect(nextPrdId(['PRD-0001', 'PRD-0005', 'PRD-0003'], 'PRD')).toBe('PRD-0006');
    expect(nextPrdId(['AUTO-0145', 'CLINIC-0049', 'AUTO-0002'], 'CLINIC')).toBe('CLINIC-0050');
    expect(nextPrdId(['AUTO-0145', 'CLINIC-0049'], 'AUTO')).toBe('AUTO-0146');
  });

  it('ignores ids of other keys and unparseable ids', () => {
    expect(nextPrdId(['TASK-9', 'PRD-0002', 'notes'], 'PRD')).toBe('PRD-0003');
  });

  it('matches the requested key case-insensitively', () => {
    expect(nextPrdId(['auto-0003'], 'AUTO')).toBe('AUTO-0004');
  });
});
