// Scaffold a throwaway, git-backed control repo for live-testing the extension (F5).
//
// Creates `.dev-workspace/` (the control repo the Extension Development Host opens) and
// `.dev-workspace-remote.git/` (a local bare remote), both gitignored. A real remote
// means the git-native paths — drag = `git mv` + push, chat send, memory consolidation —
// actually exercise push/rebase, not just file reads. Re-run any time to reset state.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ws = join(root, '.dev-workspace');
const remote = join(root, '.dev-workspace-remote.git');

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

function write(rel, content) {
  const full = join(ws, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function card({ id, title, status, owner = null, branch = null, priority, created, engine = null, criteria = [], body }) {
  return [
    '---',
    `id: ${id}`,
    `title: ${title}`,
    'project: automatos-ide',
    `status: ${status}`,
    `owner: ${owner ?? 'null'}`,
    `branch: ${branch ?? 'null'}`,
    `priority: ${priority}`,
    `created: ${created}`,
    'updated: null',
    `engine: ${engine ?? 'null'}`,
    'validation_criteria:',
    ...criteria.map((c) => `  - ${c}`),
    '---',
    body,
    '',
  ].join('\n');
}

function note({ agent, at, tags, text }) {
  const content = ['---', `agent: ${agent}`, `at: ${at}`, 'tags:', ...tags.map((t) => `  - ${t}`), '---', text, ''].join('\n');
  return [`memory/${agent}/${at.replace(/[:.]/g, '-')}.md`, content];
}

function message({ from, to, at, text }) {
  const id = `${at.replace(/[:.]/g, '-')}-${from}-seed`;
  const content = ['---', `id: ${id}`, `from: ${from}`, `to: ${to ?? 'null'}`, `at: ${at}`, '---', text, ''].join('\n');
  return [`chat/${id}.md`, content];
}

// --- reset -----------------------------------------------------------------
rmSync(ws, { recursive: true, force: true });
rmSync(remote, { recursive: true, force: true });
mkdirSync(ws, { recursive: true });

// --- config ----------------------------------------------------------------
write(
  'config.yml',
  [
    'project_repos: []',
    'agents:',
    '  max_workers: 4',
    '  default_engine: claude',
    'sync:',
    '  pull_interval_seconds: 5',
    '  heartbeat_interval_seconds: 10',
    'verification:',
    '  require_validator: true',
    '  require_ci: true',
    'memory:',
    '  consolidate_every_cards: 20',
    'secrets:',
    '  sops_recipients: []',
    '',
  ].join('\n'),
);

// --- board cards (one per column) ------------------------------------------
const cards = [
  ['prds/inbox/PRD-0001.md', card({ id: 'PRD-0001', title: 'Wire the settings panel', status: 'ready', priority: 1, created: '2026-06-01', criteria: ['Settings persist across reloads', 'Invalid input shows an inline error'], body: '## PRD-0001 — Wire the settings panel\n\nRead and write `config.yml` from a form.' })],
  ['prds/inbox/PRD-0002.md', card({ id: 'PRD-0002', title: 'Add a status bar item', status: 'ready', priority: 2, created: '2026-06-02', criteria: ['Shows active worker count'], body: '## PRD-0002 — Status bar\n\nSurface live worker count.' })],
  ['prds/in-progress/PRD-0003.md', card({ id: 'PRD-0003', title: 'Heartbeat staleness banner', status: 'in-progress', owner: 'gerard', branch: 'feat/prd-0003', engine: 'claude', priority: 1, created: '2026-06-01', criteria: ['Banner when a heartbeat is older than 30s'], body: '## PRD-0003 — Staleness banner\n\nWarn when an agent goes quiet.' })],
  ['prds/review/PRD-0004.md', card({ id: 'PRD-0004', title: 'Quick-claim from the inbox', status: 'review', owner: 'gerard', branch: 'feat/prd-0004', engine: 'claude', priority: 2, created: '2026-06-03', criteria: ['Claim moves the card to in-progress'], body: '## PRD-0004 — Quick-claim\n\nClaim the top ready card in one click.' })],
  ['prds/done/PRD-0005.md', card({ id: 'PRD-0005', title: 'Bundle vendor scripts locally', status: 'done', owner: 'auto', branch: 'feat/prd-0005', engine: 'claude', priority: 3, created: '2026-05-28', criteria: ['No external script-src'], body: '## PRD-0005 — Local vendor scripts\n\nShipped.' })],
];

// --- memory notes (auto has enough cold notes to consolidate) --------------
const autoNotes = Array.from({ length: 8 }, (_, i) =>
  note({ agent: 'auto', at: `2026-06-0${i + 1}T00:00:00Z`, tags: i % 2 === 0 ? ['routing'] : ['board', 'routing'], text: `Day ${i + 1}: routed stuck cards through review first; watched the claim queue settle.` }),
);
const gerardNotes = [5, 6, 7].map((d) =>
  note({ agent: 'gerard', at: `2026-06-0${d}T12:00:00Z`, tags: ['ui'], text: `Tuned the board column widths on day ${d}.` }),
);

// --- chat ------------------------------------------------------------------
const chat = [
  message({ from: 'auto', to: null, at: '2026-06-06T09:00:00Z', text: "Morning team — board's seeded and ready. Sure look it, let's get moving." }),
  message({ from: 'gerard', to: null, at: '2026-06-06T09:05:00Z', text: 'Deadly. Pulling PRD-0003 now.' }),
  message({ from: 'auto', to: 'gerard', at: '2026-06-06T09:06:00Z', text: 'Grand. Shout if the heartbeat banner gives you grief.' }),
];

for (const [rel, content] of [...cards, ...autoNotes, ...gerardNotes, ...chat]) {
  write(rel, content);
}

// --- git: working repo + local bare remote ---------------------------------
git(ws, 'init', '-b', 'main');
git(ws, 'add', '-A');
git(ws, '-c', 'user.email=dev@automatos.local', '-c', 'user.name=Automatos Dev', 'commit', '-m', 'seed dev control repo');
execFileSync('git', ['init', '--bare', '-b', 'main', remote], { stdio: 'pipe' });
git(ws, 'remote', 'add', 'origin', remote);
git(ws, 'push', '-u', 'origin', 'main');

console.log(`Seeded dev control repo:\n  workspace: ${ws}\n  remote:    ${remote}\nPress F5 (Run Extension) and run "Automatos: Open Board".`);
