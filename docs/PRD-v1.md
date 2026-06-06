# PRD v1 — Team Agent IDE (working title)

> **Status:** Draft · **Date:** 2026-06-06 · **Owner:** Gerard
> **One-liner:** A VS Code extension that turns VS Code into a multi-repo, multi-agent team coding cockpit — a team of CLI agents claim PRDs from a git-backed queue, build/test/review, and open PRs, all coordinated through git with a live Kanban board and team chat.

---

## 1. Problem

Today: 5 projects, ~8 Claude agents spawned by hand in terminals, PRDs and progress tracked in your head, no shared memory between agents, no way for teammates to see or steer the work. Coordination is manual and doesn't scale past one person. Adding developers makes it worse, not better.

## 2. Goal & v1 success criteria

From inside VS Code, a user can:
1. Open a **multi-repo workspace** (control repo + project repos).
2. Write a **PRD card** and drop it in the queue.
3. Have **N CLI agents auto-claim** cards, build on an isolated worktree, run tests, self-review, and **open a PR** — unattended.
4. Watch progress on a **Kanban board** that is a live render of the git queue.
5. **Chat** with teammates in a panel.

**v1 is proven when:** ≥2 agents run concurrently across ≥2 repos and complete ≥3 PRDs into open PRs **with zero claim collisions and zero memory merge conflicts.** That's the kernel. Everything else is scale.

## 3. Principles

- **Git is the only backend.** No server, no DB. Board, queue, memory, chat, status — all files in git.
- **Reuse VS Code, build only what's ours.** Editor, file-tree, terminal, multi-root, LSP = free. We build the board, supervisor, memory, chat.
- **Kernel before cathedral.** v1 = ≤5 repos, ≤4 agents, 1 team. Prove the loop, then scale.
- **Autonomy is gated by verification.** No PR without tests + a review step. The trust gate is the product, not throughput.
- **Many writers, never one file.** Every concurrency problem (claim, memory, chat) is solved by not sharing a single file.

## 3.1 Lifted from Automatos (concrete)

Automatos is a Python/FastAPI **cloud** app; we do **not** port its runtime (Postgres schema, 103 routers, Composio, the DB-poll coordinator). We lift **concepts, prompts, and data-shapes**:

| Lift | Source (in `automatos-ai/`) | Use here |
|---|---|---|
| **AUTO's persona** | `orchestrator/core/seeds/auto-cto-custom-soul.txt` → `AUTO.md` | Voice, **authority model** (do-directly vs. ask-first), **routing rules**, operating rhythm. Keep all of it; **rewrite the "My Architecture Knowledge" section** — it describes Automatos's cloud body (Redis / S3 Vectors / Universal Router), not our git-native one. |
| **Decomposition prompt + JSON schema** | `modules/coordination/planner.py:670,776` | AUTO's PRD→tasks planner (model-agnostic: `agent_role`, `parallel_group`, `dependencies[]`, `verification_criteria[]`). |
| **Task state machine** | `core/models/orchestration_enums.py` | Card lifecycle. |
| **Board field shapes** | `BoardTask` / `OrchestrationTask` | Card frontmatter + columns. |
| **Playbook vs Mission** | (project memory) | Playbook = fixed DAG, no LLM; Mission = AUTO plans adaptively. |

> **The trust gate, learned the hard way — and free:** Automatos enforces board **`done` only from `verified`**, never from an agent saying "complete." AUTO already believes this (soul doc: *"Test actual completion status, not assumptions. document_id != None doesn't mean it processed"*). Bake it into the lifecycle: a worker opening a PR moves its card to `review/`; the card reaches `done/` **only** when the PR is merged and checks are green. The gate is the lifecycle, not a worker's self-report.

## 4. Architecture (VS Code extension)

```
┌─ VS CODE (host) ──────────────────────────────────────┐
│  multi-root workspace · Monaco · file tree · terminal │  [free]
├─ EXTENSION ───────────────────────────────────────────┤
│  • Kanban webview        • Chat webview                │
│  • AUTO — orchestrator agent (stateful brain)          │
│  • Git ops + file-system watchers (board/chat liveness)│
├─ COORDINATION ── control repo (git) ──────────────────┤
│  prds/{inbox,in-progress,review,done}/                 │
│  memory/{project, agents/<id>}/                        │
│  teams/<team>/chat/   status/<id>.json   config.yml    │
├─ AGENT RUNTIME ───────────────────────────────────────┤
│  worktree-per-agent · claude|codex|gemini CLI in a     │
│  VS Code terminal · Ralph loop                         │
└────────────────────────────────────────────────────────┘
```

VS Code APIs used: `workspace` (multi-root folders), `window.createTerminal` (spawn agents), `FileSystemWatcher` (board/chat refresh), `Webview` (board + chat UI), `scm`/git.

## 5. Core mechanics

