import * as vscode from 'vscode';
import { FileStore } from '../fs/fileStore';
import { CONFIG_FILENAME } from './workspace';
import { Config, DEFAULT_CONFIG, parseConfig } from '../core/config/config';
import {
  configToDraft,
  ConfigFormDraft,
  emptyDraft,
  serializeConfig,
  validateDraft,
} from '../core/config/configForm';
import { renderSettingsHtml } from '../ui/settingsView';
import { makeNonce } from '../ui/nonce';

export interface SettingsDeps {
  readonly root: string;
  readonly store: FileStore;
}

/**
 * The settings panel — read/write `config.yml` from a form (PRD-0001).
 *
 * Boundary glue (not unit-tested); the pure parts — {@link validateDraft},
 * {@link serializeConfig}, {@link renderSettingsHtml} — are covered. Reading goes through
 * {@link parseConfig} so we render the same kernel defaults the rest of the cockpit sees;
 * if `config.yml` on disk is malformed we still open the form (seeded from the user's raw
 * draft) so they can fix it inline. Saving validates again on the host — never trust
 * webview input — and only writes when every field is valid; otherwise we re-render the
 * exact draft they submitted with inline errors next to the offending fields.
 */
export class SettingsPanel {
  private static current: SettingsPanel | undefined;

  static show(context: vscode.ExtensionContext, deps: SettingsDeps): void {
    if (SettingsPanel.current) {
      SettingsPanel.current.panel.reveal();
      void SettingsPanel.current.refreshFromDisk();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'automatosSettings',
      'Automatos Settings',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    SettingsPanel.current = new SettingsPanel(panel, deps);
    context.subscriptions.push(panel);
  }

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly deps: SettingsDeps,
  ) {
    this.panel.webview.onDidReceiveMessage(
      (msg) => void this.onMessage(msg),
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    void this.refreshFromDisk();
  }

  private async refreshFromDisk(saved = false): Promise<void> {
    const draft = await this.loadDraft();
    this.render(draft, {}, saved);
  }

  private async loadDraft(): Promise<ConfigFormDraft> {
    try {
      const raw = await this.deps.store.read(CONFIG_FILENAME);
      return configToDraft(parseConfig(raw));
    } catch {
      return emptyDraft();
    }
  }

  /** The current on-disk config, or kernel defaults when it is absent or malformed. */
  private async loadConfig(): Promise<Config> {
    try {
      return parseConfig(await this.deps.store.read(CONFIG_FILENAME));
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  private async onMessage(msg: unknown): Promise<void> {
    if (isSaveMessage(msg)) {
      await this.save(msg.draft);
      return;
    }
    if (isReloadMessage(msg)) {
      await this.refreshFromDisk();
    }
  }

  private async save(rawDraft: unknown): Promise<void> {
    const draft = normalizeDraft(rawDraft);
    // Pass the on-disk config as the baseline so sections the form does not surface
    // (e.g. the automatos block) survive the round-trip instead of resetting to defaults.
    const result = validateDraft(draft, await this.loadConfig());
    if (!result.ok) {
      this.render(draft, result.errors, false);
      return;
    }
    try {
      await this.deps.store.write(CONFIG_FILENAME, serializeConfig(result.config));
    } catch (error) {
      vscode.window.showErrorMessage(`Save failed: ${(error as Error).message}`);
      this.render(draft, {}, false);
      return;
    }
    // Re-read from disk so the form shows exactly what was persisted (proving the
    // round-trip, the "persist across reloads" acceptance criterion).
    await this.refreshFromDisk(true);
  }

  private render(
    draft: ConfigFormDraft,
    errors: ReturnType<typeof validateDraft>['errors'],
    saved: boolean,
  ): void {
    this.panel.webview.html = renderSettingsHtml(draft, {
      nonce: makeNonce(),
      errors,
      saved,
    });
  }

  private dispose(): void {
    SettingsPanel.current = undefined;
    for (const d of this.disposables.splice(0)) {
      d.dispose();
    }
  }
}

function isSaveMessage(msg: unknown): msg is { type: 'save'; draft: unknown } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'save' &&
    'draft' in msg
  );
}

function isReloadMessage(msg: unknown): msg is { type: 'reload' } {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'reload';
}

/**
 * Coerce the webview payload into a {@link ConfigFormDraft}. The webview is "ours" but the
 * VS Code message channel is `any`, so we treat every field as untrusted and fall back to
 * the empty-draft default for anything missing — never throw, so a malformed message just
 * surfaces as a validation error the user can see and fix.
 */
function normalizeDraft(raw: unknown): ConfigFormDraft {
  const base = emptyDraft();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const r = raw as Record<string, unknown>;
  return {
    maxWorkers: stringOr(r.maxWorkers, base.maxWorkers),
    defaultEngine: stringOr(r.defaultEngine, base.defaultEngine),
    pullIntervalSeconds: stringOr(r.pullIntervalSeconds, base.pullIntervalSeconds),
    heartbeatIntervalSeconds: stringOr(r.heartbeatIntervalSeconds, base.heartbeatIntervalSeconds),
    requireValidator: r.requireValidator === true,
    requireCi: r.requireCi === true,
    consolidateEveryCards: stringOr(r.consolidateEveryCards, base.consolidateEveryCards),
    projectRepos: stringOr(r.projectRepos, base.projectRepos),
    sopsRecipients: stringOr(r.sopsRecipients, base.sopsRecipients),
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
