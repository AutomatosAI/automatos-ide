# Claude Code for Teams — Documentation Suite (Program Map)

> This is bigger than one PRD — it's a documentation **program**: architecture, subsystem designs, flows, diagrams, and a set of PRDs that together specify how every part of the system works. This map is the index **and** the tracker.
>
> **Status legend:** ✅ done · 🔬 awaiting research · ✍️ drafting · ⬜ todo
> **Conventions:** docs `NN-title.md`; PRDs `PRD-NN-title.md`; diagrams in Mermaid, inline with their flow.
> **Last updated:** 2026-06-06 *(All tiers complete — design specified end-to-end; next is building M0)*

## Tier 0 — Foundation
- ✅ `00-vision-positioning.md` — north star, who it's for, the differentiation thesis
- ✅ `01-competitive-landscape.md` — competitors & OSS, what to steal, our wedge *(5 research streams synthesised)*
- ✅ `02-glossary.md` — canonical terms (AUTO, worker, card, control repo, claim, queue, …)

## Tier 1 — Architecture
- ✅ `10-system-architecture.md` — layered stack, components, data flow, C4 diagrams
- ✅ `11-coordination-model.md` — control repo, queue, claim CAS / push-race, eventual consistency
- ✅ `12-agent-runtime.md` — AUTO + workers, spawning, worktrees, lifecycle, status heartbeat
- ✅ `13-memory-architecture.md` — git-native memory, per-agent files, consolidation (Letta-derived)
- ✅ `14-data-model.md` — every file schema: card/PRD, board, status, teams, `config.yml`

## Tier 2 — Subsystems (every part of the system)
- ✅ `20-identity-and-teams.md` — sign-in / auth, team membership, identity over git
- ✅ `21-secrets-and-keys.md` — BYO model keys, SecretStorage / keychain, team-shared secrets in git
- ✅ `22-team-communication.md` — AUTO chat, maildir transport, routing taxonomy, team isolation
- ✅ `23-kanban-board.md` — render-of-queue, drag = `git mv`, liveness, interactions
- ✅ `24-prd-authoring-and-decomposition.md` — PRD format, planner prompt, Playbook vs Mission
- ✅ `25-verification-trust-gate.md` — tests, review, `done ← verified`, reviewer agent
- ✅ `26-extension-surface.md` — VS Code APIs, webviews, commands, activation, packaging
- ✅ `27-multi-repo-workspace.md` — the N-repo workspace model, control vs project repos

## Tier 3 — Flows & Diagrams (Mermaid)
- ✅ `30-flow-prd-lifecycle.md` — PRD → claim → build → PR → verified → done (sequence)
- ✅ `31-flow-auto-loop.md` — AUTO orchestration (state diagram)
- ✅ `32-flow-onboarding.md` — team sign-in + key setup (onboarding sequence)
- ✅ `33-flow-claim-race.md` — concurrent claim via push-CAS (sequence)
- ✅ `34-diagram-components.md` — component / C4 architecture
- ✅ `35-diagram-repo-topology.md` — control repo + project repos + worktrees

## Tier 4 — PRD set (buildable increments, kernel-first)
- ✅ `PRD-v1.md` — the kernel: board render + claim + one worker loop + chat
- ✅ `PRD-02-identity-teams.md`
- ✅ `PRD-03-secrets-keys.md`
- ✅ `PRD-04-board-webview.md`
- ✅ `PRD-05-auto-orchestrator.md`
- ✅ `PRD-06-worker-runtime.md`
- ✅ `PRD-07-memory-consolidation.md`
- ✅ `PRD-08-team-chat.md`

## Tier 5 — Delivery
- ✅ `50-roadmap.md` — milestones (kernel → team → scale), sequencing & dependencies
- ✅ `51-risks-open-questions.md` — risk register, open decisions

---

**Build order:** research → `01` + `00` → Tier 1 (architecture) → Tier 2 (subsystems) → Tier 3 (flows/diagrams) → expand Tier 4 (PRDs) → Tier 5 (delivery). Every doc stays small and focused; each Tier-2 subsystem doc feeds a matching Tier-4 PRD.
