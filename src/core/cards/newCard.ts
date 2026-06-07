import { Card } from './card';

/**
 * Mint a brand-new inbox card — the pure heart of the "New PRD" action.
 *
 * No I/O: the caller picks the id (see {@link ../cards/prdId.nextPrdId}, scoped to the
 * project's key) and {@link newReadyCard} returns an unclaimed `ready` card carrying a PRD
 * scaffold for a human (or a worker) to flesh out. The host writes it to `prds/inbox/` and
 * pushes — the same git-native path every other board change takes.
 */

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
