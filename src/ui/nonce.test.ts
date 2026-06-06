import { describe, it, expect } from 'vitest';
import { makeNonce } from './nonce';

describe('makeNonce', () => {
  it('is alphanumeric only, so it needs no HTML escaping', () => {
    expect(makeNonce()).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('has enough entropy to be non-empty and varied', () => {
    expect(makeNonce().length).toBeGreaterThanOrEqual(16);
    expect(makeNonce()).not.toBe(makeNonce());
  });
});
