import { describe, it, expect } from 'vitest';
import {
  CARD_STATUSES,
  folderForStatus,
  statusForFolder,
  isCardStatus,
} from './status';

describe('card status ↔ folder mapping', () => {
  it('maps every status to a folder and back (round-trip)', () => {
    for (const status of CARD_STATUSES) {
      expect(statusForFolder(folderForStatus(status))).toBe(status);
    }
  });

  it('maps the ready status to the inbox folder (the names differ)', () => {
    expect(folderForStatus('ready')).toBe('inbox');
    expect(statusForFolder('inbox')).toBe('ready');
  });

  it('returns undefined for an unknown folder', () => {
    expect(statusForFolder('archive')).toBeUndefined();
  });

  it('guards card status values', () => {
    expect(isCardStatus('review')).toBe(true);
    expect(isCardStatus('blocked')).toBe(false);
    expect(isCardStatus(null)).toBe(false);
    expect(isCardStatus(7)).toBe(false);
  });
});
