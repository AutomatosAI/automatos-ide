# 02 — Glossary

> **Status:** ✅ done · **Date:** 2026-06-06 · **Owner:** Gerard
> **Purpose:** Canonical terms. Use these exact words everywhere — docs, code, UI copy, commit messages. Drift costs the reader. If a concept isn't here, add it rather than coining a synonym.

---

## Core nouns

| Term | Definition | Do not say |
|---|---|---|
| **AUTO** | The persistent, stateful **orchestrator agent** — one per user/team. The chat counterparty; plans (PRD → tasks), spawns and watches workers, reports, escalates. Also the **isolation boundary**: your AUTO commands your workers; another team's AUTO cannot. A proper noun, a character. | "the assistant", "the bot", "supervisor" (supervisor is a role AUTO plays, not its name) |
| **Worker** | An **ephemeral** CLI coding agent (Claude/Codex/Gemini) that AUTO spawns, one per worktree. Stateless per iteration (Ralph loop): claim → build → test → review → PR → exit. | "sub-agent" (acceptable informally), "slave", "thread" |
| **Card** | A **PRD file** on the board. A card *is* a markdown file with YAML frontmatter; it is not a database row. Moving a card = `git mv`. | "ticket", "issue", "task" (a card *contains* tasks) |
| **PRD** | Product Requirements Document — the spec for a unit of work. The content of a card. Decomposed by AUTO into tasks. | "story", "spec sheet" (spec is fine as a synonym for the body) |
| **Task** | A unit produced by decomposing a PRD (`agent_role`, `parallel_group`, `dependencies[]`, `verification_criteria[]`). Many tasks per PRD. | — |
| **Control repo** | The git repo holding coordination state: `prds/`, `memory/`, `teams/`, `status/`, `config.yml`. The board *is* this repo's folders. One per team (v1). | "coordination server", "the backend" |
| **Project repo** | A normal code repo where workers actually build. Clean code; workers push branches/PRs here. Distinct from the control repo. | "target repo" (acceptable) |
| **Queue** | The ordered set of claimable cards — physically the files in `prds/inbox/`, ranked by `priority`. | "backlog" (acceptable informally; the column is `inbox`) |
| **Board** | The Kanban UI — a **live render of the queue folders**. Columns are folders. Not a database; not a separate store. | "dashboard" |
| **Worktree** | A `git worktree` — a separate working directory on its own branch, one per worker, so agents never collide in the filesystem. | "sandbox" (we don't containerize in v1), "checkout" |

## Mechanics & protocols

| Term | Definition |
|---|---|
| **Claim** | The act of a worker (or human drag) taking a card: `git mv inbox/→in-progress/`, set `owner`/`branch` in frontmatter, commit, push. |
| **Claim CAS** (compare-and-swap) | The concurrency primitive: the claim is only real if the **push succeeds**. If the remote rejects (someone else won the race), the loser `reset --hard @{u}` and tries the next card. Git's atomic ref-update is the lock; there is no lock service. |
| **Push-race** | Two agents claim the same card simultaneously; the remote accepts the first push and rejects the second. The mechanism behind Claim CAS. |
| **Ralph loop** | A worker's life, one item per invocation then exit (after snarktank/ralph): claim → worktree → implement → test → self/peer review → PR → move card to `review/` → push status → exit. The loop re-runs to claim the next card. Verification criteria live *inside* the task. |
| **Trust gate** | The rule that board **`done` is reached only from `verified`** (tests green + independent review + PR merged), never from a worker's self-report. The product's core safety mechanism. |
| **Heartbeat** | `status/<id>.json`, written by each agent every N seconds (state, current card, last-seen). The board reads these for running/waiting indicators. Replaces Canopy's tmux pane-scraping. |
| **Consolidation** | A scheduled job that branches, compacts per-agent memory notes into shared `memory/project/`, and opens a PR. "Sleep-time" reflection, git-native. |
| **LWW reconciliation** (last-write-wins) | Fallback for resolving a card's true status when it diverges across branches: trust the most recent `updated` timestamp in frontmatter, not the folder path. Borrowed from Backlog.md. |

## Orchestration concepts (from research)

| Term | Definition | Source |
|---|---|---|
| **Task Ledger** | AUTO's outer-loop state: facts, guesses, and the current plan for a PRD. A markdown file in git. | Magentic-One |
| **Progress Ledger** | AUTO's inner-loop state: per step — who acted, is it stalled, next instruction, is the request satisfied. Updated as workers PR. | Magentic-One |
| **Stall counter** | A count of non-progressing steps; when it crosses a threshold, AUTO **re-plans** (re-decomposes). How AUTO notices a spinning worker. | Magentic-One |
| **Validation contract** | A finite checklist of *testable behavioural assertions* defining "done" for a PRD, written up front and checked by an **independent validator**, not the implementer. Stored in the card. | Factory Droids |
| **Independent validator** | A reviewer agent separate from the worker that built the code — separated incentives beat self-grading. | Factory Droids |
| **Playbook** | A **fixed, deterministic DAG** of tasks — no LLM planning. Run when the steps are known. | Automatos |
| **Mission** | An **adaptive** plan where AUTO decomposes and re-plans as it goes. Run when the path is unknown. | Automatos |
| **resourceId / threadId** | Memory scoping convention: `resourceId` = persistent team/user dir; `threadId` = ephemeral per-worktree run dir. We express both as deterministic file paths. | Mastra |

## Identity & secrets

| Term | Definition |
|---|---|
| **GitHub identity = user identity** | We don't run an account system. Sign-in is VS Code's built-in `github` auth provider; who you are in git is who you are in the product. |
| **Device flow** | GitHub OAuth flow for headless CLIs (show a code, poll for a token) — how worker CLIs and `gh auth login` authenticate without a localhost redirect. |
| **SecretStorage** | VS Code's API for storing secrets in the OS keychain (`safeStorage`). Where personal BYO model keys live. Never `settings.json`, never git. |
| **SOPS + age** | The tool for **team-shared** secrets committed to git: encrypts values (keeps files diffable), supports multiple recipients, and makes onboarding/offboarding a commit (`sops updatekeys`). |
| **teams/ manifest** | A committed, human-readable file mapping members → GitHub handles. *Metadata*, not enforcement — GitHub repo permissions + CODEOWNERS are the enforcement layer. |
| **BYO-CLI / BYOK** | Bring Your Own CLI / Key. Workers run on each user's own model logins; we never proxy or meter tokens. |

## Status legend (used in the document map)

| Symbol | Meaning |
|---|---|
| ✅ | Done |
| 🔬 | Awaiting research |
| ✍️ | Drafting |
| ⬜ | Todo |

---

**Conventions reminder:** docs are `NN-title.md`; PRDs are `PRD-NN-title.md`; diagrams are Mermaid, inline with their flow. See `00-DOCUMENT-MAP.md` for the full program index.
