import { ENGINES } from '../core/config/config';
import { ConfigFormDraft, ConfigFormErrors } from '../core/config/configForm';
import { escapeHtml } from './html';

/**
 * Render the settings panel — read/write `config.yml` from a form (PRD-0001).
 *
 * Pure: draft + errors in, HTML out, unit-tested without VS Code. Submitting the form
 * posts `{type:'save', draft}` back to the extension; the host validates again (defence
 * in depth — never trust webview input), writes the file, and either re-renders with the
 * inline errors that {@link validateDraft} produced or shows a `saved` banner. Every
 * interpolation is escaped because `config.yml` is plain text someone else on the team
 * may have written.
 */

export interface SettingsViewOptions {
  /** CSP nonce for the inline submit script. */
  readonly nonce?: string;
  /** Per-field validation errors to render inline next to the offending input. */
  readonly errors?: ConfigFormErrors;
  /** True when the most recent save committed to disk — shows a transient "Saved" banner. */
  readonly saved?: boolean;
}

export function renderSettingsHtml(
  draft: ConfigFormDraft,
  options: SettingsViewOptions = {},
): string {
  const nonce = options.nonce ?? '';
  const errors = options.errors ?? {};
  const saved = options.saved === true;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; padding: 16px; max-width: 720px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .lead { font-size: 12px; opacity: 0.7; margin: 0 0 16px; }
  .status { padding: 6px 10px; border-radius: 4px; margin-bottom: 12px; font-size: 12px; }
  .status.saved { background: var(--vscode-testing-iconPassed, #2ea043); color: var(--vscode-editor-background); }
  fieldset { border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 12px 14px; margin: 0 0 14px; }
  legend { font-size: 11px; text-transform: uppercase; opacity: 0.7; padding: 0 6px; }
  .field { display: flex; flex-direction: column; margin-bottom: 10px; }
  .field:last-child { margin-bottom: 0; }
  .field label { font-size: 12px; margin-bottom: 4px; }
  .field input, .field select, .field textarea {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    padding: 4px 6px;
    font: inherit;
  }
  .field textarea { font-family: var(--vscode-editor-font-family, monospace); min-height: 64px; resize: vertical; }
  .field[data-invalid="true"] input,
  .field[data-invalid="true"] select,
  .field[data-invalid="true"] textarea {
    border-color: var(--vscode-inputValidation-errorBorder, #f48771);
  }
  .error { color: var(--vscode-errorForeground, #f48771); font-size: 11px; margin-top: 4px; }
  .check { flex-direction: row; align-items: center; gap: 6px; }
  .check input { margin: 0; }
  .actions { display: flex; gap: 8px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 6px 14px; cursor: pointer; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .hint { font-size: 11px; opacity: 0.6; margin-top: 4px; }
</style>
</head>
<body>
<h1>Automatos Settings</h1>
<p class="lead">Read and write <code>config.yml</code> for this control repo.</p>
${saved ? '<div class="status saved">Saved.</div>' : ''}
<form id="settings">
  <fieldset>
    <legend>Agents</legend>
    ${textField('maxWorkers', 'Max concurrent workers', draft.maxWorkers, errors, { type: 'number', min: '1', step: '1' })}
    ${selectField('defaultEngine', 'Default engine', draft.defaultEngine, ENGINES, errors)}
  </fieldset>

  <fieldset>
    <legend>Sync</legend>
    ${textField('pullIntervalSeconds', 'Pull interval (seconds)', draft.pullIntervalSeconds, errors, { type: 'number', min: '1', step: '1' })}
    ${textField('heartbeatIntervalSeconds', 'Heartbeat interval (seconds)', draft.heartbeatIntervalSeconds, errors, { type: 'number', min: '1', step: '1' })}
  </fieldset>

  <fieldset>
    <legend>Verification</legend>
    ${checkboxField('requireValidator', 'Require an independent validator', draft.requireValidator, errors)}
    ${checkboxField('requireCi', 'Require CI to be green', draft.requireCi, errors)}
  </fieldset>

  <fieldset>
    <legend>Memory</legend>
    ${textField('consolidateEveryCards', 'Consolidate every N cards (blank = manual only)', draft.consolidateEveryCards, errors, { type: 'text' })}
  </fieldset>

  <fieldset>
    <legend>Project repos</legend>
    ${textareaField('projectRepos', 'One per line, in the form name=path', draft.projectRepos, errors, 'api=../api')}
  </fieldset>

  <fieldset>
    <legend>Secrets</legend>
    ${textareaField('sopsRecipients', 'Public age keys, one per line', draft.sopsRecipients, errors, 'age1abc…')}
  </fieldset>

  <div class="actions">
    <button type="submit">Save</button>
    <button type="button" class="secondary" data-action="reload">Reload from disk</button>
  </div>
</form>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('settings');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const draft = {
      maxWorkers: String(data.get('maxWorkers') ?? ''),
      defaultEngine: String(data.get('defaultEngine') ?? ''),
      pullIntervalSeconds: String(data.get('pullIntervalSeconds') ?? ''),
      heartbeatIntervalSeconds: String(data.get('heartbeatIntervalSeconds') ?? ''),
      requireValidator: data.get('requireValidator') !== null,
      requireCi: data.get('requireCi') !== null,
      consolidateEveryCards: String(data.get('consolidateEveryCards') ?? ''),
      projectRepos: String(data.get('projectRepos') ?? ''),
      sopsRecipients: String(data.get('sopsRecipients') ?? ''),
    };
    vscode.postMessage({ type: 'save', draft });
  });
  for (const btn of document.querySelectorAll('button[data-action]')) {
    btn.addEventListener('click', () => vscode.postMessage({ type: btn.dataset.action }));
  }
</script>
</body>
</html>`;
}

interface InputAttrs {
  readonly type?: string;
  readonly min?: string;
  readonly step?: string;
}

function textField(
  name: keyof ConfigFormDraft,
  label: string,
  value: string,
  errors: ConfigFormErrors,
  attrs: InputAttrs = {},
): string {
  const error = errors[name];
  const type = attrs.type ?? 'text';
  const extra = [
    attrs.min !== undefined ? ` min="${escapeHtml(attrs.min)}"` : '',
    attrs.step !== undefined ? ` step="${escapeHtml(attrs.step)}"` : '',
  ].join('');
  return `<div class="field" data-field="${name}"${error ? ' data-invalid="true"' : ''}>
    <label for="f-${name}">${escapeHtml(label)}</label>
    <input id="f-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}"${extra} />
    ${renderError(name, error)}
  </div>`;
}

function selectField(
  name: keyof ConfigFormDraft,
  label: string,
  value: string,
  choices: readonly string[],
  errors: ConfigFormErrors,
): string {
  const error = errors[name];
  const options = choices
    .map((choice) => {
      const selected = choice === value ? ' selected' : '';
      return `<option value="${escapeHtml(choice)}"${selected}>${escapeHtml(choice)}</option>`;
    })
    .join('');
  return `<div class="field" data-field="${name}"${error ? ' data-invalid="true"' : ''}>
    <label for="f-${name}">${escapeHtml(label)}</label>
    <select id="f-${name}" name="${name}">${options}</select>
    ${renderError(name, error)}
  </div>`;
}

function checkboxField(
  name: keyof ConfigFormDraft,
  label: string,
  checked: boolean,
  errors: ConfigFormErrors,
): string {
  const error = errors[name];
  return `<div class="field check" data-field="${name}"${error ? ' data-invalid="true"' : ''}>
    <input id="f-${name}" name="${name}" type="checkbox" value="on"${checked ? ' checked' : ''} />
    <label for="f-${name}">${escapeHtml(label)}</label>
    ${renderError(name, error)}
  </div>`;
}

function textareaField(
  name: keyof ConfigFormDraft,
  hint: string,
  value: string,
  errors: ConfigFormErrors,
  placeholder: string,
): string {
  const error = errors[name];
  return `<div class="field" data-field="${name}"${error ? ' data-invalid="true"' : ''}>
    <label for="f-${name}">${escapeHtml(hint)}</label>
    <textarea id="f-${name}" name="${name}" rows="3" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>
    ${renderError(name, error)}
  </div>`;
}

function renderError(name: keyof ConfigFormDraft, error: string | undefined): string {
  if (!error) {
    return '';
  }
  return `<div class="error" data-error-for="${name}">${escapeHtml(error)}</div>`;
}
