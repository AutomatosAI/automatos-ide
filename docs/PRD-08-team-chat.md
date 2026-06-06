# PRD-08 — Team Chat

> **Status:** Draft · **Date:** 2026-06-06 · **Owner:** Gerard
> **Spec:** `22-team-communication.md` · **Maps to:** `PRD-v1` M4
> **One-liner:** A chat panel where teammates talk to each other and to AUTO, transported as maildir (one file per message) in git — conflict-free, auditable, server-free.

---

## 1. Problem & goal

Coordination needs a conversation surface co-located with the work. It must let two people type at once without merge conflicts, let a human command AUTO, and let AUTO escalate — all over git, with no chat server.

**Goal:** a teammate sends a message (written as a unique maildir file, committed, pushed); others see it within a sync tick; messaging `@auto` commands the orchestrator; AUTO replies and escalates in the same panel.

## 2. Dependencies

- **Requires:** PRD-02 (identity = author), the git-sync loop + watchers (PRD-04 plumbing). Pairs with PRD-05 (AUTO consumes `@auto`, escalates here).
- **Maps to:** PRD-v1 M4 (maildir chat panel).

## 3. Scope

**In:**
- **Maildir transport**: one immutable file per message, globally unique name, under `teams/<team>/chat/YYYY/MM/DD/` (`22` §2, `14` §6).
- **Chat webview**: list + sort by `ts`; render `@team`/DM/thread/AUTO/system views from the `to:` field (`22` §3).
- **Send** = write file + commit + push; **receive** = pull + watcher → re-render.
- **Human↔AUTO**: AUTO watches `chat/` for `to:@auto`, treats as commands, replies as `kind: auto` (`22` §4).
- **Routing taxonomy**: `@team` / `@<handle>` / `@auto` / `thread:<id>` / `system` (`22` §3).
- Team isolation via the control-repo boundary (no extra code) (`22` §5).

**Out (deferred):**
- Real-time transport (typing/presence/sub-second) — a later add if a requirement forces it (`22` §6).
- Slack/Discord/GitHub-Discussions integration (`22` §7).

## 4. User stories & acceptance criteria

**US-1 — Conflict-free send.** As a teammate, I send a message even if someone sends at the same moment.
- [ ] Each message is its own file `<HHMM>-<author>-<nonce>.md` — two same-minute messages are different files (`14` §6).
- [ ] Messages are immutable after write; concurrent sends never merge-conflict (`22` §2).

**US-2 — See messages.** As a teammate, I receive messages within a sync tick.
- [ ] Background pull + watcher re-render the panel on new message files.
- [ ] Conversation builds by listing the maildir and sorting by `ts` — no shared log file (`22` §2).

**US-3 — Routing/views.** As a teammate, I can address the team, a person, or AUTO.
- [ ] `to: @team` shows in the main channel; `to: @alice` as a DM; `thread:<id>` nested under its parent.
- [ ] `to: @auto` is consumed by AUTO; `kind: system` lines render muted (`22` §3).

**US-4 — Command AUTO.** As a human, I steer the system from chat.
- [ ] Messaging `@auto` (e.g. "claim the csv export card") is parsed by AUTO as a command and acted on (claim/report/explain/re-plan/pause) (`22` §4).
- [ ] AUTO replies by writing its own message file (`kind: auto`); the chat log is also the command log (auditable).

**US-5 — AUTO escalates here.** As AUTO, when stuck I ask in chat.
- [ ] Stall/needs-decision escalations (from PRD-05) post an `@team` message with context (`31` §4).
- [ ] AUTO's lines are visually marked.

**US-6 — Isolation.** As a team, another team's chat is invisible/unreachable.
- [ ] Chat lives in the team's control repo; access = repo collaborators (`22` §5).
- [ ] Your AUTO watches only your control repo's `chat/` — no cross-team channel exists.

## 5. Implementation notes

- Maildir is the **same many-writers trick** as memory/board: never a shared file → structurally conflict-free (`22` §2, `11` §7). Do **not** implement a single `chat.md`.
- Routing is **render-time** over one folder (the `to:` field is a view filter), not separate channel storage (`22` §3).
- Isolation needs **zero code** — it's the repo/credential boundary (`22` §5, `12` §7).
- Webview = render + emit (send) intent; host writes the file (`26` §3). No secrets in chat `postMessage`.
- Latency is the git clock (≤ ~2N); real-time is explicitly deferred (`22` §6).

## 6. Test plan

- [ ] Unit: message filename/nonce uniqueness; `to:` routing → correct view bucket.
- [ ] Integration: two clients send in the same minute → two files, no conflict, both render in `ts` order.
- [ ] Integration: `@auto` message triggers an AUTO action + reply (with PRD-05).
- [ ] Integration: AUTO escalation appears as an `@team` message.
- [ ] Manual: second team's control repo → its chat is unreachable from the first team's IDE.

## 7. Definition of done

Teammates exchange messages via conflict-free maildir within a sync tick; routing supports team/DM/thread/AUTO/system views; messaging `@auto` commands the orchestrator and AUTO replies/escalates in-panel; chat is team-isolated by the repo boundary with no chat server. **Proves PRD-v1 M4.**

---

**Related:** `22-team-communication.md` · `14-data-model.md` §6 · `11-coordination-model.md` §7 · `12-agent-runtime.md` §6–7 · `31-flow-auto-loop.md` §4 · `PRD-05-auto-orchestrator.md` · `PRD-02-identity-teams.md`.
