import { Card } from './card';

/**
 * Mint a brand-new inbox card — the pure heart of the "New PRD" action.
 *
 * No I/O: {@link nextPrdId} picks the next free `PRD-NNNN` from the ids already on the
 * board, and {@link newReadyCard} returns an unclaimed `ready` card carrying a PRD scaffold
 * for a human (or a worker) to flesh out. The host writes it to `prds/inbox/` and pushes —
 * the same git-native path every other board change takes.
 */

const PRD_ID_RE = /^PRD-(\d+)$/;

/** The next sequential `PRD-NNNN` id (zero-padded to four) given the ids already in use. */
export function nextPrdId(existingIds: readonly string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const match = PRD_ID_RE.exec(id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `PRD-${String(max + 1).padStart(4, '0')}`;
}

export interface NewCardInput {
  readonly id: string;
  readonly title: string;
  readonly project: string;
  readonly priority: number;
  /** ISO timestamp; its date half stamps `created`, the whole stamps `updated`. */
  readonly now: string;
}

/** A fresh, unclaimed `ready` card carrying a PRD scaffold for the author to complete. */
export function newReadyCard(input: NewCardInput): Card {
  return {
    id: input.id,
    title: input.title,
    project: input.project,
    status: 'ready',
    owner: null,
    branch: null,
    priority: input.priority,
    created: input.now.slice(0, 10),
    updated: input.now,
    engine: null,
    validationCriteria: [],
    body: scaffoldBody(input.title),
  };
}

function scaffoldBody(title: string): string {
  return [
    `## Problem`,
    `What does "${title}" need to solve, and why now?`,
    ``,
    `## Acceptance criteria`,
    `- [ ] First observable outcome a reviewer can check`,
    ``,
    `## Tasks`,
    `- [ ] First task — AUTO can split these into child cards`,
    ``,
  ].join('\n');
}
