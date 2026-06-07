# PRD-09 — Automatos Integration (Team Coordination Backend)

> **Status:** Draft · **Date:** 2026-06-07 · **Owner:** Gerard
> **Spec:** `10-system-architecture.md` · `20-identity-and-teams.md` · `21-secrets-and-keys.md` · `22-team-communication.md` · `23-kanban-board.md` · `26-extension-surface.md` · **Maps to:** `50-roadmap.md` "team" tier (new)
> **One-liner:** Keep agent execution 100% local (Claude Code / Codex / Gemini in git worktrees) and add **Automatos as the optional team coordination backend** — board, AUTO chat, and shared memory/graph/RAG — behind swappable seams, so a solo user stays fully git-native while a team can light up a managed backend with no change to how code is written.

---

## 1. Problem & goal

The kernel (PRD-v1 → PRD-08) is **git-native**: the board, chat, and memory are files in a control repo, coordinated by push/pull. That is perfect for a solo user or a small trusted team, but it has ceilings: no live board (latency = the git clock), no shared semantic memory/RAG, no managed identity, and coordination logic that every client must re-derive from files.

Automatos already solves the *coordination/PM* problem as a product (board tasks, an AUTO orchestrator agent, memory, RAG, 856-app tool routing). We do **not** want to move execution onto a server — that loses the local-first, bring-your-own-CLI value. We want the **split**:

- **Execution plane — ALWAYS local.** Filesystem, git worktrees, spawning the user's own `claude` / `codex` / `gemini`. Never on a server. (Unchanged from `12-agent-runtime.md`.)
- **Coordination plane — optionally Automatos.** Board, AUTO chat, shared memory/graph/RAG. Git remains a valid backend; Automatos is an alternative behind the same seams.
- **Code — git/GitHub forever.** The repo is the source of truth for code; Automatos never holds code.

**Goal:** a team can point the cockpit at an Automatos workspace and get (1) a live chat with the AUTO orchestrator, (2) a live board backed by Automatos tasks, and (3) shared memory/graph/RAG — while the same extension, pointed at a plain git control repo with no Automatos config, behaves exactly as it does today. The integration is **additive and reversible**.

This also doubles as a sales surface: the branded IDE becomes a first-class client of Automatos-as-a-PM-tool.

## 2. Background — the architectural decision

**Decided 2026-06-07 (reverses the 2026-06-06 "build-own, not on the Automatos cloud" stance for the *coordination* plane only; the "build a VS Code extension" and "execution stays local" parts still hold).**

The integration is gated by a **hard backend reality discovered from source** — there are **two non-interchangeable auth planes** in `automatos-ai/`:

| Plane | Endpoints | Auth (`orchestrator/...`) | Accepts SDK keys? |
|---|---|---|---|
| **Board** | `/api/v1/tasks` (`api/board_tasks.py`) | `get_request_context_hybrid` (`core/auth/hybrid.py`) — **Clerk JWT** OR env-global admin `ORCHESTRATOR_API_KEY` + `X-Workspace-ID` | **No** — ignores `sdk_api_keys` |
| **Widget** | `/api/widgets/*` (`api/widgets/auth.py`) | `widget_auth` — validates `ak_pub_*` / `ak_srv_*` | **Yes** |

Consequences that shape the slice order:

- **Chat is unblocked** — it rides the widget plane, which already validates publishable keys. No backend change.
- **The board is blocked** — a per-workspace SDK key **cannot reach `/api/v1/tasks`** today. Unlocking it is real backend work (see §6, Slice 2, Step 0).
- There is **no board real-time** — no board SSE. The only task-ish stream is `GET /api/tasks/{id}/events` over `task_executions` (orchestration-run rows, *not* `BoardTask`). ⇒ a live board means **polling** `GET /api/v1/tasks`.

### 2.1 Key types (from `21-secrets-and-keys.md` + widget SDK)

- `ak_pub_*` — **publishable**, client-safe, **origin-restricted**, sent raw as `Authorization: Bearer ak_pub_…`. Safe to store in the OS keychain and ship in the desktop client.
- `ak_srv_*` — **secret/server**, exchanged at `POST /api/widgets/auth` for a JWT. **NEVER** ship client-side.
- `ORCHESTRATOR_API_KEY` — **env-global admin**, workspace-agnostic. **NEVER** ship in the extension. Dev-only, to prove a pipe.

