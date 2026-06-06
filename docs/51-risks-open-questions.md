# 51 — Risks & Open Questions

> **Status:** ✅ done · **Date:** 2026-06-06 · **Owner:** Gerard
> **Purpose:** The honest back-of-the-program: what could break the git-native bet, what's still undecided, and what would *falsify* the thesis. Every risk names the mitigation already in the design **and** a trip-wire — the observable signal that tells us the risk is materialising. Nothing here is hand-waved; if a risk has no mitigation, it's listed as an open decision instead.

---

## 1. How to read this

Each risk carries a **likelihood × impact** rating (L/M/H) for the **kernel** scope (≤5 repos, ≤4 workers, 1 team — `PRD-v1` §3). Ratings are deliberately for *that* scope: several low-likelihood-at-kernel risks become high at scale, and that's the point of proving the kernel first (principle #3, `50` §7).

Two columns matter most:
- **Mitigation (in place):** the design decision that already addresses this — with the doc that specifies it. If this column is empty, it's not a risk, it's an §6 open decision.
- **Trip-wire:** the concrete, observable signal that the mitigation is failing. A risk you can't detect is a risk you can't manage — every row has one.

The framing throughout: **the substrate is a bet** (git as the only backend). §2 is where that bet is most exposed; §7 states the conditions under which we'd admit the bet was wrong.

## 2. Substrate risks — the git-native bet

The whole system rests on "git is the only backend" (`PRD-v1` §3, `11` §2). These are the risks to that wager.

