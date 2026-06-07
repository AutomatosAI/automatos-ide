import { Card } from '../cards/card';
import { Config } from '../config/config';

/**
 * Which repo a worker should build in for this card.
 *
 * A card names its target with `project` (14 §2); the control repo maps that name to a
 * path with `project_repos` (14 §8). This is the pure lookup at the heart of multi-repo
 * launch: it answers "what path was configured for this card's project", or undefined
 * when nothing matches — the signal to fall back to the control repo itself, so a board
 * that drives a single repo (or a card whose project IS the control repo) still works.
 *
 * Filesystem concerns (home expansion, resolving a relative path against the control
 * root, existence) are the host's job — this stays a vscode-free, string-only lookup so
 * it is trivially testable. The first matching entry wins.
 */
export function projectRepoPathFor(card: Card, config: Config): string | undefined {
  const target = card.project.trim();
  if (!target) {
    return undefined;
  }
  return config.projectRepos.find((repo) => repo.name === target)?.path;
}
