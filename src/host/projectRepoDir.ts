import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { Card } from '../core/cards/card';
import { Config } from '../core/config/config';
import { projectRepoPathFor } from '../core/worker/projectRepo';
import { expandHome } from './controlRepoPath';

/**
 * The absolute on-disk directory a card's work lives in.
 *
 * A card whose `project` maps to a `project_repos` entry resolves to THAT repo (`~`
 * expanded, a relative path resolved against the control root); a card with no mapped
 * project resolves to the control repo itself. Pure path math — existence is the caller's
 * to check. Single-sourced because two callers must never disagree on which repo a card
 * belongs to: launch (where to make the worktree) and review-sync (where to ask `gh`
 * about the PR). `home` is injectable so the resolution is deterministic under test.
 */
export function projectRepoDir(
  card: Card,
  config: Config,
  controlRoot: string,
  home: string = homedir(),
): string {
  const configured = projectRepoPathFor(card, config);
  return configured ? resolve(controlRoot, expandHome(configured, home)) : controlRoot;
}