## 3. Dependencies

- **Requires:** PRD-02 (identity = the actor binding), PRD-03 (`vscode.SecretStorage` keychain), PRD-04 (board webview + the `readBoard`/`buildBoard` shape we map onto), PRD-08 (chat panel + `renderChatHtml` we reuse).
- **Backend (Slice 2+):** changes in `automatos-ai/` — the board-auth unlock and (later) a Clerk desktop OAuth/device flow.
- **Maps to:** a new "team backend" tier in `50-roadmap.md`; updates the risk register `51-risks-open-questions.md` (sync is the #1 risk).

## 4. Scope

**In:**
- **Config seam:** a team-wide `automatos:` block in `config.yml` (`base_url`, `agent_id`); the per-user publishable key in the keychain.
- **Slice 1 — AUTO chat** (widget plane): a panel that talks to the AUTO orchestrator over `POST /api/widgets/chat`. **Built (this PRD's first increment).**
- **Slice 2 — read-only board** (board plane, after unlock): poll `GET /api/v1/tasks`, map task → `Card`, render behind a `BoardSource` seam with a git↔Automatos toggle.
- **Slice 3 — board write-back:** claim / move / create from the cockpit → Automatos `PATCH`/`POST`, with optimistic local actions reconciled on ack.
- **Slice 4 — shared memory / graph / RAG:** read (and later contribute to) the workspace's Automatos memory + RAG from the cockpit.
- **Slice 5 — human identity:** Clerk desktop OAuth/device flow for real per-person SSO (replaces the interim per-workspace key for human attribution).
- **Sync model:** Automatos = source of truth for the board; the plugin is a cache/projection; offline degrade defined up front.

**Out (deferred):**
- Running agents on Automatos servers (execution stays local — explicit non-goal).
- Storing code in Automatos.
- Real-time board push (no backend SSE exists; we poll until one does).
- Migrating existing git control repos into Automatos (one-way "git stays valid" is the contract).

## 5. Architecture & seams

The cockpit's layering is unchanged (`26-extension-surface.md`): `src/core/**` pure & tested, `src/host/**` boundary glue, `src/ui/**` pure renderers. The integration adds **provider seams** so a backend swap touches one wiring point, not the UI:

- **`AutoChatClient`** (already exists, `src/core/chat/autoChat.ts`) — the chat transport seam. Host impl = `createAutoClient` (`src/host/autoClient.ts`). Pure conversation logic (`sendToAuto`) is backend-agnostic.
- **`BoardSource`** (new, Slice 2) — returns a `Board`. Git impl wraps the existing `readBoard(FileStore)`; Automatos impl polls `/api/v1/tasks` and maps → `buildBoard`. **Code-seam note:** today `src/core/board/boardStore.ts` is a `readBoard(store)` *function*, not an interface — Slice 2 introduces the `BoardSource` provider as the real swap point.
- **`MemorySource`** (new, Slice 4) — read/append over either git `memory/` or Automatos memory/RAG.
- **`TokenProvider`** (new, Slice 2) — yields the auth credential (publishable key now; Clerk JWT later) so call sites never read the keychain directly.

Decision (resolved): the host transports are **dependency-free** (`fetch` + a pure SSE/JSON fold), **not** the browser `@automatos/core` SDK. The SDK is browser-oriented (EventBus, `sessionStorage`, `ConversationManager`) and would add a dependency to an extension that ships only `yaml`; ~50 LOC per transport honors the same wire contract, keeps the bundle lean, and keeps key-handling auditable.

## 6. Phased implementation — detailed steps

### Slice 1 — AUTO chat panel · **DONE 2026-06-07** (widget plane, no backend change)

Talk to the persistent AUTO orchestrator from the cockpit. Proves the identity/keychain binding the board will reuse.

**Steps & deliverables (all landed; typecheck + 365 tests + esbuild green; coverage 97% lines / 91% branches vs 80% gate):**

1. **Config block** — `src/core/config/config.ts`: `AutomatosConfig { baseUrl: string; agentId: string | null }`, added to `Config` + `DEFAULT_CONFIG` (`https://api.automatos.app`, `null`). `parseConfig` reads snake_case `automatos.base_url` (trailing slash trimmed, blank → default) + `automatos.agent_id`. Team-wide (lives in git `config.yml`); the per-user key does **not**.
   - *Bug fixed in passing:* the M0 settings form rebuilds the whole `Config`, which would silently wipe a hand-edited `automatos:` block on save. `validateDraft(draft, previous = DEFAULT_CONFIG)` now carries unmanaged sections forward and `serializeConfig` emits the block; the host passes the on-disk config as `previous` (`src/host/settingsPanel.ts`).
2. **Pure SSE reducer** — `src/core/chat/autoSSE.ts`: `parseSSE(raw)` → events; `reduceAutoStream(events, fallbackConversationId?)` folds `message` deltas (`data.content`) into the reply text, takes the thread id from `done` (`data.conversation_id`), throws on `error` (`data.message`), ignores tool-lifecycle events. 13 unit tests.
3. **Host transport** — `src/host/autoClient.ts`: `createAutoClient({ baseUrl, apiKey, agentId, origin?, fetchImpl? })` → `AutoChatClient`. `POST {baseUrl}/api/widgets/chat`, headers `Authorization: Bearer ak_pub_…` + `Accept: text/event-stream`, body `{ message, conversation_id?, agent_id? }`; reads the whole stream then `reduceAutoStream(parseSSE(text), …)`. `FetchLike` seam keeps it testable with no DOM types. 4 tests (request shape, continuation id, optional Origin, non-2xx throws).
4. **Conversation core (pre-existing, PRD-08-adjacent)** — `src/core/chat/autoChat.ts`: immutable `AutoConversation`, `sendToAuto` fold, `toChatMessages` to reuse the team-chat renderer. 8 tests.
5. **Panel** — `src/host/autoChatPanel.ts`: in-memory `AutoConversation` for the panel's life (no git, no watcher), optimistic user echo + an "AUTO is thinking…" row, reuses `renderChatHtml(toChatMessages(conv, me), { placeholder: 'Message AUTO…', pending })`. Renderer gained `placeholder`/`pending` options (`src/ui/chatView.ts`, escaped).
6. **Key capture** — `src/host/setAutomatosKey.ts`: input box stores the publishable key via `SecretStore` (keychain name `workspaceKey`); **rejects `ak_srv_`** and non-`ak_pub_` input; blank clears.
7. **Wiring** — `src/extension.ts`: commands `automatos.openAutoChat` (builds the client from `config.automatos` + keychain key; offers "Set Key" if absent) and `automatos.setAutomatosKey`; `package.json` command contributions; "Chat with AUTO" entry in the Cockpit menu (`src/host/menuTree.ts`).

**Known gaps (cannot be closed headlessly):**
- Live send/receive needs the user's real `ak_pub_*` + network — not run in CI.
- Publishable keys are **origin-restricted**; `createAutoClient` supports an optional `Origin` header but leaves it unset. If a live call returns 401/403, the workspace key's allowed-origin list is the first thing to check (candidate fix: a `config.automatos.origin` setting).

### Slice 2 — Read-only board · **BLOCKED on Step 0** (board plane)

Render the Automatos task board live in the existing webview, read-only first.

- **Step 0 — THE UNLOCK (backend, `automatos-ai/`).** Extend `get_request_context_hybrid` (`orchestrator/core/auth/hybrid.py`) to also accept a per-workspace `sdk_api_key` bearing a `tasks:*` scope (mirror the widget plane), so `/api/v1/tasks` (`orchestrator/api/board_tasks.py`) becomes a first-class SDK surface. Production auth path → **architecture + security review before merge**. Interim dev-only proof: `ORCHESTRATOR_API_KEY` + `X-Workspace-ID` (never shipped).
- **Step 1 — `TokenProvider` seam + SecretStorage.** Abstract "the credential to send" (publishable key now). Call sites never touch the keychain directly.
- **Step 2 — `AutomatosBoardStore` (read-only).** Poll `GET /api/v1/tasks` on `config.sync.pull_interval_seconds`; map each task → `Card`. Task shape: status `inbox|assigned|in_progress|review|blocked|done`, priority `urgent|high|medium|low`, review_mode `human|llm|auto`; list returns `{ tasks, total }`, rows enriched with `agent:{ id, name, agent_icon }`. Map Automatos status → cockpit `CardStatus`; preserve agent as `owner`/`engine` display.
- **Step 3 — `BoardSource` seam + toggle.** Introduce the provider; git impl wraps `readBoard`; Automatos impl = Step 2. Select via `config.automatos` presence (or an explicit `board_backend: git|automatos`). UI (`boardView`) unchanged — it consumes a `Board`.
- **Acceptance:** with a valid key + unlock, the board renders Automatos tasks within one poll tick; with no `automatos:` config, the board is byte-for-byte the git board.

### Slice 3 — Board write-back (optimistic, reconciled)

Make the cockpit a writer, honoring the sync model (§7).

- **Step 1 — Create:** "New PRD"/card → `POST /api/v1/tasks`.
- **Step 2 — Move/claim:** drag or claim → `PATCH /api/v1/tasks/{id}/status { status }` / `PATCH /api/v1/tasks/{id}`.
- **Step 3 — Optimistic + reconcile:** apply locally immediately, mark pending, reconcile on server ack; on failure, roll back the projection and surface the error. Define conflict resolution (server wins; show the diff).

### Slice 4 — Shared memory / graph / RAG

- **Step 1 — `MemorySource` seam:** read the workspace's Automatos memory + RAG (read-only) into the cockpit (e.g. surface relevant memories in chat/worker prompts).
- **Step 2 — Contribute:** the consolidation flow (PRD-07) optionally writes to Automatos memory in addition to / instead of git `memory/`.
- **Step 3 — Graph/RAG retrieval** for AUTO chat context (page_context-style enrichment).

### Slice 5 — Human identity (Clerk desktop SSO)

- Replace the interim per-workspace key for **human attribution** with a Clerk desktop OAuth/device flow → per-person JWT (`20-identity-and-teams.md`). The per-workspace `ak_pub_*` remains valid for the agent/widget plane; human actions (board writes, chat authorship) attribute to the signed-in person. No such flow exists today — net-new backend + client work.

## 7. Sync model (the #1 risk) & offline degrade

- **Source of truth:** Automatos for the board (and memory/RAG) once a backend is selected. The plugin holds a **cache/projection**, never authoritative state.
- **Reads:** poll `GET /api/v1/tasks` on the configured interval; render from the last good snapshot.
- **Writes:** **optimistic** — apply to the local projection immediately, mark pending, reconcile on ack; roll back + surface on failure.
- **Offline / backend down:** render the last snapshot read-only with a clear "disconnected" banner; queue or refuse writes (explicit, never silent); auto-resume on reconnect.
- **Conflict:** server wins; show the user what changed rather than overwriting blindly.
- **Why seams matter:** keeping `BoardSource`/`MemorySource`/`TokenProvider` means git and Automatos backends coexist and the core/UI stay decoupled from the sync mechanics.

## 8. Security model

- Publishable `ak_pub_*` only on the client, in `vscode.SecretStorage` (OS keychain) — **never** `config.yml`/settings.json/git. `setAutomatosKey` hard-rejects `ak_srv_*`.
- `ORCHESTRATOR_API_KEY` is admin-equivalent and **never** shipped; dev-only behind an explicit env var.
- Webview boundary unchanged (`26` §3): views render + emit intent; the host performs network/keychain. No secrets in `postMessage`. All untrusted text escaped.
- Team-shared secrets remain SOPS+age (PRD-03); this integration adds none to git. gitleaks pre-commit + CI still apply; never bypass with `--no-verify`.
- Origin-restriction on publishable keys is a defense-in-depth control we should honor (configurable `Origin`).

## 9. User stories & acceptance criteria

**US-1 — Chat with AUTO.** As a user, I open "Chat with AUTO" and hold a conversation.
- [x] `automatos.openAutoChat` builds a client from `config.automatos` + the keychain key; offers "Set Key" when absent.
- [x] Sending folds the exchange immutably (`sendToAuto`), echoes optimistically with a thinking row, and renders the reply.
- [x] The publishable key is stored in the keychain; `ak_srv_` is rejected.
- [ ] **Manual/live:** a real `ak_pub_*` returns an AUTO reply over the network (origin allowed).

**US-2 — Live board (read-only).** As a team member, I see Automatos tasks on the board.
- [ ] After the auth unlock, `GET /api/v1/tasks` renders within one poll tick, mapped to cards.
- [ ] With no `automatos:` config, the board is identical to today's git board.

**US-3 — Board write-back.** As a team member, I claim/move/create and it persists to Automatos.
- [ ] Optimistic local apply; reconcile on ack; rollback + error on failure.

**US-4 — Shared memory/RAG.** As a team, our cockpit reads shared Automatos memory/RAG.
- [ ] Memory reads surface in chat/worker context; consolidation can write back.

**US-5 — Human identity.** As a person, my board/chat actions attribute to me via SSO.
- [ ] Clerk desktop flow yields a per-person JWT used for human-authored writes.

**US-6 — Reversible/additive.** As a solo user, nothing changes.
- [x] No `automatos:` block ⇒ pure git-native behavior; defaults fill in (`parseConfig` test).

## 10. Test plan

- [x] Unit: `parseConfig` automatos block (defaults, read, trailing-slash, blank-fallback).
- [x] Unit: `configForm` preserves the automatos block through a settings save; round-trips via `serializeConfig`/`parseConfig`.
- [x] Unit: `parseSSE` / `reduceAutoStream` (deltas, done id, error, fallback id, tool-event ignore, non-JSON).
- [x] Unit: `createAutoClient` request shape (endpoint, bearer, body fields, optional Origin, non-2xx throw) with a fake `fetch`.
- [x] Unit: `renderChatHtml` placeholder/pending options (escaped).
- [ ] Integration (Slice 2): mocked `/api/v1/tasks` → `BoardSource` → `Board` mapping; status/priority/agent fidelity.
- [ ] Integration (Slice 3): optimistic write → ack reconcile and → failure rollback.
- [ ] Manual: live AUTO round-trip; live board render; offline degrade banner; reconnect resume.

## 11. Risks & open questions

- **R1 — Sync (highest).** Cache/projection drift, write conflicts. Mitigation: server-authoritative, optimistic+reconcile, defined offline degrade. (`51-risks-open-questions.md`.)
- **R2 — Board-auth unlock (Slice-2 blocker).** Production auth change in `hybrid.py`; needs security review; scope creep risk if it drifts toward a general SDK-key authz refactor.
- **R3 — Origin restriction on publishable keys.** May block desktop calls; needs a configurable `Origin` and a documented allowed-origin setup.
- **R4 — No board real-time.** Polling only; pick an interval that balances freshness vs. load; revisit if a backend SSE for `BoardTask` ships.
- **R5 — Identity gap.** Until Slice 5, human attribution on the Automatos plane leans on the per-workspace key (not per-person). Acceptable for chat; revisit before write-back ships to a real team.
- **Q1 —** Backend toggle: implicit (presence of `automatos:`) vs. explicit `board_backend:`? (Leaning explicit for clarity.)
- **Q2 —** Do we mirror memory to *both* git and Automatos, or switch? (Likely config-driven.)

## 12. Definition of done (per slice) & milestones

- **M-Chat (DONE):** AUTO chat panel works end-to-end against the widget plane given a valid publishable key; fully unit-tested core + host; reversible/additive config.
- **M-Board-RO:** auth unlock merged; read-only Automatos board renders behind `BoardSource`; git board unchanged when unconfigured.
- **M-Board-RW:** optimistic write-back with reconciliation + offline degrade.
- **M-Memory:** shared memory/RAG read (and optional write-back).
- **M-Identity:** Clerk desktop SSO for per-person attribution.

**Overall DoD:** a team points the cockpit at an Automatos workspace and gets live chat + board + shared memory with local-only execution and git-only code; a solo user with no Automatos config is unaffected. **Proves the "Automatos as team coordination backend" thesis.**

---

**Related:** `10-system-architecture.md` · `20-identity-and-teams.md` · `21-secrets-and-keys.md` · `22-team-communication.md` · `23-kanban-board.md` · `26-extension-surface.md` · `50-roadmap.md` · `51-risks-open-questions.md` · `PRD-02-identity-teams.md` · `PRD-04-board-webview.md` · `PRD-08-team-chat.md`.
