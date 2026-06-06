import YAML from 'yaml';
import { Card, ValidationCriterion } from './card';
import { isCardStatus } from './status';

/**
 * Parse and serialize a card file (YAML frontmatter + markdown body).
 *
 * Spec: 14-data-model.md §2. A card file is EXTERNAL input (written by humans and
 * agents), so {@link parseCard} validates at the boundary and throws a clear error
 * rather than producing a half-formed card.
 */

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---[ \t]*\n?([\s\S]*)$/;

export interface SplitDoc {
  readonly frontmatter: string;
  readonly body: string;
}

export function splitFrontmatter(raw: string): SplitDoc {
  const text = raw.replace(/\r\n/g, '\n');
  const match = FRONTMATTER_RE.exec(text);
  if (!match) {
    throw new Error('card has no frontmatter: expected a leading "---" block closed by "---"');
  }
  return { frontmatter: match[1], body: match[2] ?? '' };
}

export function parseCard(raw: string): Card {
  const { frontmatter, body } = splitFrontmatter(raw);
  const parsed: unknown = YAML.parse(frontmatter) ?? {};
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('card frontmatter must be a YAML mapping');
  }
  const fm = parsed as Record<string, unknown>;

  const id = requireString(fm, 'id');
  if (!isCardStatus(fm.status)) {
    throw new Error(`card ${id}: invalid or missing status ${JSON.stringify(fm.status)}`);
  }

  return {
    id,
    title: requireString(fm, 'title'),
    project: requireString(fm, 'project'),
    status: fm.status,
    owner: optionalString(fm.owner),
    branch: optionalString(fm.branch),
    priority: typeof fm.priority === 'number' ? fm.priority : 0,
    created: coerceDate(fm.created),
    updated: optionalString(fm.updated),
    engine: optionalString(fm.engine),
    validationCriteria: parseCriteria(fm.validation_criteria),
    body,
  };
}

export function serializeCard(card: Card): string {
  const fm = {
    id: card.id,
    title: card.title,
    project: card.project,
    status: card.status,
    owner: card.owner,
    branch: card.branch,
    priority: card.priority,
    created: card.created,
    updated: card.updated,
    engine: card.engine,
    validation_criteria: card.validationCriteria.map((c) => c.text),
  };
  const yamlBlock = YAML.stringify(fm).trimEnd();
  const body = card.body.replace(/\r\n/g, '\n').replace(/^\n/, '');
  return `---\n${yamlBlock}\n---\n${body}`;
}

function requireString(fm: Record<string, unknown>, key: string): string {
  const value = fm[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`card frontmatter: "${key}" is required and must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return typeof value === 'string' ? value : String(value);
}

function coerceDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value === null || value === undefined ? '' : String(value);
}

function parseCriteria(value: unknown): readonly ValidationCriterion[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item): ValidationCriterion => {
    if (item && typeof item === 'object' && 'text' in item) {
      const obj = item as { text: unknown; done?: unknown };
      return { text: String(obj.text), done: obj.done === true };
    }
    return { text: String(item), done: false };
  });
}
