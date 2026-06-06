# 01 — Competitive Landscape & Prior Art

> **Status:** ✅ done · **Date:** 2026-06-06 · **Owner:** Gerard
> **Purpose:** Map the field we're entering, prove the wedge is real, and extract the patterns worth stealing. Synthesised from five parallel research streams (direct competitors, autonomous SWE platforms, spec-driven/git-native task systems, multi-agent frameworks & memory, auth/secrets). Every claim is cited; where a fact could not be verified it is marked.

---

## 0. TL;DR

The market has split into two camps, and **neither owns the space between them**:

1. **Local worktree orchestrators** (Vibe Kanban, Conductor, Claude Squad, Crystal, cline/kanban) — run N agents in parallel, one git worktree each, on *your* machine with *your* CLI logins. Great isolation, **single-user**, board/state usually in a **local DB**, no team layer.
2. **Cloud autonomous platforms** (Devin, Factory, Cursor cloud agents, Tembo) — strong autonomy and team features, but **server/DB/VM-metered**, BYO-key is a billing toggle not an architecture, and they own your state.

**Our wedge sits exactly in the gap:** a **git-native, team-shared work queue** (folders = Kanban columns, claim = `git mv` + push as compare-and-swap), a **persistent per-user orchestrator (AUTO)**, **BYO-CLI economics** (route PRDs to each user's own Claude/Codex/Gemini login), delivered as a **VS Code extension** — a surface no direct competitor occupies. The category leaders that *did* have the best UX (Vibe Kanban, Crystal, Terragon) are **dead or sunsetting in 2026**, leaving an orphaned user base and a validated UX with no living incumbent.

**The one hard problem we inherit:** when board state lives in git *paths* across many branches, that state can diverge (a feature branch sees a stale board; a merge can resurrect a "done" card). Backlog.md hit this exact wall and had to add last-write-wins reconciliation. We must design for it from day one (see §6 and `11-coordination-model.md`).

---

## 1. The category map

```
                    SINGLE-USER  ───────────────────────────►  TEAM / MULTI-USER
        ┌─────────────────────────────────────┬─────────────────────────────────────┐
 LOCAL  │  Claude Squad, Crystal, uzi,        │                                     │
 (git / │  Conductor, Sculptor, parallel-code │            ◄── US ──►               │
 BYO    │  Vibe Kanban (local DB)             │   (git-native shared queue + chat,  │
 CLI)   │  cline/kanban (git-native, solo)    │    AUTO orchestrator, BYO-CLI)      │
        ├─────────────────────────────────────┼─────────────────────────────────────┤
 CLOUD  │  SWE-agent, Sweep (per-issue)       │  Devin, Factory, Cursor cloud,      │
 (server│                                     │  Tembo, OpenHands cloud, Amp        │
 / DB)  │                                     │  (server/DB/VM, metered compute)    │
        └─────────────────────────────────────┴─────────────────────────────────────┘
```

The top-right quadrant — **team-scale coordination with no server, over git, on your own CLIs** — is empty. That is the product.

---

## 2. Direct competitors — local multi-agent worktree orchestrators

These are the nearest neighbours: tools that run multiple coding agents in parallel with git-worktree isolation and/or a board. *"Team"* below means real multi-user/shared-state features, not merely "runs many agents."

| Tool | UI model | Worktree isolation | Concurrency | Agent CLIs | Team/collab | Persistence | License / maturity |
|---|---|---|---|---|---|---|---|
| **Vibe Kanban** (BloopAI) | Kanban (web) | Yes — branch + terminal + dev server per task | Many parallel | Claude, Codex, Gemini, Copilot, Amp, Cursor, OpenCode, Droid, Qwen (10+) | Minimal (single-dev) | Local **SQLite/Postgres** + git worktrees | Apache-2.0; ~26.8k★; Jun'25. **Sunsetting** (Bloop shutdown early'26), community-maintained |
| **Conductor** (Melty Labs, YC S24) | Desktop GUI (Mac) | Yes — isolated workspace per agent | Multiple parallel | Claude, Codex | Local-first/Mac; team N/A | Local-first; git PRs/merge | Closed freeware; Windows waitlisted |
| **Claude Squad** | Terminal TUI | Yes — worktree + **tmux** session each | Multiple panes | Claude, Codex, Aider, Gemini, OpenCode, Amp | None | Local (git + tmux) | AGPL-3.0; ~7.7k★; Mar'25; active |
| **Crystal** (stravu) | Desktop GUI (Mac) | Yes — worktree + history + context each | Multiple | Claude, Codex | None | Local | MIT; ~3.1k★. **Deprecated Feb'26 → Nimbalyst** |
| **cline/kanban** | Kanban (local web) | Yes — **ephemeral** worktree/card; symlinks `node_modules` | "hundreds at a glance" | Auto-detects installed CLI | Not addressed | **Git-based** (commits/branches/worktrees), local, `npx kanban` | Apache-2.0; ~1.0k★; Mar'26; active |
| **uzi** (devflowinc) | CLI | Yes — worktree + tmux, per-agent port | `--agents claude:3,codex:2` | Claude, Codex, Cursor, Aider | None | Local | MIT; ~579★; **stale (no push since Jun'25)** |
| **Sculptor** (Imbue) | Desktop GUI | **No** — Docker containers; "Pairing Mode" syncs to local | Parallel | Claude Code | None | Local containers | NOASSERTION; ~171★; Aug'25; active |
| **Terragon** | Cloud web | Cloud sandboxes per task | Parallel cloud | Claude, Codex | Cloud (PRs to GitHub) | **Cloud** | Apache-2.0 snapshot; **shut down Feb'26** |
| **Tembo** | Slack/Linear/GitHub (no terminal) | Cloud background agents | Parallel, **multi-repo** | Claude, Codex, Cursor, Amp, OpenCode | **Yes** — Slack/Linear, SSO, BYOK | Cloud/DB | SaaS; ~$60–200/mo |
| **parallel-code** (johannesjo) | Desktop | Worktree each | Side-by-side | Claude, Codex, Gemini | None | Local | MIT; ~703★; Feb'26; active |
| **Kanban Code** (langwatch) | Native Kanban (Mac/Swift) | Yes | Parallel | Claude Code | None | Local | AGPL-3.0; ~200★; Feb'26 |

**Closest architectural neighbour:** **cline/kanban** — Kanban + ephemeral-worktree-per-card + **git-as-persistence** + local-only. It validates our "no server, no DB" thesis but is **solo**. **Vibe Kanban** is closest on UX/feature surface (Kanban + 10+ CLIs + inline-diff-review-back-to-agent) and was the category leader — but it is a **DB-backed app that is sunsetting**. **Conductor** is the polished-GUI benchmark for "what good feels like."

**What to steal:**
- Vibe Kanban's **review loop**: inline diff comments sent straight back to the agent; PR/merge with AI-written descriptions; built-in preview browser.
- cline/kanban's **dependency chains** (task completes → commits → triggers next) and its **symlinking of git-ignored dirs** (`node_modules`) to dodge the per-worktree reinstall tax — the #1 critique of worktrees.
- Claude Squad / uzi's **multi-CLI breadth** and **per-agent dev-port** management.
- Tembo's **multi-repo** coordination as the enterprise wedge.

---

## 3. Autonomous SWE platforms — the autonomy & verification bar

We are **not** trying to out-build these on single-agent autonomy. We study them to (a) match the table-stakes loop and (b) steal their verification patterns.

| Platform | Autonomy model | "Done" / verification gate | Multi-repo / parallel | Team / enterprise | Memory / context | Pricing (2026) |
|---|---|---|---|---|---|---|
| **Devin** (Cognition) | Full plan→code→test→PR; reads CI logs, self-fixes before PR | Self-review + iterate; exposes **confidence** signal + plan summary for human intervention | "Team of Devins"; ≤10 concurrent (Pro), unlimited (Ent) | VPC, SAML/OIDC, Slack/Teams, playbooks | Machine snapshots, auto **Repo Knowledge**, notes | Core $20 (PAYG $2.25/ACU); Team $500; Ent custom |
| **Factory Droids** | Orchestrator decomposes → workers implement → **validator agents** judge | **Validation contract** = checklist of testable assertions; dual validators; "2–4 rounds/milestone" | Missions multi-agent; **model-routing** per subtask | Nvidia/Adobe/EY; 3 autonomy levels; BYOK (local keys) | Shared milestone state; spec mode | $0 → ~$20–$2,000/mo; $150M Series C @ $1.5B (Apr'26) |
| **OpenHands** (All-Hands-AI, OSS) | Modular scaffold; code+terminal+browser | CI/test loop; SWE-Bench Verified ~66% (Sonnet 4.5), ~77% (Opus internal) | Docker-sandboxed; self-host parallel | OSS, ~40k★ | Repo indexing | Free/OSS (+ cloud) |
| **SWE-agent** (Princeton, OSS) | Agent-computer interface | Benchmark-oriented | Single-task | Academic | Minimal | Free/OSS |
| **Cursor** | Background/cloud agents, isolated git branches | Tests/CI per branch; human merges winning branch | **≤8 agents parallel**, 1 VM each; multi-repo cloud | $40/user Teams; SCIM, audit | Codebase index; rules | $0/$20/$60/$200; Teams $40 |
| **Sourcegraph Amp** | Agentic layer on code-graph search | **Agentic code review**; correctness via deep index | Strong large/multi-repo | Enterprise governance, single-tenant | Best-in-class indexing | Amp ~free; Cody/search paid |
| **Augment Code** | Cascade agent + structured planning | CI verification; context-checked review | Repo-wide; 500k-file engine | **ISO 42001**, SOC 2 II, air-gapped, CMK | 200k-token context engine | Indie $20 / Std $60/user |
| **Windsurf** (Codeium) | Cascade multi-step agent | Test/iterate loop | Moderate | Teams $30 / Ent $60 | **Memories** persist across sessions | Free / $15 / $30 / $60 |
| **Cosine Genie** | Ticket→ctx→code→PR; fine-tuned | Human-review PR; parallel tickets | Multiple tickets | Enterprise | Codebase context | Enterprise |
| **Sweep** | GitHub issue/Jira → PR | PR-based; existing CI | Per-repo | Augments workflow | Repo scan | Tiered |
| **Zencoder** | Agents in CI/CD | **Code Review Agent** + CI gates; self-verify before posting | CI/CD integration | Enterprise SDLC | **Repo Grokking** | Tiered |

**The autonomy bar (mid-2026):** a credible agent runs the full **plan → code → run-tests/build → read-failures → self-fix → open PR** loop unattended, then answers PR review comments. **Parallel-by-default** (8–10+ concurrent isolated branches) and **model-routing** per subtask are now expected. SWE-Bench Verified (~66–77% for open scaffolds) is saturating — vendors now compete on **orchestration + verification**, not raw resolution rate.

**Verification patterns worth stealing (this is the gold):**
1. **Validation contract up front** (Factory): a finite checklist of *testable behavioural assertions* defining "done," checked by **fresh, independent validator agents** separate from the implementer. Separated incentives beat self-grading; converges in 2–4 rounds. → Store the contract as a file in the PRD folder; see `25-verification-trust-gate.md`.
2. **Dual validators**: "scrutiny" (correctness) + "user-testing" (behaves as a user would).
3. **Confidence signal + plan summary** surfaced to the human (Devin) — drives when AUTO escalates.
4. **Context-grounded review** (Zencoder/Augment): verify findings against codebase context before surfacing, to kill noise.
5. **CI parity**: agent PRs pass the *same* linters/tests/scans as humans — no special path.

---

## 4. Spec-driven & git-native task systems — validation and the landmine

This stream studied tools that already treat **files in the repo as the unit of work**. It both *validates* our design and surfaces its *one genuinely hard problem*.

| System | Unit of work | State store | Claim / concurrency model | Decomposition |
|---|---|---|---|---|
| **Backlog.md** (MrLesk) | Markdown+YAML task file in `backlog/` | **Git only** — "every change is a commit" | Cross-branch **last-write-wins** reconciliation (timestamps); ID locking for concurrent create/promote/demote | Manual + AI, sequential-first |
| **spec-kit** (GitHub) | `.specify/` → `spec.md`→`plan.md`→`tasks/` | Git files | N/A (single dev) | `/tasks` auto-generates ordered tasks with `[P]` **parallel markers** + explicit file paths |
| **Kiro** (AWS) | `requirements.md`/`design.md`/`tasks.md` | Git files | N/A | Builds **dependency graph → concurrent "waves"** |
| **BMAD** | Sharded epic/story files | Git files | N/A | Orchestrator/Scrum-Master shards PRD → epics → context-rich stories |
| **code-conductor** (ryanmac) | GitHub issue | GitHub | **Atomic issue-assignment** as CAS — first API call wins, losers retry; Dispatcher + Reconciler | Issue-driven |
| **Ralph** (snarktank) | `prd.json` (ordered `priority`, `passes` bool, `acceptanceCriteria[]`, `notes`) | Git + `progress.txt` | Single fresh-context loop | Verification criteria **inside** the task |

**What validates our design:**
- **Files-as-board, git-as-state is the dominant pattern** — Backlog.md, spec-kit, Kiro, BMAD all do it. Folders-as-Kanban-columns is a natural extension nobody has productised.
- **Optimistic concurrency via the platform's atomic op is proven** — code-conductor uses GitHub's atomic issue-assignment; our `git mv` + push-rejection is the *same compare-and-swap* with git's ref-update atomicity as the primitive. The pattern (poll → atomic claim → loser backs off) is validated; we're swapping the substrate. Copy their **Dispatcher** (controls concurrency) + **Reconciler** (detects stale claims).
- **Persistent orchestrator → auto-decompose → spawn workers is the consensus pipeline** (Kiro waves, BMAD sharding, spec-kit `[P]` markers). AUTO's role is standard, not exotic.

**The landmine — cross-branch state divergence:**
> Encoding status in a file's *path* (which folder) is brittle. A worker on a feature branch sees a stale board; merges/rebases can resurrect a "done" card or double-move it. **Backlog.md explicitly does NOT trust folder location** — it reconciles task state across all active branches using **last-updated timestamps (LWW)**, with dedicated config (`checkActiveBranches`, `activeBranchDays`) and conflict-detection on merge. They added this *because* a task's "true" status is ambiguous when it lives in git across branches.

**Our mitigation (decided):** put authoritative `status` in **YAML frontmatter**, not only in the folder path. The folder is the *fast render*; the frontmatter is the *source of truth* for reconciliation. The control-repo board lives on **one branch** (`main` of the control repo) and claims happen there — project-repo feature branches never carry the board — which sidesteps most divergence. Where divergence is still possible (offline workers), LWW-on-frontmatter is the fallback. Detailed in `11-coordination-model.md` and risk-logged in `51-risks-open-questions.md`.

**Other challenges flagged:**
- **Push-CAS contention:** claim throughput is bounded by push latency × contention (N workers ⇒ N−1 wasted fetch+mv+push cycles). Fine at kernel scale (≤4 agents); needs a backoff/jitter strategy and possibly per-priority sharding before it scales.
- **Worktrees sidestep shared state entirely** — Conductor/Sculptor give each agent an isolated worktree and need *no* coordination substrate. Our shared-queue approach is deliberately harder; the payoff is the team layer they can't offer.

**Task-file ideas to steal:** Ralph's `prd.json` shape (ordered priority, `passes` flag, embedded `acceptanceCriteria[]` incl. "typecheck passes"/"verify in browser", `notes` for agent memory); spec-kit's `[P]` markers + explicit target file paths (encode the DAG so AUTO wave-schedules without re-parsing); Kiro's dependency-graph→waves; BMAD's sharding (keep each worker's context small); Backlog.md's **status-in-frontmatter** so LWW reconciliation is possible.

---

## 5. Multi-agent frameworks & memory — patterns for AUTO + workers

We are not adopting a framework runtime (they presume a long-running server/process; our runtime is git + CLIs). We lift **patterns**, re-expressed as files in git. Letta is covered separately in project memory and `13-memory-architecture.md`.

**Orchestration patterns to adopt:**
- **Magentic-One's dual-ledger orchestrator** (AutoGen; arXiv:2411.04468) is the closest match to AUTO. The lead Orchestrator keeps an outer **Task Ledger** (facts, guesses, plan) and an inner **Progress Ledger** (per step: who acted, is-it-stalled, next instruction, is-request-satisfied), and **re-plans only when a stall counter crosses a threshold.** → Make **both ledgers markdown files in git**: the Task Ledger *is* the board/plan; the Progress Ledger updates as workers PR. Stall-counted replanning is exactly how AUTO should detect a spinning Ralph loop and re-decompose.
- **Manager-delegates-with-context** (CrewAI hierarchical): the manager passes *all necessary context* per delegation and reviews outputs → AUTO claims a PRD and hands the worker a self-contained brief.
- **Handoff = transfer of control, not nesting** (OpenAI Agents SDK): handoffs are tools (`transfer_to_<agent>`); one top-level loop, active agent swaps — cleaner than a broadcast GroupChat for our one-worker-per-worktree model. **Agents-as-tools** (bounded sub-run with its own turn budget) maps to AUTO spawning a worker.
- **Supervisor-as-router** (LangGraph, Mastra): a routing node picks the next worker from *state*. Mastra **strips memory-derived context** so routing isn't polluted by chat scrollback → AUTO routes on board/PRD state, not conversation history.

**Memory patterns for a files-in-git model:**
- **Three-tier scoping via path convention, not a DB.** Mem0 scopes by `user_id`/`agent_id`/`run_id`; Mastra by `resourceId` (persistent, cross-thread) + `threadId` (ephemeral). Map directly: `resourceId` → team/user dir, `threadId` → per-worktree run dir. Mastra **auto-isolates subagent memory** (fresh `threadId`, deterministic `{parent}-{agent}` id) → deterministic file paths per worktree, so worker memory is isolated but team memory persists.
- **Append-don't-overwrite consolidation.** Mem0 V3 went *additive*: facts accumulate with `linked_memory_ids`, conflicts resolved at *retrieval* time by ranking recency, not by deleting. This is git-native by nature (append-only history, resolve on read).
- **Durable/resumable = a serializable state blob per pause-point** (Mastra `suspend()`/`resume()`, AutoGen `save_state`/`load_state`, LangGraph checkpoints) → our committed Progress Ledger + worker scratch file. Resume = re-read the file.
- **HITL = suspend to a file, resume on edit.** Worker writes a "needs-approval" marker/PR; human approval = a commit/merge AUTO polls.

**What's overkill for a CLI-agent, files-in-git design:**
- **Mem0/Zep/Cognee extraction pipelines** — they run an LLM fact-extraction call on every write and require vector + graph + relational stores (**Zep mandates Postgres + Neo4j and cannot run serverless**). For code work, git diffs/PRs/commit messages are *already* structured memory.
- **LangGraph Pregel checkpointer / BSP supersteps** — assume a running runtime holding the graph. Our durability *is* the git history; adopt the concept (snapshot per step), not the engine.
- **GroupChat broadcast / Swarm shared message bus** — wrong for isolated worktrees; workers should share *files*, not a chat bus.
- **Semantic recall / embeddings** — overkill when the corpus is one repo; `grep` + path lookups over committed markdown beat a vector index and add zero infra. (Revisit only for cross-repo semantic recall later.)

**Bottom line:** adopt Magentic-One's **ledger + stall-replan loop** and Mastra's **resourceId/threadId scoping + suspend-snapshot** model, both re-expressed as files in git. Treat dedicated memory DBs as overkill — they presume the server we deliberately designed away.

---

## 6. Auth, secrets & team identity — the cross-cutting verdict

Full detail in `20-identity-and-teams.md` and `21-secrets-and-keys.md`; the load-bearing conclusions:

- **Sign-in = VS Code's built-in GitHub auth provider** (`vscode.authentication.getSession('github', …)`). Since teams already coordinate through git, **GitHub identity *is* user identity** — no separate account system, no server. Headless worker CLIs use **GitHub OAuth device flow** (how `gh auth login` works).
- **Personal BYO model keys → `vscode.SecretStorage`** (OS keychain via Electron `safeStorage`); never `settings.json`, never git. Passed to worker CLIs via env vars.
- **Team-shared secrets in git → SOPS + age** (encrypts *values*, keeps files diffable; multi-recipient; `sops updatekeys` makes onboarding a commit). Avoid hosted managers (Doppler/Infisical) for v1 — they reintroduce the central dependency.
- **Team identity = GitHub repo permissions + CODEOWNERS** (enforcement) + a committed `teams/` manifest (human-readable metadata). **Signed commits** (SSH signing) are the audit trail.
- **Secret-leak prevention = layered:** `gitleaks` pre-commit hook + CI backstop + GitHub push protection.
- **Only unavoidable hosted piece:** a GitHub App *registration* (a client ID, no server) to enable device flow. Prefer a GitHub App over an OAuth App (installation-token rate limits scale).

---

## 7. The wedge — where we win

1. **Git is the database, at the team layer — uncontested.** Every incumbent uses a server/control-plane (cloud VMs, hosted state, ACU metering). A files-in-git Kanban (folders = columns, claim = `git mv` + push) needs no server/DB and is auditable, forkable, and offline-friendly. Local worktree tools are git-ish but **single-user**; cloud tools are team-capable but **server-bound**. Nobody does git-backed status-folder Kanban with push-CAS claiming across a team.
2. **BYO-CLI dodges the pricing trap.** Incumbents meter compute (ACUs, credits) and lock you to their VMs. Routing PRDs to each user's *own* Claude/Codex/Gemini login (Factory's BYOK, but at the team orchestration layer) means no per-token markup and model-agnostic from day one.
3. **AUTO = the missing persistent team brain.** Devin's "team of Devins" and Cursor's 8-agent console are per-user and ephemeral. None expose a **shared, git-backed work queue that multiple humans claim from, with team chat**. The dual-ledger orchestrator pattern, owned per-user and isolated per-team, is genuine white space.
4. **VS Code-native is empty.** Competitors are CLI/TUI or standalone Mac GUIs. A git-native VS Code extension with a board + team chat has **no direct rival** — and inherits VS Code's editor, multi-root workspace, terminal, and SCM for free.
5. **Incumbent churn = timing.** Vibe Kanban, Crystal, Terragon all dead or dying in 2026. The best-loved UX is being abandoned just as worktree-per-agent became "load-bearing." There is an orphaned audience and a proven interaction model with no owner.

**Don't out-build the verification bar — adopt it.** Steal Factory's validation-contract + independent-validator pattern (store the contract in the PRD folder). Our edge is **team coordination + git-native substrate + BYO-CLI economics**, not a better single-agent loop.

---

## 8. Positioning statement

> **For** small, remote engineering teams running multiple AI coding agents, **who** are stuck hand-spawning agents in terminals with no shared board, memory, or way for teammates to steer the work, **[product]** is a **VS Code extension** that turns the editor into a **git-native, multi-agent team cockpit**: a Kanban board that is a live render of a git work-queue, a persistent orchestrator (AUTO) per user that claims PRDs and dispatches worker agents across worktrees, and team chat — all coordinated through git with **no server and no per-token markup**. **Unlike** Devin/Factory (server-bound, metered) or Vibe Kanban/Conductor (single-user, local DB, and now abandoned), we are **team-scale, git-native, and BYO-CLI**.

---

## 9. Sources

**Direct competitors:** [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) · [vibekanban.com](https://vibekanban.com/) · [Conductor](https://www.conductor.build/) · [Claude Squad](https://github.com/smtg-ai/claude-squad) · [Crystal](https://github.com/stravu/crystal) · [uzi](https://github.com/devflowinc/uzi) · [Sculptor](https://imbue.com/sculptor/) · [Terragon OSS](https://github.com/terragon-labs/terragon-oss) · [Tembo](https://www.tembo.io/) · [cline/kanban](https://github.com/cline/kanban) · [parallel-code](https://github.com/johannesjo/parallel-code) · [kanban-code](https://github.com/langwatch/kanban-code) · [Nimbalyst worktree-tools roundup](https://nimbalyst.com/blog/best-git-worktree-tools-ai-coding-2026/)

**Autonomous platforms:** [Devin pricing](https://devin.ai/pricing) · [Introducing Devin 2.2](https://cognition.ai/blog/introducing-devin-2-2) · [Factory](https://factory.ai/) · [How Missions Work](https://factory.ai/news/missions-architecture) · [Factory BYOK](https://docs.factory.ai/cli/byok/overview) · [OpenHands SWE-bench](https://github.com/All-Hands-AI/OpenHands/blob/main/evaluation/benchmarks/swe_bench/README.md) · [Cursor product](https://cursor.com/product) · [Amp](https://sourcegraph.com/amp) · [Augment enterprise comparison](https://www.augmentcode.com/guides/enterprise-ai-coding-assistant-comparison-windsurf-vs-github-copilot-vs-augment-code) · [Cosine Genie SOTA](https://cosine.sh/blog/state-of-the-art) · [Zencoder](https://zencoder.ai/)

**Spec-driven / git-native:** [github/spec-kit](https://github.com/github/spec-kit) · [MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md) · [Backlog.md ADVANCED-CONFIG](https://github.com/MrLesk/Backlog.md/blob/main/ADVANCED-CONFIG.md) · [claude-task-master](https://github.com/eyaltoledano/claude-task-master/blob/main/docs/task-structure.md) · [Kiro Specs](https://kiro.dev/docs/specs/) · [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) · [snarktank/ralph](https://github.com/snarktank/ralph) · [ryanmac/code-conductor](https://github.com/ryanmac/code-conductor/blob/main/CLAUDE.md)

**Frameworks & memory:** [CrewAI](https://deepwiki.com/crewAIInc/crewAI) · [AutoGen](https://deepwiki.com/microsoft/autogen) · [Magentic-One paper (arXiv:2411.04468)](https://arxiv.org/abs/2411.04468) · [LangGraph](https://deepwiki.com/langchain-ai/langgraph) · [Mastra](https://deepwiki.com/mastra-ai/mastra) · [OpenAI Agents SDK](https://deepwiki.com/openai/openai-agents-python) · [Mem0](https://deepwiki.com/mem0ai/mem0) · [Zep](https://deepwiki.com/getzep/zep) · [Cognee](https://deepwiki.com/topoteretes/cognee)

**Auth / secrets:** [VS Code API (authentication, SecretStorage)](https://code.visualstudio.com/api/references/vscode-api) · [gh auth login](https://cli.github.com/manual/gh_auth_login) · [GitHub device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) · [SOPS docs](https://getsops.io/docs/) · [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) · [Commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)

**Caveats:** Star counts and dates are point-in-time (2026-06-06). Factory's validator internals and Cosine's SWE-Bench figure are vendor-reported, not independently benchmarked. Conductor's auth/secrets internals could not be verified. Sculptor's spec→task internals are not publicly documented.
