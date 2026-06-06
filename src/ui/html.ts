/**
 * The one HTML helper a webview can't do without: escaping (M0/M4 views).
 *
 * Card titles, chat bodies, and owner handles are untrusted text written by humans and
 * agents. Anything interpolated into webview HTML MUST be escaped or it is a stored-XSS
 * hole. {@link escapeHtml} is deliberately tiny and pure so every view can lean on it.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
