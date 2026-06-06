# PRD-03 — Secrets & Keys

> **Status:** Draft · **Date:** 2026-06-06 · **Owner:** Gerard
> **Spec:** `21-secrets-and-keys.md` · **Flow:** `32-flow-onboarding.md`
> **One-liner:** Personal model keys live in the OS keychain and are injected into workers as env vars; team-shared secrets live in git encrypted with SOPS+age — no key ever lands in plaintext in a repo.

---

## 1. Problem & goal

Workers need model credentials (BYO-CLI), and teams sometimes need a shared secret. Both must work **without** a secrets server and **without** ever committing a plaintext key.

**Goal:** a user enters their model key once (stored in the OS keychain); workers receive it as an injected env var at spawn; team-shared secrets are SOPS-encrypted in git; gitleaks makes an accidental leak hard to commit.

## 2. Dependencies

- **Requires:** PRD-02 (identity, for SOPS recipient = a member's age key) and PRD-06 (worker spawn, where injection happens) — though key *storage* can land before workers exist.
- **Pairs with:** PRD-02 in the onboarding flow.

## 3. Scope

**In:**
- Store/retrieve personal model keys via `vscode.SecretStorage` (`context.secrets`).
- Inject keys into a worker's terminal `env` at spawn (never written to a worktree file).
- SOPS+age for team-shared secrets in git (`.sops.yaml` + `secrets.enc.yml`).
- gitleaks at pre-commit + CI; document GitHub push protection.
- Onboarding prompt to set keys; `automatos.setModelKey` command.

**Out (deferred):**
- A secrets server / Vault, proxying model calls, per-worker ephemeral key minting (`21` §8).

## 4. User stories & acceptance criteria

**US-1 — Store a personal key.** As a user, I paste my Anthropic/OpenAI/Google key once and never again.
- [ ] `automatos.setModelKey` (and the onboarding prompt) call `context.secrets.store('automatos.<provider>Key', key)`.
- [ ] The key is in the OS keychain (verify: not in `settings.json`, not in any repo file, not logged).
- [ ] Re-opening the workspace retrieves it silently via `context.secrets.get`.

**US-2 — Inject into a worker.** As a worker, I authenticate to the model with the user's key.
- [ ] At spawn, the supervisor reads the key from the keychain in memory and sets it in the terminal `env` (`createTerminal({env})`).
- [ ] The key appears in the worker process environment, **never** in any file inside the worktree.
- [ ] After the worker exits, the process (and its env) is gone — nothing to clean up in the repo.

**US-3 — Team-shared secret.** As a team, we share a service token in git, encrypted.
- [ ] `secrets.enc.yml` stores values as SOPS ciphertext; YAML keys stay readable (diffable).
- [ ] `.sops.yaml` lists **public** age recipients only.
- [ ] `sops updatekeys` re-encrypts to the current recipient set; onboarding/offboarding a recipient is a commit.

**US-4 — Leak prevention.** As any contributor, I can't accidentally commit a secret.
- [ ] gitleaks runs at pre-commit (`gitleaks protect --staged`) and in CI (`gitleaks detect`).
- [ ] A staged plaintext key blocks the commit locally.
- [ ] Docs instruct enabling GitHub push protection; **never** bypass a gitleaks block with `--no-verify`.

## 5. Implementation notes

- **Two homes, never confused** (`21` §1): personal = keychain (never git); team = SOPS-in-git (never plaintext). Model API keys are *always* personal.
- Injection is keychain→memory→terminal `env` only (`21` §3) — the worktree never contains the key, so even `git add -A` in a worktree can't leak it.
- age **private** keys live in the user's keychain/`~/.config/sops/age`; **only public** keys in `.sops.yaml` (`21` §4).
- Offboarding sensitive secrets = **rotate**, not just un-recipient (git history holds old ciphertext) (`21` §5).
- Hard-rules checklist: `21` §7.

## 6. Test plan

- [ ] Unit: store/get round-trips through a mocked SecretStorage; injection builds the right `env`.
- [ ] Integration: spawn a worker; assert the key is in `process.env` and **not** in any worktree file.
- [ ] Integration: `sops` encrypt/decrypt round-trip; `updatekeys` adds/removes a recipient.
- [ ] CI: a deliberately-planted fake secret is caught by gitleaks (fails the build).
- [ ] Manual: grep the whole repo + `settings.json` for any plaintext key → none.

## 7. Definition of done

A user sets a model key once; workers authenticate with it via injected env; the key never exists in any repo file or `settings.json`; team secrets are SOPS-encrypted with public-key recipients; gitleaks blocks accidental plaintext at pre-commit and CI. **The hard-rules checklist (`21` §7) all pass.**

---

**Related:** `21-secrets-and-keys.md` · `32-flow-onboarding.md` · `PRD-02-identity-teams.md` · `PRD-06-worker-runtime.md` (where injection runs) · `14-data-model.md` §9 (SOPS schema).
