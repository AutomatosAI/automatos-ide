# PRD-02 — Identity & Teams

> **Status:** Draft · **Date:** 2026-06-06 · **Owner:** Gerard
> **Spec:** `20-identity-and-teams.md` · **Flow:** `32-flow-onboarding.md`
> **One-liner:** Sign in with GitHub, join a team by having control-repo access — no account system, no auth code of our own.

---

## 1. Problem & goal

We need to know *who* a user is (to attribute claims, chat, PRs) and *what team* they're on (to scope the board/chat/memory) — **without** building an account system, session store, or RBAC. GitHub already answers both.

**Goal:** a user opens the workspace, signs in via VS Code's GitHub auth, and their GitHub handle becomes their identity everywhere; "their team" is the control repo they have access to.

## 2. Dependencies

- **Precedes:** everything (identity is foundational). Pairs with PRD-03 (secrets) in onboarding.
- **Requires:** a control repo exists with `config.yml` + `teams/<team>/members.md` (the kernel layout, `PRD-v1` §5.1).

## 3. Scope

**In:**
- GitHub sign-in via `vscode.authentication.getSession('github', …)`.
- Resolve identity = `session.account.label` (the handle); use it for `card.owner`, `chat.author`.
- Read `teams/<team>/members.md` for display metadata (name, role, engines).
- First-run readiness check: prompt sign-in if no session; clear error if no control-repo access.
- AUTO acts as the user (uses the user's GitHub credentials).

**Out (deferred):**
- SSO/SAML, org RBAC beyond GitHub permissions.
- AUTO as a distinct GitHub App identity (`51` open question).
- Multi-team-per-user switching UI (1 team in kernel).

## 4. User stories & acceptance criteria

**US-1 — Sign in.** As a user, when I open a workspace with a control repo, the extension signs me in with GitHub.
- [ ] On activation with `config.yml` present, `getSession('github', ['repo','read:org'], {createIfNone:true})` runs.
- [ ] First run opens GitHub OAuth in the browser; the token is cached by VS Code (we never store it).
- [ ] Subsequent runs resolve the session silently.
- [ ] `session.account.label` is exposed as `identity` to the rest of the extension.

**US-2 — Identity attribution.** As a teammate, I see *who* claimed a card / sent a message.
- [ ] A claim sets `card.owner = identity`.
- [ ] A chat message sets `author = identity`.
- [ ] The board/chat render display names from `members.md` when present, else the raw handle.

**US-3 — Team = repo access.** As an admin, I add a member by granting GitHub access (no app-side step).
- [ ] A user with **read** on the control repo sees the board; without it, a clear "ask your admin for access" error.
- [ ] `members.md` is descriptive only — a role in it grants no app capability (GitHub permissions are the gate).

**US-4 — Readiness check.** As a new user, the extension tells me exactly what's missing.
- [ ] No session → prompt sign-in. No control access → actionable error. (Full checklist in PRD-03 for keys.)

## 5. Implementation notes

- All auth via `vscode.authentication` — **no custom auth code** (`20` §2).
- Worker/CLI git auth is GitHub **device flow**, mostly handled by `gh auth login` / the model CLIs — the extension only *detects* and prompts, never manages tokens (`20` §3).
- Authorization is **entirely** GitHub repo permissions + CODEOWNERS — we write zero permission checks (`20` §4).
- `members.md` schema in `14` §7; treat as metadata cache, never enforcement.

## 6. Test plan

- [ ] Unit: identity resolves from a mocked session; falls back to handle when not in `members.md`.
- [ ] Integration: no-session path prompts sign-in; no-access path surfaces the error.
- [ ] Integration: claim + chat write the correct `owner`/`author`.
- [ ] Manual: sign in on a fresh machine; verify token is in VS Code's store, not in any repo file or `settings.json`.

## 7. Definition of done

Identity resolves from GitHub on first run; claims and chat are correctly attributed; a user without control-repo access gets a clear error; **no auth/session code or user table exists in our codebase** (the whole point).

---

**Related:** `20-identity-and-teams.md` · `32-flow-onboarding.md` · `PRD-03-secrets-keys.md` (the other half of onboarding) · `14-data-model.md` §7 (members manifest).