| # | Risk | L×I (kernel) | Mitigation (in place) | Trip-wire |
|---|---|---|---|---|
| **R1** | **Latency ceiling** — coordination is only as fast as the git sync clock; the consistency window is ~2N (`11` §5). Chat/board feel laggy; a worker acts on a stale board. | M × M | N is tunable in `config.yml` (`14` §8); kernel caps agents/repos so 2N stays small; real-time transport is an explicit, isolated later-add that doesn't touch the substrate (`22` §6). | Median board-staleness > 1 sync tick; users describe chat as "slow." |
| **R2** | **Push contention / thundering herd** — N workers + humans all push the *control repo* `main`; rejection-retry storms waste cycles. | M × M | The only contended write is the **claim CAS** — a tiny commit; everything else (chat, memory, status) is a per-writer file on a disjoint path, so it never contends (principle #5, `11` §7). Loser contract retries the *next* card, not the same one (`33` §3). Project-repo pushes (the big diffs) are on feature branches, off the control repo entirely (`27` §3). | Claim-commit retry rate climbs with worker count; push latency on control `main` rising. |
| **R3** | **Cross-branch state divergence** — status encoded in folder path is brittle across branches/offline workers (the Backlog.md landmine, `01` §4 / `11` §6). Board shows a card in two columns. | L × H | Three stacked rules: frontmatter `status` is the **source of truth**, folder is a render cache (`14` §2.1); the board lives on **exactly one branch** (control `main`); **LWW** on `updated` is the reconciliation fallback (`11` §6, `23` §4 reconciler). | Reconciler logs a frontmatter≠folder mismatch; a card id appears in two columns in one render. |
| **R4** | **Claim CAS correctness under exotic git states** — does the compare-and-swap actually hold under force-push, shallow clone, ref races, mid-rebase? A double-claim would break the core invariant. | L × H | The CAS *is* git's atomic non-fast-forward reject — there is no second lock to get out of sync (`33` §2, §7). Hard rule: **never force-push the control repo.** One winner per card is a property of the ref update, not our code. | Two workers ever report `owner` on the same card id (the M3 acceptance test exists precisely to catch this — `PRD-06` US-3). |
| **R5** | **Heartbeat write-volume noise** — `status/<id>.json` every N s = a flood of commits polluting control-repo history (`12` §5, `14` §3). | M × L | Heartbeats are the one place we may *not* want full git history — candidate treatments: a dedicated short-TTL status area, squash-on-prune, or local-first liveness. **Which one is an open decision (§6.5).** Until decided: small files, single path per agent, no contention. | Control-repo commit graph dominated by status writes; `git log` unusable without filtering. |
| **R6** | **LWW clock skew** — last-write-wins relies on `updated` timestamps from different machines; skewed clocks pick the wrong winner. | L × M | LWW is a *fallback* for the rare offline-divergence case, not the primary path (R3); the primary path is single-branch, so most state never needs LWW. Timestamps are advisory, ties broken by a stable secondary key (id). | A reconciliation picks an older-content card as the winner; user reports "my change got reverted." |

**Net:** the substrate bet is strongest exactly where it's most used (chat/memory/status never contend) and most exposed at the single contended point (the claim) — which is also the most-tested (M3). That's the right place to concentrate risk.

## 3. Agent & trust-gate risks

The trust gate is the product, not throughput (`PRD-v1` §3, `25` §1). These are the risks to *trusting the output*.

| # | Risk | L×I (kernel) | Mitigation (in place) | Trip-wire |
|---|---|---|---|---|
| **R7** | **Validator-as-oracle** — the independent validator is still an LLM; it can green-light bad code or reject good code (`25` §8). | M × H | Defense-in-depth, not a single oracle: ✅ requires **per-criterion evidence + CI green + a merged PR** — three independent gates, one of them human (`25` §2, §7). The validator is structurally ≠ the implementer, with incentive to *find* a failing criterion (`25` §4). | Merged PRs later reverted for defects the validator passed; validator verdicts that cite no evidence. |
| **R8** | **Runaway loop / cost** — Ralph + re-plan could spin; BYO-token spend balloons. | M × M | Stall counter with a hard threshold → escalate, not loop forever (`12` §2, `31` §3); `max_workers` cap; re-plan is bounded then it asks a human (`31` §4). | Stall-counter escalations rising; a card cycles review→in-progress repeatedly. |
| **R9** | **Prompt injection via git content** — cards, chat, and memory are human-and-agent-written files a worker *reads as instructions*; a poisoned card or memory note could steer a worker. | M × H | A worker can only do what the **user's repo permissions** allow — no privilege to escalate (`20` §4); secrets are never in the worktree to exfiltrate (`21` §3); every change still passes the validator + a human PR merge (`25`). Card/chat/memory content is treated as **untrusted input**, never as authority. | A PR contains changes unrelated to its card's criteria; memory notes contain instruction-shaped text. |
| **R10** | **BYO-CLI fragmentation** — claude / codex / gemini differ in flags, auth, and output; the supervisor's abstraction leaks. | M × M | `engine` is declared per card; the supervisor has a per-engine adapter and launches the right CLI (`12` §3.3, `PRD-06` US-1). Pin CLI versions. The contract is the worktree + heartbeat + card, which is engine-agnostic. | A new CLI version breaks spawn; one engine's workers fail at a higher rate. |
| **R11** | **Memory rot** — wrong "team knowledge" misleads *every* future agent (`13` §5.1). | L × H | Shared memory passes the **same review gate as code** — consolidation writes a PR, never a live write (`PRD-07` US-3); additive/LWW means a stale fact is superseded, not silently trusted (`13` §5.2). | Recall surfaces a fact contradicted by current code; consolidation PRs merged without review. |

## 4. Security risks

Full detail in `21-secrets-and-keys.md`; the residual risks after those mitigations:

| # | Risk | L×I (kernel) | Mitigation (in place) | Trip-wire |
|---|---|---|---|---|
| **R12** | **Secret leakage to git** — a model key lands in a commit (worktree file, log, `.env`). | L × H | Keys live in OS keychain (`SecretStorage`), injected as worker **env vars only — never written to the worktree** (`21` §3); gitleaks runs pre-commit **+** CI **+** push-protection (×3, `21` §6); SOPS+age for any team secret in git (`21` §4). Never bypass a gitleaks block with `--no-verify` (`21` §7). | Any gitleaks hit; a key string appears in `git log -p`. |
| **R13** | **Offboarding leaves old ciphertext** — removing an age recipient doesn't un-encrypt history; a departed member's key still decrypts past SOPS blobs in git history (`21` §5). | M × M | Documented hard rule: **rotate the secret on offboarding**, don't just `sops updatekeys` (`21` §5). Membership manifest change triggers the rotation checklist (`20` §7). | A member is removed without a paired secret-rotation commit. |
| **R14** | **Control-repo write = trust** — every collaborator can push board/chat/memory; a careless or malicious push disrupts the team. | L × M | Isolation is the repo boundary, so blast radius = one team (`22` §5, `12` §7); optional branch protection/CODEOWNERS on the control repo (tension with drag=push speed — noted in §6). Everything is git, so every bad write is **revertable and audited**. | Unexplained board/memory rewrites; history shows force-touched shared files. |

## 5. Product & adoption risks

| # | Risk | L×I (kernel) | Mitigation (in place) | Trip-wire |
|---|---|---|---|---|
| **R15** | **VS Code API ceiling** — we outgrow what an extension can do (detached process mgmt, custom shell). | L × M | Extension-first by design; we only build what's ours and reuse the host (`PRD-v1` §3, `26` §9); packaging is **Theia-compatible** so an own-shell is a later swap, not a rewrite (`26` §7). Own-branded shell is explicitly deferred (`PRD-v1` §6). | A required capability has no extension API (e.g. worker count > terminal limit — see §6.2). |
| **R16** | **Single-operator ergonomics don't survive a real team** — the model is proven by one person running 8 agents; multi-human coordination may surface needs (notifications, presence, richer routing) the maildir chat doesn't cover. | M × M | Chat routing taxonomy already supports team/DM/thread/AUTO/system (`22` §3); real-time/presence is a scoped later-add behind the same substrate (`22` §6). Kernel success is defined for ≥2 humans (`00` §8). | Teammates miss escalations; "I didn't see it" becomes common. |

## 6. Open decisions

These are genuinely undecided — carried from `PRD-v1` §8 and surfaced by the subsystem docs. Each lists the options, the current **lean**, and **when it must be decided** (the milestone that forces it).

### 6.1 Agent self-review vs. dedicated reviewer agent
- **Options:** (a) the implementer model self-critiques before PR; (b) a separate **independent validator** reviews (`25` §4).
- **Lean:** **(b), decided for the trust gate** — `PRD-06` US-5 and `25` already specify an independent validator (≠ implementer) as the gate. Self-review remains a *necessary-not-sufficient* step inside the worker loop (`PRD-06` US-2). The residual open part is only *cost tuning*: whether a cheaper/lighter reviewer engine suffices.
- **Forced by:** M3 / `PRD-06`. (Largely resolved; only the reviewer-engine economics stay open.)

### 6.2 Where do workers run — visible terminals vs. detached processes
- **Options:** (a) one VS Code terminal each — visible, simple, the Canopy value of *watching* (`12` §5, `26` §6); (b) detached child processes the extension manages — scales past the terminal-count ceiling.
- **Lean:** **(a) for v1** (terminal-visible; `PRD-06` defers detached children as out-of-scope). Revisit when worker count makes terminals impractical (ties to R15).
- **Forced by:** M5 (scale-a-little) / when `max_workers` is raised post-kernel.

### 6.3 Control repo per team vs. one shared
- **Options:** (a) one control repo **per team** — isolation is topological, zero extra code (`12` §7, `27`); (b) one shared control repo partitioned by `teams/<team>/`.
- **Lean:** **(a)** — isolation-as-topology is a load-bearing simplification across the whole design (`22` §5). One team in v1 sidesteps the question; the multi-team story (`50` §6) assumes per-team control repos.
- **Forced by:** the first second team (post-kernel, `50` §6).

### 6.4 AUTO as a distinct GitHub identity
- **Options:** (a) AUTO uses the **user's** GitHub credentials — it's their orchestrator, their access (`20` §8); (b) AUTO is a distinct GitHub **App** identity for finer-grained audit and a clean `auto[bot]` author.
- **Lean:** **(a) for the kernel** — keeps the permission model trivial (AUTO can do exactly what the user can, nothing more; `20` §8, `PRD-02` scope-out). (b) is a clean post-kernel hardening when audit trails matter at team scale.
- **Forced by:** team-hardening stage (`50` §6), or the first compliance/audit requirement.

### 6.5 Heartbeat persistence treatment
- **Options:** (a) commit `status/<id>.json` to the control repo like everything else (uniform, but R5 history noise); (b) a dedicated short-TTL / orphan-branch status area; (c) local-first liveness, only escalations hit git.
- **Lean:** **undecided** — start with (a) for uniformity (it's the simplest and matches "everything is git"), measure the noise (R5 trip-wire), and move to (b)/(c) only if history becomes unusable. *This is the one substrate detail still genuinely open.*
- **Forced by:** M5 (when heartbeat volume from ≥4 agents over hours is first observable).

### 6.6 Product / repo name
- **Options:** the repo is `automatos-ide` (**placeholder**). Naming is open.
- **Lean:** defer — it's a cosmetic decision with zero architectural weight; decide before any external/public surface.
- **Forced by:** first external release.

> **Decided, no longer open** (recorded so they don't re-open): git as the only backend (`PRD-v1` §3); claim CAS as the sole concurrency primitive (`11` §4, `33`); frontmatter-as-truth for status (`14` §2.1); independent validator gates `done` (`25`); per-writer files for chat/memory/status (principle #5); grep recall over a vector store at team scale (`13` §6).

## 7. What would falsify the thesis

The git-native bet is honest only if it's falsifiable. We'd conclude the substrate is **wrong for this problem** — not merely needing a tune — if, at kernel scope:

1. **The claim CAS double-claims** under normal operation (R4 trip-wire fires without an exotic-git cause). The core invariant — one winner per card — would be broken, and with it the "many writers, never one file" principle.
2. **Sync latency can't be made acceptable** even at kernel scale (R1) — i.e. 2N is intolerable *and* can't be hidden, meaning git's clock is fundamentally too slow for coordination, not just chat.
3. **Push contention degrades super-linearly** with workers despite the contended-write being tiny (R2) — meaning the "only the claim contends" claim is false in practice.
4. **The trust gate can't hold** — merged-then-reverted defects are common despite three independent gates (R7), meaning verification-by-agent isn't trustworthy enough to be the product.

None of these is mitigated *away* — each is a measurable property we commit to checking at M3/M5. The kernel exists to run exactly these tests before any scale investment (`50` §7). If 1–4 hold, the answer isn't a patch; it's a different substrate — and proving that cheaply, early, is itself a successful outcome (principle #3).

## 8. Status of the program

With this document, **all six tiers are complete** (`00-DOCUMENT-MAP.md`): foundation → architecture → subsystems → flows/diagrams → PRDs → delivery. The design is specified end-to-end and falsifiable. What remains is **building M0** (`50` §3) and the one carried implementation chore — rewriting `AUTO.md`'s "My Architecture Knowledge" section from Automatos's cloud body to this git-native reality (`PRD-v1` §3.1, `PRD-05`).

---

**Related:** `50-roadmap.md` (the plan this de-risks) · `PRD-v1.md` §8 (origin of the open questions) · `11-coordination-model.md` §6 (divergence) · `25-verification-trust-gate.md` §8 (validator limits) · `21-secrets-and-keys.md` §6–7 (security guardrails) · `00-vision-positioning.md` §8 (the kernel criterion the risks gate) · `00-DOCUMENT-MAP.md` (program status).
