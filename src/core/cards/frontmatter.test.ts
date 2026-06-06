import { describe, it, expect } from 'vitest';
import { parseCard, serializeCard, splitFrontmatter } from './frontmatter';

const SAMPLE = `---
id: PRD-0007
title: Add rate limiting to ingest API
project: ingest-service
status: ready
owner: null
branch: null
priority: 2
created: 2026-06-06
updated: null
engine: null
validation_criteria:
  - returns 429 over the limit
  - resets after the window
---
## Goal
Throttle the ingest API.

## Acceptance criteria
- [ ] 429 over limit
`;

describe('splitFrontmatter', () => {
  it('separates the YAML block from the markdown body', () => {
    const { frontmatter, body } = splitFrontmatter(SAMPLE);
    expect(frontmatter).toContain('id: PRD-0007');
    expect(body).toContain('## Goal');
    expect(body).not.toContain('---');
  });

  it('throws when there is no frontmatter block', () => {
    expect(() => splitFrontmatter('# just a heading\n')).toThrow(/no frontmatter/);
  });

  it('handles CRLF line endings', () => {
    const crlf = SAMPLE.replace(/\n/g, '\r\n');
    expect(() => splitFrontmatter(crlf)).not.toThrow();
  });
});

describe('parseCard', () => {
  it('parses every typed field', () => {
    const card = parseCard(SAMPLE);
    expect(card.id).toBe('PRD-0007');
    expect(card.title).toBe('Add rate limiting to ingest API');
    expect(card.project).toBe('ingest-service');
    expect(card.status).toBe('ready');
    expect(card.owner).toBeNull();
    expect(card.priority).toBe(2);
    expect(card.created).toBe('2026-06-06');
    expect(card.validationCriteria).toHaveLength(2);
    expect(card.validationCriteria[0]).toEqual({ text: 'returns 429 over the limit', done: false });
    expect(card.body).toContain('## Goal');
  });

  it('parses a non-null owner as a string', () => {
    const claimed = SAMPLE.replace('owner: null', 'owner: agent-3').replace(
      'status: ready',
      'status: in-progress',
    );
    const card = parseCard(claimed);
    expect(card.owner).toBe('agent-3');
    expect(card.status).toBe('in-progress');
  });

  it('throws on a missing required field', () => {
    const noId = SAMPLE.replace('id: PRD-0007\n', '');
    expect(() => parseCard(noId)).toThrow(/"id" is required/);
  });

  it('throws on an invalid status', () => {
    const bad = SAMPLE.replace('status: ready', 'status: frozen');
    expect(() => parseCard(bad)).toThrow(/invalid or missing status/);
  });
});

describe('round-trip', () => {
  it('parse → serialize → parse preserves the fields', () => {
    const card = parseCard(SAMPLE);
    const reparsed = parseCard(serializeCard(card));
    expect(reparsed.id).toBe(card.id);
    expect(reparsed.status).toBe(card.status);
    expect(reparsed.owner).toBe(card.owner);
    expect(reparsed.priority).toBe(card.priority);
    expect(reparsed.validationCriteria).toEqual(card.validationCriteria);
    expect(reparsed.body.trim()).toBe(card.body.trim());
  });

  it('serializes criteria back to a YAML string list', () => {
    const card = parseCard(SAMPLE);
    const text = serializeCard(card);
    expect(text).toContain('validation_criteria:');
    expect(text).toContain('- returns 429 over the limit');
  });
});
