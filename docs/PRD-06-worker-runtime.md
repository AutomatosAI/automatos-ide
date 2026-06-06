# PRD-06 — Worker Runtime

> **Status:** Draft · **Date:** 2026-06-06 · **Owner:** Gerard
> **Spec:** `12-agent-runtime.md` · `25-verification-trust-gate.md` · `27-multi-repo-workspace.md` · **Maps to:** `PRD-v1` M2–M3
> **One-liner:** Ephemeral CLI workers, one per git worktree, running the Ralph loop (claim→build→test→review→PR→exit) — plus the independent validator that gates `done`.

---

## 1. Problem & goal

AUTO needs hands: processes that actually build code, in isolation, disposably. And the trust gate needs a reviewer that *isn't* the builder. This PRD delivers the worker supervisor, the worker Ralph loop, and the independent validator.

**Goal:** the supervisor spawns a worker into a fresh worktree with injected keys; the worker claims a card, builds on a branch, tests, self-reviews, opens a PR, moves the card to `review/`, and exits; an independent validator then checks the card's criteria before the card can reach `done`.

## 2. Dependencies

- **Requires:** PRD-03 (key injection), PRD-04 (board/claim moves), PRD-05 (AUTO dispatches + drives verification), PRD-02 (git identity for PRs).
- **Maps to:** PRD-v1 M2 (one worker, one PRD→PR) and M3 (≥2 concurrent, conflict-free).

## 3. Scope

**In:**
- **Worker supervisor**: worktree provisioning (`git worktree add`), terminal spawn with injected env, heartbeat-based supervision, reaping (`12` §4, `26` §6).
- **Worker Ralph loop**: claim (CAS) → worktree → implement → test → self-review → PR → `git mv` to `review/` → exit (`12` §3.1).
- **Worktree-per-worker** isolation (`27` §4).
- **Heartbeat** writes `status/<id>.json` every N s (`12` §5, `14` §3).
- **Per-agent memory** notes append (`13` §4) — write side only here.
- **Independent validator**: a reviewer agent (≠ implementer) checks `validation_criteria` per-criterion with evidence; emits ✅/❌ (`25` §4).
- BYO-CLI: pick `engine` per card; spawn the right CLI (`12` §3.3).
- Concurrency cap `max_workers`; loser-contract on lost claim (`33` §3).

**Out (deferred):**
- Container sandboxing (worktrees suffice for v1, `10` §8).
- Detached child-process workers (terminal-visible in v1 — `PRD-v1` open Q2).

## 4. User stories & acceptance criteria

**US-1 — Spawn a worker.** As AUTO, I launch a worker into isolation.
- [ ] Supervisor `git worktree add ../.worktrees/<card>-<id> -b feat/<card>` off the right project repo.
- [ ] Terminal spawned with the model key injected as `env` (PRD-03), `cwd` = the worktree.
- [ ] Correct CLI launched per `engine` (claude/codex/gemini).
- [ ] First heartbeat appears; supervisor marks the worker Running.

**US-2 — Ralph loop.** As a worker, I do one card then exit.
- [ ] Claim via CAS; on lost race, run the loser contract (reset, pull, next card) (`33` §3).
- [ ] Implement on the feature branch; run tests/build.
- [ ] Self-review against `validation_criteria` (necessary, not sufficient).
- [ ] Open a PR; `git mv` card `in-progress→review`; push; write per-agent memory notes; exit(0).

**US-3 — Isolation.** As the system, N workers never collide.
- [ ] Each worker has its own worktree + branch; no shared working directory.
- [ ] Two concurrent workers on the same repo produce independent PRs with no filesystem conflict (PRD-v1 M3).

**US-4 — Heartbeat.** As a worker, I signal liveness.
- [ ] `status/<id>.json` written every N s with `state`, `card`, `branch`, `last_seen`, `note` (`14` §3).
- [ ] Stale > 3N → supervisor/AUTO presumes dead and reaps + re-queues (`12` §8).

**US-5 — Independent validator.** As the trust gate, a *different* agent checks the work.
- [ ] On `review/`, a validator (≠ the worker, possibly a different `reviewer_engine`) is spawned on the PR + `validation_criteria`.
- [ ] Emits per-criterion pass/fail **with evidence** (the test run / line read), not "LGTM" (`25` §4).
- [ ] ✅ only if every criterion passes **and** CI is green; else ❌ with the failing criteria.
- [ ] The validator **cannot** move the card to `done` itself — it reports; AUTO + merge complete the gate (`25` §5).

**US-6 — Reap.** As the supervisor, I clean up.
- [ ] Clean exit → `git worktree prune` (branch persists until PR merge).
- [ ] Stall/crash → kill process, card re-queued by AUTO.

## 5. Implementation notes

- Workers are **stateless per iteration** — continuity is the worktree + heartbeat + memory notes + card frontmatter, all git (`12` §3.1). Kill any time; next invocation reconstructs from files.
- Workers run in **visible VS Code terminals** so humans can watch (Canopy value), but AUTO supervises via **heartbeat files**, not pane-scraping (`12` §5, `26` §6).
- Validator independence is structural: different process, judged against the explicit contract, incentive to *find* a failing criterion (`25` §4).
- The claim inside the loop is the CAS from `33`; reuse the same engine as the board drag (`23` §3).

## 6. Test plan

- [ ] Unit: supervisor builds the right `worktree add` + `env`; reap prunes on clean exit.
- [ ] Unit: validator verdict parsing (per-criterion pass/fail + evidence).
- [ ] Integration: one worker takes a card to an open PR (M2).
- [ ] Integration: two workers, same repo, concurrent → two PRs, **zero** filesystem conflict (M3).
- [ ] Integration: kill a worker mid-build → stale heartbeat → card re-queued, worktree pruned.
- [ ] Integration: validator ❌ path bounces the card (with PRD-05).

## 7. Definition of done

The supervisor spawns isolated, key-injected workers; a worker completes a card to an open PR via the Ralph loop and exits; heartbeats drive liveness + reaping; an independent validator checks each card's criteria with evidence and gates `done`; ≥2 workers run concurrently with **zero claim collisions and zero filesystem conflicts**. **Proves PRD-v1 M2 + M3 and operationalizes the trust gate.**

---

**Related:** `12-agent-runtime.md` · `25-verification-trust-gate.md` · `27-multi-repo-workspace.md` · `33-flow-claim-race.md` · `PRD-05-auto-orchestrator.md` · `PRD-03-secrets-keys.md` · `PRD-07-memory-consolidation.md`.
