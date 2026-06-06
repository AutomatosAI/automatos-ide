import * as vscode from 'vscode';

/**
 * Extension entry point. Activation is gated on `workspaceContains:**\/config.yml`
 * (see package.json) so the cockpit only wakes inside a control repo.
 *
 * All durable state lives in git, never in extension memory — `deactivate` is a
 * no-op by design. Subsystems (board, chat, AUTO, workers) register here as they
 * come online milestone by milestone.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('automatos.openBoard', () => {
      vscode.window.showInformationMessage('Automatos board — coming online (M0).');
    }),
    vscode.commands.registerCommand('automatos.openChat', () => {
      vscode.window.showInformationMessage('Automatos team chat — coming online (M4).');
    }),
    vscode.commands.registerCommand('automatos.consolidateMemory', () => {
      vscode.window.showInformationMessage('Automatos memory consolidation — coming online (M5).');
    }),
  );
}

export function deactivate(): void {
  // Intentionally empty: the substrate is git, so there is no in-memory state to flush.
}
