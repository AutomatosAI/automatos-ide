# PRD-07 — Memory & Consolidation

> **Status:** Draft · **Date:** 2026-06-06 · **Owner:** Gerard
> **Spec:** `13-memory-architecture.md` · **Maps to:** `PRD-v1` M5
> **One-liner:** Per-agent scratch notes that never conflict, a grep-based recall path, and a consolidation job that distills scratch into reviewed, durable team knowledge via a PR.

---

## 1. Problem & goal

Eight amnesiac agents re-learn the codebase every time. Memory turns them into one learning team — but it must be conflict-free (many writers) and high-quality (no garbage in the shared brain), with **zero memory infrastructure** (no vector DB, no server).

**Goal:** workers append learnings to their own notes file; a new worker recalls relevant prior knowledge by grep; a scheduled consolidation job compacts scratch into `memory/project/` via a reviewed PR; resolve-on-read keeps it conflict-free.

## 2. Dependencies

- **Requires:** PRD-06 (workers that write notes), PRD-05 (AUTO triggers consolidation; grounds decomposition in memory), the trust gate / PR review (PRD-06 validator or a human) for consolidation PRs.
- **Maps to:** PRD-v1 M5 (consolidation job + scale).

## 3. Scope

**In:**
- **Two scopes** as file paths: `memory/project/` (resourceId, shared) + `memory/agents/<id>/` (threadId, scratch) (`13` §2).
- **Per-agent append-only notes** with Letta-style `desc:` + timestamp blocks (`13` §4).
- **Grep recall**: seed a new worker's context from `memory/project/` (+ recent unconsolidated notes) by lexical search on card terms (`13` §6).
- **Consolidation job**: branch → cluster/dedupe/LWW-resolve scratch → write `project/*.md` → open a PR (`13` §5).
- **Mem0 additive rule**: append, resolve conflicts on read by newer `updated` (`13` §5.2).
- Trigger: schedule / per-N-cards / manual (`13` §5.3, `config.memory`).

**Out (deferred):**
- Vector/embedding store, dedicated memory DB, importance scoring, cross-agent memory RPC (`13` §8).

## 4. User stories & acceptance criteria

**US-1 — Conflict-free scratch.** As a worker, I record learnings without ever conflicting.
- [ ] I append only to `memory/agents/<id>/notes.md` (my own dir); no other writer touches it (`13` §3).
- [ ] Each block has a timestamp + one-line `desc:` (Letta-style); appends are never rewrites (`13` §4).
- [ ] Two workers writing memory simultaneously commit to disjoint paths → **zero** merge conflict.

**US-2 — Recall.** As a new worker, I start informed by prior knowledge.
- [ ] On a new card, grep `memory/project/` for card terms (title, repo, key nouns) + read `repos/<repo>.md`.
- [ ] Optionally scan recent `agents/*/notes.md` not yet consolidated.
- [ ] Matching blocks seed the worker's context (`13` §6).

**US-3 — Consolidation.** As the team, scratch becomes durable knowledge — reviewed.
- [ ] The job reads per-agent notes since the last run; clusters by topic; drops dupes; resolves conflicts by newer `updated` (LWW).
- [ ] Writes compacted updates to `project/*.md` **on a branch** and opens a PR (never a live write to shared memory) (`13` §5.1).
- [ ] On merge, the knowledge is durable; the job may prune consolidated scratch.

**US-4 — Additive, non-destructive.** As the system, I never erase a still-true fact on write.
- [ ] Conflicting notes are both kept with timestamps; the newer wins **at read time**, not by destructive overwrite (`13` §5.2).

**US-5 — Trigger.** As AUTO/human, I control when consolidation runs.
- [ ] Runs on schedule (`config.memory.consolidate`), after N completed cards, or via `automatos.consolidateMemory`.
- [ ] Runs as a normal worker-like job (branch, write, PR, exit) — no daemon (`13` §5.3).

## 5. Implementation notes

- This is principle #5 for memory: **per-agent files, never a shared `memory.md`** — that's what makes concurrent memory conflict-free (`13` §3). Do **not** introduce a single shared append target.
- Recall is deliberately **grep, not embeddings** — one team's corpus is small; lexical search is instant, explainable, zero infra (`13` §6, §8). An index is a post-v1 *if-needed*, never preemptive.
- Shared memory passes through the **same review gate** as code (`25` §1) — wrong team-knowledge misleads every future agent (`13` §5.1).
- Memory block format + paths: `14` §5.

## 6. Test plan

- [ ] Unit: append preserves prior blocks; block has `desc:` + timestamp.
- [ ] Unit: LWW resolution picks newer `updated` among conflicting notes.
- [ ] Integration: two workers append concurrently → disjoint files, no conflict.
- [ ] Integration: consolidation produces a PR to `project/`; merge makes recall return the consolidated fact.
- [ ] Integration: grep recall returns relevant blocks for a card's terms.
- [ ] Manual: confirm no vector store / external memory service is introduced.

## 7. Definition of done

Workers append conflict-free per-agent notes; a new worker recalls relevant knowledge by grep; the consolidation job compacts scratch into `memory/project/` via a reviewed PR with additive/LWW conflict handling; **no memory infrastructure beyond git + grep exists**. **Proves PRD-v1 M5's memory half and the "8 amnesiac agents → one learning team" thesis.**

---

**Related:** `13-memory-architecture.md` · `25-verification-trust-gate.md` (the PR gate for shared memory) · `24-prd-authoring-and-decomposition.md` (decomposition grounds in memory) · `14-data-model.md` §5 · `PRD-05-auto-orchestrator.md` · `PRD-06-worker-runtime.md`.
