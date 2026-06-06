import { Card } from '../cards/card';

/**
 * Split a PRD into child task cards (22 §3).
 *
 * The hard part — reading prose and inventing the right tasks — is AUTO's (the agent's)
 * judgment. What is OURS, and deterministic, is turning the structured result into real
 * cards: parse the PRD's "## Tasks" checklist into {@link TaskSpec}s, then materialize
 * them as `ready` cards that inherit the parent's project/engine/priority and carry an
 * id showing their lineage (`PRD-7` → `PRD-7.1`, `PRD-7.2`). Pure: the caller writes the
 * files and pushes.
 */

export interface TaskSpec {
  readonly title: string;
  /** Detail lines that sat under the checklist item (may be empty). */
  readonly body: string;
}

const TASK_HEADING = /^#{1,6}\s+(tasks|subtasks|user stories|stories)\b/i;
const HEADING = /^#{1,6}\s+/;
const LIST_ITEM = /^\s*(?:[-*]|\d+\.)\s+(.*)$/;
const CHECKBOX = /^\[[ xX]\]\s+/;

/** Parse the "## Tasks" (or stories/subtasks) checklist out of a PRD body. */
export function parseTaskList(prdBody: string): readonly TaskSpec[] {
  const lines = prdBody.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => TASK_HEADING.test(line));
  if (start === -1) {
    return [];
  }

  const draft: { title: string; bodyLines: string[] }[] = [];
  let baseIndent: number | null = null;

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (HEADING.test(line)) {
      break; // the next section ends the task list
    }
    const item = LIST_ITEM.exec(line);
    const indent = line.length - line.trimStart().length;
    const isTopItem = item !== null && (baseIndent === null || indent <= baseIndent);

    if (isTopItem) {
      baseIndent = baseIndent ?? indent;
      const title = item![1].replace(CHECKBOX, '').trim();
      if (title.length > 0) {
        draft.push({ title, bodyLines: [] });
      }
    } else if (line.trim().length > 0 && draft.length > 0) {
      // deeper bullets and prose under an item become its body (markers stripped)
      draft[draft.length - 1].bodyLines.push(item ? item[1].trim() : line.trim());
    }
  }

  return draft.map((t) => ({ title: t.title, body: t.bodyLines.join('\n') }));
}

export interface DecomposeContext {
  /** ISO timestamp used for the children's `created` date. */
  readonly now: string;
}

/** Materialize task specs into ready child cards under a parent PRD. */
export function decompose(
  parent: Card,
  specs: readonly TaskSpec[],
  ctx: DecomposeContext,
): readonly Card[] {
  return specs.map((spec, index) => ({
    id: `${parent.id}.${index + 1}`,
    title: spec.title,
    project: parent.project,
    status: 'ready',
    owner: null,
    branch: null,
    priority: parent.priority,
    created: ctx.now.slice(0, 10),
    updated: null,
    engine: parent.engine,
    validationCriteria: [],
    body: spec.body,
  }));
}

/** Convenience: parse a parent PRD's checklist and materialize its children. */
export function decomposePrd(parent: Card, ctx: DecomposeContext): readonly Card[] {
  return decompose(parent, parseTaskList(parent.body), ctx);
}
