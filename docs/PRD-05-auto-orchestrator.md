# PRD-05 — AUTO Orchestrator

> **Status:** Draft · **Date:** 2026-06-06 · **Owner:** Gerard
> **Spec:** `12-agent-runtime.md` · `24-prd-authoring-and-decomposition.md` · **Flow:** `31-flow-auto-loop.md`
> **One-liner:** The persistent, stateful brain — one per user/team — that decomposes PRDs into tasks, claims and dispatches work, watches heartbeats, detects stalls, and escalates, all backed by markdown ledgers in git.

---

## 1. Problem & goal

Hand-spawned agents have no brain coordinating them. AUTO is that brain: it turns a card into a plan, dispatches workers, notices when one is stuck, re-plans, and asks the human when it can't proceed — surviving its own restarts because its state is git, not RAM.

**Goal:** AUTO picks a ready card, decomposes it (Mission) or loads a recipe (Playbook), claims it, spawns workers, tracks per-step progress, re-plans on stall, and moves the card to `done` only through the trust gate.

## 2. Dependencies

- **Requires:** PRD-04 (board/claim moves), PRD-06 (workers to dispatch to), PRD-02 (acts as the user).
- **Feeds:** PRD-06 (validator gating) and PRD-07 (memory grounding/consolidation trigger).

## 3. Scope

**In:**
- The orchestration loop: Idle → Planning → Dispatching → Watching → {Replanning | Verifying | Escalating} → Done (`31` §1).
- **Dual ledgers** in git: `ledgers/<card>/task-ledger.md` + `progress-ledger.md` (`12` §2.1, `14` §4).
- **Decomposition** (Mission): the planner prompt → Task Ledger with coverage assertion (`24` §4).
- **Playbook** short-circuit: load a fixed DAG when `playbook:` is set (`24` §5).
- **Stall counter**: detect non-progress from heartbeats + git → re-plan (`12` §2.3, `31` §3).
- **Escalation** to chat (`@team`) after K fruitless re-plans (`31` §4).
- Restart resilience: rebuild ledgers from git on restart (`31` §6).
- Concurrency across cards, capped by `config.max_workers` (`31` §5).

**Out (deferred):**
- Cross-team AUTO coordination; AUTO as a distinct GitHub identity (`51`).
- Advanced planning (cost models, learned playbooks).

## 4. User stories & acceptance criteria

**US-1 — Decompose a PRD (Mission).** As AUTO, I turn a card into runnable tasks.
- [ ] Reads card requirements + `validation_criteria`; grounds in `memory/project/` (grep) before guessing.
- [ ] Writes a Task Ledger (facts / guesses / plan) with per-task `role`, `parallel_group`, `depends_on`, `verification_criteria`.
- [ ] **Coverage assertion**: every card criterion maps to ≥1 task's `verification_criteria`, else re-plan/escalate (`24` §4).
- [ ] Refuses to plan a card with empty `validation_criteria` (`24` §2.1).

**US-2 — Playbook.** As AUTO, a card with a named recipe skips LLM planning.
- [ ] `playbook: <name>` loads `playbooks/<name>` and instantiates a fixed DAG (deterministic).
- [ ] A stalled Playbook **escalates** (doesn't re-plan) (`31` §7).

**US-3 — Dispatch & watch.** As AUTO, I spawn workers and track them.
- [ ] Claims the card (CAS), spawns workers (via PRD-06 supervisor) for ready tasks, respecting `max_workers`.
- [ ] Updates the Progress Ledger on each worker report (heartbeat/PR).
- [ ] Tasks in the same `parallel_group` run concurrently; dependents wait on `depends_on`.

**US-4 — Detect stalls.** As AUTO, I notice a spinning or dead worker.
- [ ] No progress (no new commit/state-change/PR) across the threshold → increment stall, then re-plan that step (`12` §2.3).
- [ ] Stale heartbeat (> 3N) → presume dead → re-queue the card (`12` §8).

**US-5 — Verify, don't trust.** As AUTO, a card reaches `done` only verified.
- [ ] On worker→`review/`, AUTO enters Verifying: spawns the validator (PRD-06) + checks CI.
- [ ] `review→done` move performed **only** by the verification step (never a worker), all three conditions met (`25` §2).
- [ ] On validator ❌, bounce `review→in-progress` and re-plan with the failure evidence (`25` §6).

**US-6 — Escalate.** As AUTO, when stuck I ask the human clearly.
- [ ] After K re-plans without progress, post an `@team` chat message with context (`31` §4).
- [ ] The human's reply becomes a Task Ledger fact; the loop resumes.

**US-7 — Survive restart.** As AUTO, a crash loses nothing.
- [ ] On restart, rebuild Task/Progress ledgers from `ledgers/*/`, read heartbeats + card states, resume Watching (`31` §6).

## 5. Implementation notes

- AUTO runs in the **extension host**, stateful, but its state is **files in git** (ledgers) — that's what makes restart-resilience + auditability free (`12` §1, `31` §6).
- Planner prompt + JSON shape adapted from Automatos `planner.py` (`PRD-v1` §3.1) — model-agnostic task fields.
- AUTO talks to workers **only through files** (cards, ledgers, heartbeats, memory) — no RPC (`12` §6).
- Persona/voice from `AUTO.md` (rewrite its architecture section to git-native — outstanding, see below).
- The loop is the Magentic-One dual-ledger pattern; the *intelligence* is the two re-plan transitions (`31` §1).

## 6. Test plan

- [ ] Unit: decomposition output parses to a valid Task Ledger; coverage assertion catches an uncovered criterion.
- [ ] Unit: stall counter increments on no-progress, resets on a new commit; re-queue on stale heartbeat.
- [ ] Integration: a 3-task card (2 parallel + 1 dependent) dispatches correctly; dependent waits.
- [ ] Integration: validator ❌ bounces the card and triggers a targeted re-plan.
- [ ] Integration: kill + restart AUTO mid-flight → ledgers rebuilt, Watching resumes.
- [ ] Manual: a deliberately-vague card triggers escalation to chat after K re-plans.

## 7. Definition of done

AUTO decomposes (or playbooks) a card, dispatches workers within the cap, tracks progress via git-backed ledgers, re-plans on stall, escalates when stuck, moves cards to `done` **only** through the trust gate, and resumes cleanly after a restart. **This is the brain that makes the kernel a team system rather than a pool of agents.**

> **Outstanding (carry-over):** `AUTO.md`'s "My Architecture Knowledge" section still describes Automatos's cloud body (Redis/S3/FastAPI). Rewrite to git-native reality (control repo, worktrees, extension) while keeping voice/authority/routing/rhythm — tracked here as part of AUTO's persona setup.

---

**Related:** `12-agent-runtime.md` · `24-prd-authoring-and-decomposition.md` · `31-flow-auto-loop.md` · `25-verification-trust-gate.md` · `PRD-06-worker-runtime.md` · `PRD-07-memory-consolidation.md` · `AUTO.md`.
