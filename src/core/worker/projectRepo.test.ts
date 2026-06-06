import { describe, it, expect } from 'vitest';
import { Card } from '../cards/card';
import { Config, DEFAULT_CONFIG, ProjectRepo } from '../config/config';
import { projectRepoPathFor } from './projectRepo';

function card(project: string, over: Partial<Card> = {}): Card {
  return {
    id: 'PRD-1',
    title: 'PRD-1',
    project,
    status: 'ready',
    owner: null,
    branch: null,
    priority: 3,
    created: '2026-01-01',
    updated: null,
    engine: null,
    validationCriteria: [],
    body: '',
    ...over,
  };
}

function config(projectRepos: readonly ProjectRepo[]): Config {
  return { ...DEFAULT_CONFIG, projectRepos };
}

describe('projectRepoPathFor', () => {
  it('returns the configured path for the matching project', () => {
    const cfg = config([
      { name: 'shopify', path: '~/dev/automatos-shopify' },
      { name: 'ide', path: '/abs/automatos-ide' },
    ]);
    expect(projectRepoPathFor(card('ide'), cfg)).toBe('/abs/automatos-ide');
    expect(projectRepoPathFor(card('shopify'), cfg)).toBe('~/dev/automatos-shopify');
  });

  it('returns undefined when no entry matches (fall back to the control repo)', () => {
    const cfg = config([{ name: 'ide', path: '/abs/automatos-ide' }]);
    expect(projectRepoPathFor(card('nope'), cfg)).toBeUndefined();
  });

  it('returns undefined when project_repos is empty', () => {
    expect(projectRepoPathFor(card('ide'), DEFAULT_CONFIG)).toBeUndefined();
  });

  it('treats a blank or whitespace project as no target', () => {
    const cfg = config([{ name: 'ide', path: '/abs/automatos-ide' }]);
    expect(projectRepoPathFor(card(''), cfg)).toBeUndefined();
    expect(projectRepoPathFor(card('   '), cfg)).toBeUndefined();
  });

  it('matches on the trimmed project name', () => {
    const cfg = config([{ name: 'ide', path: '/abs/automatos-ide' }]);
    expect(projectRepoPathFor(card('  ide  '), cfg)).toBe('/abs/automatos-ide');
  });

  it('returns the first matching entry when names collide', () => {
    const cfg = config([
      { name: 'dup', path: '/first' },
      { name: 'dup', path: '/second' },
    ]);
    expect(projectRepoPathFor(card('dup'), cfg)).toBe('/first');
  });
});
