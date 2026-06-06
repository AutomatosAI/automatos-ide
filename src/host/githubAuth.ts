import * as vscode from 'vscode';
import { Identity, humanIdentity } from '../core/identity/identity';

const GITHUB_PROVIDER = 'github';
const SCOPES = ['read:user'];

/**
 * The signed-in human, derived from the VS Code GitHub session (25 §1).
 *
 * `vscode.authentication` owns the OAuth flow; we ask only for the lightweight
 * `read:user` scope and turn the GitHub login into a validated {@link Identity}. With
 * `createIfNone` the native sign-in prompt appears on first use. Undefined when the user
 * dismisses sign-in, so the caller can degrade rather than throw — identity derivation
 * itself stays pure ({@link humanIdentity}); only the session fetch is boundary I/O.
 */
export async function currentHuman(createIfNone = true): Promise<Identity | undefined> {
  try {
    const session = await vscode.authentication.getSession(GITHUB_PROVIDER, SCOPES, {
      createIfNone,
    });
    return session ? humanIdentity(session.account.label) : undefined;
  } catch {
    return undefined; // user dismissed the sign-in prompt
  }
}
