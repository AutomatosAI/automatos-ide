import * as vscode from 'vscode';
import { SecretStore } from './secretStore';

/** SecretStore name (under the `automatos.secret.` prefix) for the publishable workspace key. */
export const WORKSPACE_KEY_NAME = 'workspaceKey';

/**
 * Capture the Automatos publishable workspace key (`ak_pub_*`) into the OS keychain.
 *
 * The key is client-safe by design, but we still store it via {@link SecretStore} (keychain),
 * never settings.json or git, and we hard-reject a secret `ak_srv_*` key here — that one must
 * never reach a client. A blank entry clears the stored key.
 */
export async function setAutomatosKey(secrets: SecretStore): Promise<void> {
  const key = await vscode.window.showInputBox({
    title: 'Automatos Workspace Key',
    prompt: 'Paste your publishable workspace key (ak_pub_…). Leave blank to clear.',
    placeHolder: 'ak_pub_…',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      const trimmed = value.trim();
      if (trimmed === '') {
        return undefined;
      }
      if (trimmed.startsWith('ak_srv_')) {
        return 'That is a secret key. Use a publishable ak_pub_ key — never put ak_srv_ in a client.';
      }
      if (!trimmed.startsWith('ak_pub_')) {
        return 'Expected a publishable key starting with ak_pub_';
      }
      return undefined;
    },
  });
  if (key === undefined) {
    return;
  }
  const trimmed = key.trim();
  if (trimmed === '') {
    await secrets.delete(WORKSPACE_KEY_NAME);
    vscode.window.showInformationMessage('Automatos workspace key cleared.');
    return;
  }
  await secrets.set(WORKSPACE_KEY_NAME, trimmed);
  vscode.window.showInformationMessage('Automatos workspace key saved to the OS keychain.');
}
