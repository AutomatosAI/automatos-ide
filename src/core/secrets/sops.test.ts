import { describe, it, expect } from 'vitest';
import YAML from 'yaml';
import {
  SOPS_BIN,
  DEFAULT_SECRETS_PATH_REGEX,
  isPublicAgeRecipient,
  assertPublicAgeRecipient,
  buildSopsConfig,
  sopsCommand,
} from './sops';

const PUB = 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p';
const PRIV = 'AGE-SECRET-KEY-1QYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQS';

describe('isPublicAgeRecipient', () => {
  it('accepts an age1 public recipient and rejects anything else', () => {
    expect(isPublicAgeRecipient(PUB)).toBe(true);
    expect(isPublicAgeRecipient('ssh-ed25519 AAAA')).toBe(false);
    expect(isPublicAgeRecipient(PRIV)).toBe(false);
  });
});

describe('assertPublicAgeRecipient', () => {
  it('passes a public recipient', () => {
    expect(() => assertPublicAgeRecipient(PUB)).not.toThrow();
  });

  it('refuses an age private key loudly', () => {
    expect(() => assertPublicAgeRecipient(PRIV)).toThrow(/PRIVATE key/);
  });

  it('rejects a malformed recipient', () => {
    expect(() => assertPublicAgeRecipient('not-an-age-key')).toThrow(/valid public age recipient/);
  });
});

describe('buildSopsConfig', () => {
  it('writes a creation rule with the default secrets path and joined recipients', () => {
    const pub2 = 'age1lggyhqrw2nlhcxprm67z43rta597azn8gknawjehu9d9dl0jq3yqqvfafg';
    const parsed = YAML.parse(buildSopsConfig([PUB, pub2]));
    expect(parsed.creation_rules).toEqual([
      { path_regex: DEFAULT_SECRETS_PATH_REGEX, age: `${PUB},${pub2}` },
    ]);
  });

  it('honors a custom path regex', () => {
    const parsed = YAML.parse(buildSopsConfig([PUB], { pathRegex: 'vault/.*' }));
    expect(parsed.creation_rules[0].path_regex).toBe('vault/.*');
  });

  it('refuses to emit a config that leaks a private key', () => {
    expect(() => buildSopsConfig([PUB, PRIV])).toThrow(/PRIVATE key/);
  });

  it('throws when given no recipients', () => {
    expect(() => buildSopsConfig([])).toThrow(/no recipients/);
  });
});

describe('sopsCommand', () => {
  it('encrypts a file in place', () => {
    expect(sopsCommand('encrypt', 'secrets/team.env')).toEqual({
      command: SOPS_BIN,
      args: ['--encrypt', '--in-place', 'secrets/team.env'],
    });
  });

  it('decrypts to stdout (never a worktree file)', () => {
    expect(sopsCommand('decrypt', 'secrets/team.env')).toEqual({
      command: SOPS_BIN,
      args: ['--decrypt', 'secrets/team.env'],
    });
  });

  it('refuses a path that could be smuggled in as a flag', () => {
    expect(() => sopsCommand('decrypt', '--in-place')).toThrow(/looks like a flag/);
  });

  it('rejects control characters in the path', () => {
    expect(() => sopsCommand('encrypt', 'secrets/a\nb.env')).toThrow(/control characters/);
  });
});
