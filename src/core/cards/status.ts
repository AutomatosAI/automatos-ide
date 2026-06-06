/**
 * Card status and its mapping to queue folders.
 *
 * Spec: 14-data-model.md §2.1 — the frontmatter `status` is the SOURCE OF TRUTH;
 * the folder a card sits in (`prds/<folder>/`) is only a render cache. These maps
 * translate between the two so the reconciler can detect and heal divergence.
 */

export const CARD_STATUSES = ['ready', 'in-progress', 'review', 'done'] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

/** status → the folder name under `prds/` that renders it. */
export const STATUS_TO_FOLDER: Readonly<Record<CardStatus, string>> = {
  ready: 'inbox',
  'in-progress': 'in-progress',
  review: 'review',
  done: 'done',
};

/** folder name under `prds/` → the status it represents. */
export const FOLDER_TO_STATUS: Readonly<Record<string, CardStatus>> = {
  inbox: 'ready',
  'in-progress': 'in-progress',
  review: 'review',
  done: 'done',
};

export function isCardStatus(value: unknown): value is CardStatus {
  return typeof value === 'string' && (CARD_STATUSES as readonly string[]).includes(value);
}

export function folderForStatus(status: CardStatus): string {
  return STATUS_TO_FOLDER[status];
}

/** Inverse of {@link folderForStatus}; `undefined` for an unknown folder name. */
export function statusForFolder(folder: string): CardStatus | undefined {
  return FOLDER_TO_STATUS[folder];
}
