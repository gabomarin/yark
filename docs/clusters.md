# Clusters and transfer compliance

Profile-level checks for Cross-ARK Data Transfer setup: shared **Cluster ID**
and **cluster directory**. The Clusters page surfaces backend reports; it does
**not** validate live creature/item transfers on a running ASA host.

## Intent

- Group servers that share a `clusterId` and verify they can plausibly transfer.
- Catch common misconfigurations before launch (mismatched dirs, missing dir,
  port clashes, divergent mods).
- Guide operators via the Clusters page and the workspace onboarding checklist.

A cluster is **transfer-ready** (`ok: true`) when it has **no error-severity
issues**. Warnings alone (single server, mod mismatch) still leave `ok: true`.
Multiple servers on the same map in one cluster are allowed and not flagged.

## Module map

| Role | Path |
| --- | --- |
| Compliance rules | `src/backend/domains/cluster/compliance.ts` (`checkClusterCompliance`) |
| Instance facade | `src/backend/domains/instances/instance-service.ts` (`checkClusters`) |
| Launch args (cluster trio) | `src/backend/domains/instances/launch-args.ts` |
| Profile validation | `src/backend/domains/instances/validation.ts` |
| Port conflicts helper | `src/shared/port-conflicts.ts` (`findPortConflicts`) |
| Contracts | `src/shared/types.ts` (`ClusterComplianceReport`, `ClusterComplianceIssue`) |
| IPC channel | `src/shared/ipc.ts` (`cluster:check`) → `window.api.checkCluster()` |
| IPC handler | `src/main/ipc-handlers.ts` |
| Preload | `src/preload/index.ts` |
| Fleet UI | `src/renderer/src/features/clusters/` (`ClustersPage`, `clusterModel`, `createClusterModel`, `CreateClusterModal`) |
| Onboarding join | `src/renderer/src/features/server-workspace/components/ServerOnboardingChecklist/` |
| Visual helper | `scripts/visual-clusters.cjs` |

Reports refresh on App bootstrap/`refresh()` and whenever the Clusters view
opens (the page calls refresh on mount). There is no separate Recheck button.

## Profile fields

| Field | Type | Meaning |
| --- | --- | --- |
| `clusterId` | `string \| null` | Shared cluster name ID (`-clusterid=`) |
| `clusterDir` | `string \| null` | Shared storage path (`-ClusterDirOverride=`) — Windows absolute path |

### Validation (`validateProfileInput`)

- `clusterDir`, when set, must be a valid Windows absolute path.
- **`clusterId` without `clusterDir` is rejected** (“requires a cluster directory”).
- `clusterDir` **without** `clusterId` is allowed on save, but that server is
  **not** a cluster member for compliance (grouping keys only on `clusterId`).
  The Clusters empty state calls out these incomplete configs.

### Launch args

Only when **both** fields are non-null does `buildLaunchArgs` append:

```text
-clusterid={clusterId}
-ClusterDirOverride={clusterDir}
-NoTransferFromFiltering
```

See [server-lifecycle.md](server-lifecycle.md) for full argv order. Passwords,
RCON, and query port stay in INI — not on this trio.

Example (two maps, same cluster):

```ts
{
  clusterId: "my-fleet",
  clusterDir: "D:\\ASA\\SharedCluster",
  // …distinct game/query/RCON ports per member…
}
```

## Compliance rules

`checkClusterCompliance(profiles)`:

1. Skip profiles with `clusterId === null`.
2. Group remaining profiles by exact `clusterId` string.
3. For each group, emit issues and one `ClusterComplianceReport`.

| Condition | Severity | Effect on `ok` |
| --- | --- | --- |
| Fewer than 2 servers | `warning` | still `ok` |
| Members use different `clusterDir` values (incl. empty) | `error` | `ok: false` |
| A server has null/empty `clusterDir` | `error` | `ok: false` |
| Port conflict among servers (`game` / `query` / `rcon`) | `error` | `ok: false` |
| Sorted mod-id lists differ across servers | `warning` | still `ok` |

