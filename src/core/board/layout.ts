import { CardStatus, folderForStatus } from '../cards/status';

/**
 * Where cards live on disk. The control repo holds the queue under {@link PRDS_ROOT},
 * one folder per status (14 §2.1). These helpers build the repo-relative paths used
 * for BOTH git argv and file reads/writes, so the two can never disagree.
 */

export const PRDS_ROOT = 'prds';

/** The folder that renders a status, e.g. `prds/inbox`. */
export function folderPath(status: CardStatus): string {
  return `${PRDS_ROOT}/${folderForStatus(status)}`;
}

/** A card's file path for a given status, e.g. `prds/in-progress/PRD-0007.md`. */
export function cardPath(status: CardStatus, id: string): string {
  return `${folderPath(status)}/${id}.md`;
}

/** True for a queue file we should parse as a card (skips .gitkeep and friends). */
export function isCardFile(name: string): boolean {
  return name.endsWith('.md');
}
