# PRD-04 — Board Webview

> **Status:** Draft · **Date:** 2026-06-06 · **Owner:** Gerard
> **Spec:** `23-kanban-board.md` · **Maps to:** `PRD-v1` milestones M0–M1
> **One-liner:** A Kanban webview that is a live render of `prds/*/`, where dragging a card is a `git mv` + push (the claim CAS for humans), kept honest by a reconciler.

---

## 1. Problem & goal

The board is one of the two marquee surfaces. It must show the queue as columns, update live as the control repo syncs, and let a human claim/move work by dragging — all while holding **no state of its own** (it's `render(prds/)`).

**Goal:** a teammate watches cards slide `inbox → in-progress → review → done` within a sync tick, and can drag a card to claim/move it, with the move committed to git and reverted on a lost race.

## 2. Dependencies

- **Requires:** control-repo layout + card schema (`PRD-v1` §5.1–5.2, `14` §2); the git-sync loop + watchers (PRD-v1 M0 plumbing); the Claim/CAS engine (`33`) for drag=claim.
- **Pairs with:** PRD-05 (AUTO drives the same moves) and PRD-08 (sibling chat surface).

## 3. Scope

**In:**
- Read frontmatter of all `prds/*/*.md`; build `boardModel` (columns → cards sorted by `priority` + liveness badges).
- Render columns (`inbox`/`in-progress`/`review`/`done`) in a webview; cards show id, title, priority, owner/branch, badge.
- Drag a card across columns → host performs `git mv` + frontmatter `status`/`updated` + push (CAS), with optimistic UI + revert on reject.
- `+ New card` opens authoring (writes to `inbox/`) — basic form (full authoring is PRD-05/`24`).
- Liveness badges from `status/<id>.json`.
- **The reconciler**: enforce `status (frontmatter) == folder`; LWW on `updated` (`23` §4).
- Live re-render on FileSystemWatcher (local edit or pulled change).

**Out (deferred):**
- Rich filtering/search, swimlanes, archive views (`23` §8), card detail panel beyond opening the `.md`.

## 4. User stories & acceptance criteria

**US-1 — See the queue.** As a teammate, the board shows current cards by column.
- [ ] Each folder renders as a column with a count badge.
- [ ] Cards sort by `priority` within a column.
- [ ] Card shows id, title, priority, owner/branch.

**US-2 — Live updates.** As a teammate, the board reflects changes within a sync tick.
- [ ] A `git pull` that changes `prds/` re-renders the affected cards (watcher-driven).
- [ ] Latency bounded by the sync interval (≤ ~2N), no manual refresh.

**US-3 — Drag to claim/move.** As a human, dragging a card moves it in git.
- [ ] Drag `inbox→in-progress` performs the claim CAS (`git mv` + frontmatter + push).
- [ ] Optimistic UI: the card moves immediately; on push **reject** (lost race) it snaps back to remote truth (`23` §3, `33` §5).
- [ ] On accept, `status` and `updated` are written in the same commit as the `git mv`.

**US-4 — Liveness.** As a teammate, I see which cards have a live worker.
- [ ] `in-progress` cards show 🟢 running / 🟡 waiting / 🔵 PR-open / 🔴 stalled from heartbeats (`23` §5).
- [ ] A heartbeat update changes only that card's badge (diffed `status/` update, not a full re-render — `23` §8).

**US-5 — New card.** As an author, `+ New card` creates a PRD in `inbox/`.
- [ ] The form captures title, repo, priority, ≥1 validation criterion, body; writes `prds/inbox/<id>-<slug>.md`; commits + pushes.
- [ ] Empty `validation_criteria` is rejected (`24` §2.1).

**US-6 — Reconciler.** As the system, folder and frontmatter never silently disagree.
- [ ] On render/pull, any card whose `status` ≠ folder is `git mv`'d to match `status` (frontmatter wins).
- [ ] On a cross-branch divergence, newer `updated` wins (LWW); the reconciler re-files to the survivor.

## 5. Implementation notes

- **Webview = pure render + intent emitter; host = all git/file logic** (`23` §2, `26` §3). Webview never touches the filesystem (sandbox); strict CSP, no remote content, no secrets in `postMessage`.
- Read **frontmatter only** for the board model (fast); read full body lazily on card-open (`23` §2, §8).
- Drag and AUTO-claim are the **same** host operation (`23` §3) — implement once, call from both.
- Reconciler is idempotent + cheap; runs every render and after every pull (`23` §4).

## 6. Test plan

- [ ] Unit: `render(prds/)` → correct `boardModel` (grouping, sort, badges) from fixture folders.
- [ ] Unit: reconciler re-files a status≠folder card; picks newer `updated` on conflict.
- [ ] Integration: drag triggers `git mv`+push; simulated reject reverts the optimistic move.
- [ ] Integration: heartbeat change updates one badge only.
- [ ] Manual: two clients; move a card on one, see it on the other within a tick.

## 7. Definition of done

The board renders `prds/*/` live, updates within a sync tick, drag performs the claim CAS with optimistic-then-confirm semantics, badges reflect heartbeats, `+ New card` writes a valid PRD, and the reconciler keeps folder and frontmatter consistent. **Proves PRD-v1 M0 (render) + M1 (claim CAS for humans).**

---

**Related:** `23-kanban-board.md` · `11-coordination-model.md` §4,§6 · `33-flow-claim-race.md` · `14-data-model.md` §2 · `26-extension-surface.md` §3 · `PRD-05-auto-orchestrator.md` (drives the same moves).
