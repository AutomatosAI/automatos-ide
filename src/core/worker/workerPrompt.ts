import { Card } from '../cards/card';

/**
 * The one-shot worker contract (12 §3, the Ralph loop).
 *
 * A worker is a stock CLI agent handed a PRD and a fixed contract: build it, prove it
 * green, open a PR, move the card to review, then EXIT — it never loops onto a second
 * card. We don't build the agent; we build the words. Two pure pieces live here: the
 * per-invocation prompt and the per-engine standing-direction filename (CLAUDE.md /
 * AGENTS.md / GEMINI.md) so direction can be dropped into the worktree as a file.
 */

export interface WorkerPromptContext {
  /** The feature branch the card was claimed on; the worker is already on it. */
  readonly branch: string;
  /** The branch the PR targets. */
  readonly baseBranch: string;
}

const DIRECTION_FILES: Readonly<Record<string, string>> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md',
};

/** The standing-direction filename each engine reads from the worktree root. */
export function directionFileFor(engine: string): string {
  const file = DIRECTION_FILES[engine];
  if (!file) {
    throw new Error(`unknown engine "${engine}" — no standing-direction file`);
  }
  return file;
}

function criteriaChecklist(card: Card): string {
  if (card.validationCriteria.length === 0) {
    return 'No explicit acceptance criteria — fully satisfy the PRD body above.';
  }
  return card.validationCriteria.map((c) => `- [${c.done ? 'x' : ' '}] ${c.text}`).join('\n');
}

/** The prompt handed to the CLI for one card. Self-contained — the worker has no chat. */
export function buildWorkerPrompt(card: Card, ctx: WorkerPromptContext): string {
  return [
    `You are an autonomous build worker. Implement ONE card, then exit.`,
    ``,
    `# Card ${card.id}: ${card.title}`,
    ``,
    card.body.trim() || '(no PRD body provided)',
    ``,
    `## Acceptance criteria`,
    criteriaChecklist(card),
    ``,
    `## Contract`,
    `1. This card is already claimed for you on branch \`${ctx.branch}\` in this worktree.`,
    `2. Implement the PRD test-first (TDD). Keep changes scoped to this card.`,
    `3. Run the test suite and do not finish until it is green.`,
    `4. Commit with conventional messages (no attribution footer).`,
    `5. Open a PR into \`${ctx.baseBranch}\` with gh, summarising what you built.`,
    `6. Move the card to review: git mv it into prds/review/, set its frontmatter`,
    `   \`status: review\`, commit, and push.`,
    `7. Exit. Do NOT claim or start any other card.`,
    ``,
    `If you become blocked, append a short "## Blocked" note to the card body explaining`,
    `why, leave the card where it is, and exit — do not force a broken PR.`,
  ].join('\n');
}
