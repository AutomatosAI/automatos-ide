import * as vscode from 'vscode';

/** Namespace so our keys never collide with another extension's in the keychain. */
const PREFIX = 'automatos.secret.';

/**
 * Personal model keys in the OS keychain, via {@link vscode.SecretStorage} (26 §2).
 *
 * The subscription-login path needs none of this; key injection is the fallback for an
 * engine without an ambient session. Keys live in the OS keychain — NEVER settings.json,
 * NEVER git — and reach a worker only as an injected env var, never as a worktree file.
 * Team-shared secrets are a different mechanism entirely (SOPS+age); this is per-user.
 */
export class SecretStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  get(name: string): Thenable<string | undefined> {
    return this.secrets.get(PREFIX + name);
  }

  set(name: string, value: string): Thenable<void> {
    return this.secrets.store(PREFIX + name, value);
  }

  delete(name: string): Thenable<void> {
    return this.secrets.delete(PREFIX + name);
  }
}
