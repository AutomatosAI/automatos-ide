import { describe, it, expect } from 'vitest';
import { renderSettingsHtml } from './settingsView';
import { configToDraft, emptyDraft } from '../core/config/configForm';
import { DEFAULT_CONFIG } from '../core/config/config';

describe('renderSettingsHtml', () => {
  it('renders the current values into the form', () => {
    const draft = configToDraft({
      ...DEFAULT_CONFIG,
      agents: { maxWorkers: 3, defaultEngine: 'codex' },
    });
    const html = renderSettingsHtml(draft);
    expect(html).toContain('name="maxWorkers"');
    expect(html).toContain('value="3"');
    expect(html).toMatch(/<option value="codex"\s+selected/);
  });

  it('renders a Save button that submits the form', () => {
    const html = renderSettingsHtml(emptyDraft());
    expect(html).toContain('<form');
    expect(html).toMatch(/<button[^>]*type="submit"/);
  });

  it('shows inline errors next to the offending field', () => {
    const html = renderSettingsHtml(emptyDraft(), {
      errors: { maxWorkers: 'must be a positive integer' },
    });
    expect(html).toContain('data-error-for="maxWorkers"');
    expect(html).toContain('must be a positive integer');
  });

  it('escapes error messages so untrusted input cannot inject HTML', () => {
    const html = renderSettingsHtml(emptyDraft(), {
      errors: { maxWorkers: '<img src=x onerror=alert(1)>' },
    });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });

  it('escapes field values so reloading malicious YAML cannot inject HTML', () => {
    const draft = {
      ...emptyDraft(),
      projectRepos: '"><script>alert(1)</script>',
    };
    const html = renderSettingsHtml(draft);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('binds the CSP nonce to the inline script', () => {
    const html = renderSettingsHtml(emptyDraft(), { nonce: 'abc123' });
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('<script nonce="abc123">');
  });

  it('shows a status banner when the most recent save succeeded', () => {
    const html = renderSettingsHtml(emptyDraft(), { saved: true });
    expect(html).toMatch(/class="status saved"/);
    expect(html).toMatch(/saved/i);
  });

  it('does not show a status banner by default', () => {
    const html = renderSettingsHtml(emptyDraft());
    expect(html).not.toContain('class="status saved"');
  });

  it('marks fields with errors so styling can highlight them', () => {
    const html = renderSettingsHtml(emptyDraft(), {
      errors: { defaultEngine: 'unknown engine' },
    });
    expect(html).toMatch(/data-field="defaultEngine"[^>]*data-invalid="true"/);
  });

  it('renders checkboxes as checked when the draft says so', () => {
    const html = renderSettingsHtml({ ...emptyDraft(), requireValidator: true, requireCi: false });
    expect(html).toMatch(/name="requireValidator"[^>]*checked/);
    expect(html).not.toMatch(/name="requireCi"[^>]*checked/);
  });
});
