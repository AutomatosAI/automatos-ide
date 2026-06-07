import { describe, it, expect } from 'vitest';
import { Card } from '../core/cards/card';
import { Config, DEFAULT_CONFIG } from '../core/config/config';
import { deriveProjectKey } from '../core/config/projectKey';
import { projectRepoDir } from './projectRepoDir';

const HOME = '/Users/dev';
const CONTROL = '/Users/dev/control';

function card(project: string): Card {
  return {
    id: 'PRD-1',
    title: 'PRD-1',
    project,
    status: 'in-progress',
    owner: 'me',
    branch: 'feat/prd-1',
    priority: 3,
    created: '2026-01-01',
    updated: null,
    engine: null,
    validationCriteria: [],
    body: '',
  };
}

function config(repos: readonly { name: string; path: string }[]): Config {
  return {
    ...DEFAULT_CONFIG,
    projectRepos: repos.map((r) => ({ ...r, key: deriveProjectKey(r.name) })),
  };
}

describe('projectRepoDir', () => {
  it('returns the control root when the card names no mapped project', () => {
    expect(projectRepoDir(card('nope'), DEFAULT_CONFIG, CONTROL, HOME)).toBe(CONTROL);
  });

  it('uses an absolute project_repos path as-is', () => {
    const cfg = config([{ name: 'shopify', path: '/abs/automatos-shopify' }]);
    expect(projectRepoDir(card('shopify'), cfg, CONTROL, HOME)).toBe('/abs/automatos-shopify');
  });

  it('expands a leading ~ against home', () => {
    const cfg = config([{ name: 'shopify', path: '~/dev/automatos-shopify' }]);
    expect(projectRepoDir(card('shopify'), cfg, CONTROL, HOME)).toBe('/Users/dev/dev/automatos-shopify');
  });

  it('resolves a relative path against the control root', () => {
    const cfg = config([{ name: 'sibling', path: '../automatos-shopify' }]);
    expect(projectRepoDir(card('sibling'), cfg, CONTROL, HOME)).toBe('/Users/dev/automatos-shopify');
  });
});
