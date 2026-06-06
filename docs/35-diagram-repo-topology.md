# 35 — Diagram: Repo Topology

> **Status:** ✅ done · **Date:** 2026-06-06 · **Owner:** Gerard
> **Purpose:** The git topology as a standalone reference — one control repo, N project repos, worktrees per worker, and the remotes that tie a remote team together. This is the picture behind `27`; here it's pure diagram + annotation so you can see the whole repository graph at a glance.

---

## 1. The full topology (one user's machine + remotes)

```mermaid
flowchart TB
  subgraph Local["One user's machine — multi-root workspace"]
    direction TB
    subgraph Ctrl["control/ (CONTROL repo)"]
      direction LR
      PRDs["prds/{inbox,in-progress,review,done}/"]
      Mem["memory/{project,agents/<id>}/"]
      Team["teams/<t>/{members.md,chat/}"]
      Stat["status/<id>.json · config.yml"]
    end
    subgraph PA["project-api/ (PROJECT repo)"]
      PAmain["main checkout"]
      PAwt1["../.worktrees/0006 → feat/0006"]
      PAwt2["../.worktrees/0009 → feat/0009"]
    end
    subgraph PW["project-web/ (PROJECT repo)"]
      PWmain["main checkout"]
      PWwt1["../.worktrees/0012 → feat/0012"]
    end
  end

  Ctrl -. push/pull .-> RC[("control remote<br/>GitHub")]
  PA -. PRs .-> RA[("api remote<br/>GitHub")]
  PW -. PRs .-> RW[("web remote<br/>GitHub")]

  RC -. pull .-> Mate["teammate's workspace<br/>(same control remote)"]
```

Three kinds of node, one rule each:
- **Control repo** — coordination only; 1 per team; the board *is* its folders.
- **Project repos** — code only; N of them; clean history.
- **Worktrees** — per-worker checkouts inside a project repo; collision-free by construction.

## 2. Control repo internals (the coordination repo)

```mermaid
flowchart TB
  Root["control/ (git)"] --> P["prds/"]
  P --> Pi["inbox/   ⚪ claimable"]
  P --> Pp["in-progress/  🟢 owned"]
  P --> Pr["review/  🔵 PR open"]
  P --> Pd["done/  ✅ verified"]
  Root --> M["memory/"]
  M --> Mp["project/  (resourceId — shared)"]
  M --> Ma["agents/<id>/  (threadId — scratch)"]
  Root --> T["teams/<t>/"]
  T --> Tm["members.md  (metadata)"]
  T --> Tc["chat/YYYY/MM/DD/*.md  (maildir)"]
  Root --> S["status/<id>.json  (heartbeats)"]
  Root --> Cfg["config.yml  (repo registry, tunables)"]
  Root --> Sops[".sops.yaml + secrets.enc.yml  (team secrets)"]
```

Every coordination concern is a folder or file here (schemas in `14`). The board, chat, memory, heartbeats, config, and team secrets all live in this one repo — which is why it churns constantly and is kept separate from code (`27` §3).

## 3. Project repo + worktrees (the code repos)

```mermaid
flowchart TB
  Git["project-api/.git (one object db)"] --> Main["primary checkout (main)<br/>what the human browses"]
  Git --> WT["../.worktrees/"]
  WT --> A["0006-oauth-a3f2 → feat/0006-oauth (worker A)"]
  WT --> B["0009-export-b1c4 → feat/0009-csv (worker B)"]
  WT --> C["0011-fix-c2d5 → fix/0011 (worker C)"]
  A -. PR .-> Rem[("api remote")]
  B -. PR .-> Rem
  C -. PR .-> Rem
  Rem -. merge (trust gate) .-> Main
```

- One `.git`, many working directories — that's what `git worktree` gives.
- **N workers, same repo, zero collisions:** different dirs, different branches (`27` §4).
- Workers converge only at **PR merge**, gated by the trust gate (`25`).
- After a worker exits, `git worktree prune` reclaims its dir; the branch lives until merge.

## 4. The remote graph (how a team shares)

```mermaid
flowchart LR
  subgraph A["Teammate A"]
    AC["control/ clone"]
    AP["project clones"]
  end
  subgraph B["Teammate B"]
    BC["control/ clone"]
    BP["project clones"]
  end
  AC -. push/pull .-> RC[("control remote")]
  BC -. push/pull .-> RC
  AP -. PRs .-> RP[("project remotes")]
  BP -. PRs .-> RP
  RC --- Only["the ONLY shared coordination infra (10 §3)"]
```

- **Coordination** converges at the **control remote** — the single shared piece of infrastructure (`10` §3). Both teammates' boards, chats, and memory sync through it.
- **Code** converges at each **project remote** as PRs.
- That's the entire "remote team" mechanism: clone the same repos, sync through the same remotes, nothing else between them (`00-vision` §9, `32` §5).

## 5. Team isolation as topology

Isolation isn't a firewall — it's that two teams are **different repo graphs**:

```mermaid
flowchart TB
  subgraph Core["Team: core"]
    CC[("control-core remote")]
    CP[("api / web remotes")]
  end
  subgraph Growth["Team: growth"]
    GC[("control-growth remote")]
    GP[("growth project remotes")]
  end
  CC -. collaborators: gerard, alice .- CC
  GC -. collaborators: bob, carol .- GC
  Core -. no shared repo .- Growth
```

Different control repos, different collaborator sets, different AUTO processes with different GitHub credentials (`12` §7, `20` §5). There's **no edge** between the two graphs — so "another team's agents talking to mine" has no path to traverse. Isolation is a property of the topology, requiring zero isolation code.

## 6. The id thread (one identity across the graph)

A single card id threads through the whole topology, making everything greppable by id (`14` §10):

```mermaid
flowchart LR
  Id["card id 0006"] --> Card["control: prds/*/0006-*.md"]
  Id --> Ledg["control: ledgers/0006/"]
  Id --> HB["control: status/0006-worker.json"]
  Id --> MemA["control: memory/agents/0006-worker/"]
  Id --> WT["project-api: ../.worktrees/0006 → feat/0006"]
  Id --> PR["api remote: PR for feat/0006"]
```

Follow `0006` and you find its card, AUTO's ledgers, the worker's heartbeat + memory, the worktree, the branch, and the PR — across both repos. The id is the join key of the whole system, no database needed.

## 7. Scale view (kernel → destination)

```mermaid
flowchart LR
  subgraph V1["v1 kernel"]
    K1["1 control"]
    K2["≤5 project repos"]
    K3["≤4 workers"]
  end
  subgraph Dest["destination"]
    D1["1 control (or multi-team: N control)"]
    D2["20+ project repos"]
    D3["more workers"]
  end
  V1 -->|"same topology, more nodes"| Dest
```

The topology **doesn't change** at scale — you register more `project_repos[]` in `config.yml` and raise `max_workers` (`27` §7). The "20 repos on the left" vision is this same graph with more project-repo nodes. v1 proves the loop at ≤5 repos / ≤4 workers (`00-vision` §8) before claiming 20 — earn the cathedral (principle #3).

---

**Related:** `27-multi-repo-workspace.md` (the topology in prose) · `10-system-architecture.md` (layers + control remote as sole shared infra) · `11-coordination-model.md` (control repo as backend) · `12-agent-runtime.md` (worktree-per-worker) · `14-data-model.md` (the id thread, integrity checks) · `34-diagram-components.md` (the host components that talk to this git side).