### 5.0 AUTO + workers (two-tier agents)
**AUTO** — one persistent orchestrator per user/team; stateful (its own git-backed memory). AUTO is the user's **chat counterparty**: it reads the board, plans (PRD → tasks), spawns workers, watches their status heartbeats, reports progress, and escalates blockers. AUTO is also the **isolation boundary** — your AUTO commands your workers; another team's AUTO cannot. Persona lifted from Automatos (see §3.1).

**Workers** — many, ephemeral, spawned by AUTO; stateless per iteration (Ralph); one per worktree. Claim → build → test → review → PR → exit, then AUTO respawns to claim the next card.

### 5.1 Control-repo layout
```
control-repo/
  prds/
    inbox/          # ready to claim   (status: ready)
    in-progress/    # claimed          (owner + branch in frontmatter)
    review/         # PR open
    done/           # merged
  memory/
    project/        # shared, consolidated knowledge
    agents/<id>.md  # per-agent scratch — append-only, conflict-free
  teams/<team>/
    members.md
    chat/           # maildir: one file per message
  status/<id>.json  # heartbeat: state, current card, last-seen
  config.yml        # repos, agents, models, teams
```

### 5.2 PRD card
```yaml
---
id: PRD-0007
title: Add rate limiting to ingest API
project: ingest-service      # which repo
status: ready                # ready | in-progress | review | done
owner: null                  # agent id once claimed
branch: null
priority: 2
created: 2026-06-06
---
## Goal
## Acceptance criteria
- [ ] ...
## Context / constraints
```

### 5.3 Claim protocol (optimistic CAS via git)
```
loop:
  git pull --rebase
  card = highest-priority file in prds/inbox/
  git mv prds/inbox/<card> prds/in-progress/<card>
  set frontmatter: owner=<id>, branch=<id>/<card-id>
  git commit -m "claim <card-id>"
  git push
  if push rejected:   git reset --hard @{u}; continue   # someone won — try next
  else:               proceed (5.4)
```
One winner per card. No lock service.

### 5.4 Ralph loop (an agent's life)
```
claim → git worktree add (branch in the project repo) → implement →
write & run tests → self-review (or spawn a reviewer agent) →
open PR → git mv card → review/ → push status → exit
AUTO reruns the loop → claim next
```

### 5.5 Memory (Letta-derived, git-native)
- Each memory file carries a `description` ("what goes here") so agents know where to write.
- Agents append to **their own** `memory/agents/<id>.md` — never the shared file (no conflicts).
- A scheduled **consolidation agent** branches, compacts agent notes into `memory/project/`, opens a PR. History is free: every edit is a commit.

### 5.6 Board = render of the queue
Columns = `inbox / in-progress / review / done`. A card = a PRD file. Dragging a card = `git mv` + push (= the claim CAS for humans). `FileSystemWatcher` + a background `git pull` keep it live.

### 5.7 Chat = maildir
Each message = `teams/<team>/chat/<ts>-<author>.md`. Send = write + commit + push. Receive = background `git pull` (every few s) + watcher renders new files. Conflict-free (unique names). Latency ~seconds; real-time transport is a later add.

### 5.8 Status heartbeat
Each agent writes `status/<id>.json` every N seconds (state, current card, last-seen). Board reads these for running/waiting indicators. (Replaces Canopy's tmux pane-scraping with something explicit.)

## 6. Scope

**In (v1):** multi-root workspace; control-repo convention; PRD card format; Kanban webview with drag=claim; agent supervisor (spawn, worktree, Ralph loop, status); git-native per-agent memory; team chat panel (maildir); the claim CAS.

**Out (deferred):** Theia / own-branded shell; real-time chat transport; agent→human question inbox; cross-team RBAC beyond repo permissions; browser/cloud mode; semantic/vector memory search; the large "100-docs" planning suite; >1 team at scale.

## 7. Milestones (kernel-first)

| # | Proves | Deliverable |
|---|--------|-------------|
| **M0** | The board renders the substrate | Control-repo convention + card format + read-only Kanban webview |
| **M1** | The claim CAS works | Drag card = `git mv` + push, with reject/retry |
| **M2** | The loop works end-to-end | Supervisor spawns 1 agent, Ralph loop, 1 PRD → PR |
| **M3** | Concurrency is safe | ≥2 agents, conflict-free claims + per-agent memory |
| **M4** | Comms works | Maildir chat panel |
| **M5** | It scales a little | 5 repos, status heartbeats, consolidation job |

## 8. Open questions

1. **Agent self-review vs. reviewer agent** in the loop — same model self-critiques, or a dedicated reviewer agent before PR? (Affects trust-gate strength.)
2. **Where do agents run** — one VS Code terminal each (visible, simple) or detached child processes the extension manages (scales past terminal count)?
3. **Control repo per team or one shared** — one team in v1 sidesteps this, but the boundary choice shapes the multi-team story.
4. **Product / repo name** (currently `automatos-ide`, placeholder).
