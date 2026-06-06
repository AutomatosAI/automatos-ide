import { randomBytes } from 'node:crypto';

/**
 * A per-render CSP nonce for webview inline scripts.
 *
 * Each webview render gets a fresh nonce; the `<script nonce>` and the CSP
 * `script-src 'nonce-…'` must match, so only our own script runs. Alphanumeric only,
 * so it is safe to drop straight into an HTML attribute without escaping.
 */
export function makeNonce(): string {
  return randomBytes(16).toString('base64').replace(/[^A-Za-z0-9]/g, '');
}
