# 00 — Vision & Positioning

> **Status:** ✅ done · **Date:** 2026-06-06 · **Owner:** Gerard
> **Purpose:** The north star. Who this is for, what it is, why it's different, and what we refuse to build. Everything downstream — architecture, subsystems, PRDs — must serve this doc.

---

## 1. The one-liner

**A VS Code extension that turns the editor into a git-native, multi-agent team coding cockpit:** teams write PRDs, drop them on a Kanban board that is a live render of a git work-queue, and a persistent orchestrator (AUTO) per user claims cards, spawns worker agents across git worktrees, builds/tests/reviews, and opens PRs — all coordinated through git, with no server and no per-token markup.

## 2. The problem (lived, not hypothetical)

Today the workflow is: 5 projects, ~8 Claude agents spawned by hand in terminals, PRDs and progress tracked in your head, no shared memory between agents, no way for a teammate to see or steer the work. **Coordination is manual and does not scale past one person.** Adding a developer makes it *worse* — there is no shared board, no shared memory, no claim protocol, no chat. The bottleneck is not the agents' coding ability; it is the absence of a **coordination substrate**.

Two existing answers, both wrong for this:
- **Local worktree tools** (Conductor, Vibe Kanban, Claude Squad) nail single-user parallelism but have **no team layer** — and the best of them are being abandoned in 2026.
- **Cloud platforms** (Devin, Factory, Cursor) have team features but are **server-bound and metered** — they own your state and mark up every token.

## 3. The thesis

> **The editor is commodity; the coordination substrate is the product.** VS Code already gives us Monaco, the file tree, the integrated terminal, multi-root workspaces, and SCM for free. We should spend **zero** effort rebuilding those and **all** of it on the things that don't exist: a git-native shared work-queue, a persistent orchestrator, shared git-native memory, and team chat.

And the load-bearing technical bet:

> **Git is a sufficient backend for a remote team.** A board is folders. A claim is `git mv` + push (an optimistic compare-and-swap — the loser of a push race retries). Memory is per-agent files plus a consolidation job. Chat is one file per message (maildir). Status is a heartbeat file. History is free — every change is a commit. **No server, no database, no real-time backend.** Eventual consistency over `git pull` is good enough for work that takes minutes, not milliseconds.

If that bet holds, a fully remote team coordinates entirely through repositories they already own — auditable, forkable, offline-tolerant, and free of any control plane we'd have to run.

## 4. Who it's for

- **Primary:** a solo builder or a small (2–8 person) remote team running multiple AI coding agents across several repos, who have outgrown hand-spawned terminals and want a shared board + memory + chat without adopting a metered cloud platform.
- **Secondary:** teams who already live in git/GitHub and want agent work to be **just more git** — reviewable in PRs, governed by repo permissions and CODEOWNERS, with no new system of record.
- **Not for (v1):** large enterprises needing SSO/RBAC beyond GitHub permissions, regulated shops needing on-prem audit beyond git history, or anyone wanting a zero-setup hosted SaaS. Those are post-kernel questions.

## 5. What it is — and is not

| It IS | It is NOT |
|---|---|
| A VS Code **extension** | A new editor / fork of VS Code / Theia shell (v1) |
| A **coordination substrate** (board, queue, orchestrator, memory, chat) | An autocomplete or single-agent chat tool |
| **Git-native** (files in repos are the only state) | A server/DB-backed app |
| **BYO-CLI** (your Claude/Codex/Gemini logins) | A metered, token-marked-up cloud relay |
| **Team-scale** (shared queue, multiple humans claim work) | A single-user worktree manager |
| **Orchestrated** (AUTO plans, dispatches, watches, escalates) | A flat pool of agents with no brain |

## 6. The differentiation thesis (the wedge)

The market has a hole exactly where we sit: **team-scale coordination, with no server, over git, on your own CLIs.** (Full evidence in `01-competitive-landscape.md`.) Five reasons this is defensible:

1. **Git-as-database at the team layer is uncontested.** Every incumbent runs a control plane; we run none.
2. **BYO-CLI economics.** No per-token markup, model-agnostic from day one.
3. **AUTO is the missing persistent team brain** — a per-user orchestrator that owns the queue, isolated per team.
4. **VS Code-native is empty space** — rivals are CLI/TUI or standalone Mac GUIs.
5. **Timing** — the best-loved competitors (Vibe Kanban, Crystal, Terragon) died or are dying in 2026, orphaning a proven UX.

## 7. Principles (non-negotiable)

1. **Git is the only backend.** If a feature needs a server or DB, redesign it or defer it.
2. **Reuse VS Code; build only what's ours.** Editor primitives are free. The board, orchestrator, memory, and chat are the product.
3. **Kernel before cathedral.** v1 = ≤5 repos, ≤4 agents, 1 team. Prove the loop, then scale. (The temptation is the "100-doc, 20-repo" vision — earn it.)
4. **Autonomy is gated by verification.** No PR without tests + an independent review step. **The trust gate is the product, not throughput.** Board `done` comes only from *verified*, never from an agent saying "complete."
5. **Many writers, never one file.** Every concurrency problem (claim, memory, chat) is solved by *not sharing a single file* — per-agent files, maildir messages, folder-as-column moves.
6. **Don't out-build the single-agent bar — adopt it.** Steal the verification patterns (validation contracts, independent validators); spend our originality on the team/git-native substrate.

## 8. What success looks like

**v1 is proven when** ≥2 agents run concurrently across ≥2 repos and complete ≥3 PRDs into open PRs **with zero claim collisions and zero memory merge conflicts.** That is the kernel. Everything else — more repos, more agents, more teams, richer chat — is scale on top of a loop that already works. (Milestones in `50-roadmap.md`.)

## 9. North-star scenario (the demo that sells it)

> Two teammates in different cities open the same multi-root workspace. One writes three PRD cards and drops them in `inbox/`. Each person's AUTO wakes, claims the highest-priority card it can (the push-race decides who gets which), spins a worker in a fresh worktree, and the cards slide `inbox → in-progress → review` on both their boards within seconds of a `git pull`. Workers open PRs; cards reach `done` only after CI is green and an independent reviewer agent signs off. The whole time, the two humans are chatting in a side panel — and **nothing but a git remote sits between them.**

---

**Related:** `01-competitive-landscape.md` (evidence for the wedge) · `PRD-v1.md` (the buildable kernel) · `10-system-architecture.md` (how it's built) · `02-glossary.md` (terms used everywhere).