Port conflicts use `findPortConflicts(members)` — **only servers in that
cluster group**, not the whole fleet. Fleet-wide port checks live elsewhere
(form / onboarding).

`ok` is `!issues.some(i => i.severity === "error")`. `checkedAt` is an ISO
timestamp at evaluation time (not persisted).

Report shape:

```ts
{
  clusterId: string;
  ok: boolean;
  members: string[]; // profile ids
  issues: Array<{
    serverId: string | null;
    severity: "error" | "warning";
    message: string;
  }>;
  checkedAt: string; // ISO
}
```

## UI surfaces

### Clusters page

- Guidance card: both ID + directory required; page ≠ live transfer validation.
- **Create cluster** wizard: pick one or more stopped unclustered servers, set/generate a
  unique Cluster ID, choose a shared Windows directory, preview, then save
  membership via `servers:update` (no standalone cluster entity). Partial save
  failures roll profiles back to the previous cluster fields when possible.
- Summary badges: cluster count, ready (no errors), error clusters, warning-only
  clusters, unclustered servers (`clusterId === null`), dir-without-id count.
- Empty state when no reports: explains missing IDs; lists servers that have a
  directory but no ID, grouped by path; offers Create cluster when servers exist.
- List + detail: select a cluster, inspect members / shared dir / issues;
  “Open server” jumps to workspace.

### Server form / onboarding

- Form: edit `clusterId` / browse `clusterDir`.
- Clusters workspace: create a brand-new cluster ID + directory on one or more
  stopped servers (#42). Adding further servers later is separate (#41).
- Onboarding checklist: join an **existing** cluster by copying another
  server’s `{clusterId, clusterDir}` pair (or clear).

## Operator workflow

1. Pick one shared Windows folder for ARK cluster storage.
2. Create the cluster from **Clusters → Create cluster** (first stopped server),
   or set the same `clusterId` / `clusterDir` on each map (form or onboarding
   “join existing”).
3. Ensure distinct game / query / RCON ports across members.
4. Prefer matching CurseForge mod Project ID lists if players transfer mod items.
5. Open **Clusters** (compliance refreshes on open); fix any `error` issues
   before relying on transfers in-game.

## Constraints and non-goals

- **No live transfer probe** — reports are static profile math only.
- **No persistence** of reports — recomputed on each `cluster:check`.
- **No filesystem check** that `clusterDir` exists or is writable.
- Product target is **Windows**; path validation and ASA cluster dirs assume
  Windows-style absolute paths.

## Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Cluster missing from Clusters list | Server has `clusterDir` but null `clusterId` | Set both fields; reopen Clusters |
| `ok: false` / different directories | Typo or per-server dirs | Align `clusterDir` on every member |
| Port conflict error | Overlapping ports inside the cluster | Change ports on one member |
| Warning: only one server | Only one server tagged with that ID | Add another server or ignore if intentional |
| Warning: different mod lists | Divergent `mods` arrays | Align Project IDs if transfers matter |
| Launch missing `-clusterid=` | One of ID/dir is null | Both required for the CLI trio |
| Save rejected | `clusterId` set without `clusterDir` | Provide a Windows absolute cluster path |

## Tests and visual review

| Artifact | Coverage |
| --- | --- |
| `tests/unit/compliance.test.ts` | Ready cluster, ignore unclustered, single-server warning, dir mismatch, port conflict, mod mismatch |
| `src/renderer/src/features/clusters/ClustersPage.test.tsx` | Empty / ready / broken UI, dir-without-id copy, create-cluster wizard |
| `tests/unit/create-cluster-model.test.ts` | Eligibility, ID/dir validation, create input |
| `node scripts/visual-clusters.cjs` | Playwright sidebar → Clusters compliance UI |

Visible Clusters UI changes still follow [visual-testing.md](visual-testing.md)
(HD / Full HD / QHD).
