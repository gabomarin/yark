# Decomposition map (#146)

**Issue:** [#146](https://github.com/gabomarin/yark/issues/146) — Decompose oversized backend services and renderer pages  
**Status:** Phase 1 (architecture map + test inventory)  
**Policy:** `scripts/component-structure-baseline.json`, [component-structure.md](component-structure.md)

## Goal

Reduce change coupling by extracting cohesive modules **without** changing externally observable behavior. One reviewable PR per slice; remove size baselines as files shrink.

## Mega-files (2026-08-22)

| File | Lines | Baseline? | Primary tests |
| --- | ---: | --- | --- |
| `src/backend/domains/backups/backup-service.ts` | 3,779 | — (backend not gated) | `tests/unit/backup-service.test.ts`, `backup-archive.test.ts`, `backup-scheduler.test.ts`, … |
| `src/backend/domains/updates/update-service.ts` | 2,916 | — | `tests/unit/update-service-safe-update.test.ts`, `critical-job-restart-integration.test.ts`, integration steamcmd |
| `src/backend/domains/instances/instance-service.ts` | 2,087 | — | `tests/unit/instance-*.test.ts` (stop, restart, rcon, clone, …) |
| `src/backend/infra/process/process-manager.ts` | 1,266 | — | `tests/unit/process-manager-*.test.ts`, `process-manager-real-start.test.ts` |
| `src/renderer/src/App.tsx` | 2,509 | No (outside `features/` gate) | `src/renderer/src/App.test.tsx` |
| `features/backups/BackupsPage.tsx` | 1,058 | Yes | `BackupsPage.test.tsx` |
| `features/backups/ServerBackupPanel.tsx` | 1,170 | Yes | `ServerBackupPanel.test.tsx` |
| `features/logs/ServerLogsPanel.tsx` | 1,099 | Yes | `ServerLogsPanel.test.tsx` |
| `features/server-workspace/components/ConfigurationWizard/ConfigurationWizard.tsx` | 1,060 | Yes | `ServerWorkspacePage.test.tsx`, `configuration-wizard-model.test.ts` |
| `features/server-workspace/configurationWizardModel.ts` | 1,085 | Yes | `configuration-wizard-model.test.ts` |
| `features/server-workspace/components/ConfigurationEditor/ConfigurationEditor.tsx` | 732 | Yes | `ServerWorkspacePage.test.tsx`, `iniModel` tests |
| `features/servers/components/ServerForm/ServerForm.tsx` | 588 | Yes | `ServerForm.test.tsx` |
| `features/server-workspace/components/ServerModsPanel/ServerModsPanel.tsx` | 351 | Yes | `ServerModsPanel.test.tsx` |

Renderer rows already have **future extraction boundaries** in [component-structure.md](component-structure.md#deferred-structural-migrations).

## Dependency direction (must hold after every slice)

```text
main/ipc handlers  →  domain services  →  infra adapters  →  node/fs/process
renderer pages     →  feature models/hooks  →  shared/ui + layout
```

- Domain services must not import renderer code.
- Extracted modules expose **narrow facades**; callers keep stable IPC / `RendererApi` contracts.
- No new circular imports between domains (backups ↔ updates ↔ instances go through existing orchestration in main, not cross-domain service imports).

## Phased plan (from #146)

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **1** | This map + test inventory | Every targeted file has boundaries + tests listed |
| **2** | Backup service | `backup-service.ts` shrinks; cleanup/restore/zip/fleet split to siblings under `domains/backups/` |
| **3** | Update service | Queue/SteamCMD/disk-progress/critical-job slices under `domains/updates/` |
| **4** | Instance + process | Stop/start/RCON vs spawn/readiness split; `process-manager` spawn/readiness helpers |
| **5** | Renderer pages | Per `component-structure.md` deferred table + `App.tsx` shell extraction |
| **6** | Policy | Remove renderer baselines; optional backend line gate |

### Phase 2 progress

| Module | Status |
| --- | --- |
| `backup-policy-helpers.ts` | `ALL_BACKUP_KINDS`, `retainCountForKind`, `assertRetainCount` |
| `backup-cleanup-plan.ts` | Pure `planBackupCleanup` + `summarizeCleanupPlan` (+ unit tests) |
| `backup-fleet.ts` | Pending |
| `backup-restore.ts` | Pending |


## Backend: `backup-service.ts`

**Already extracted:** `backup-scheduler.ts`, `backup-archive.ts`, `world-snapshot.ts`, `player-session-watcher.ts`, `backup-disk.ts`, `list-players.ts`.

**Still inside god-class:**

| Concern | Approx. responsibility | Proposed module |
| --- | --- | --- |
| Policy + fleet summary | CRUD policy, disk alerts, fleet health rows | `backup-fleet.ts` |
| Cleanup preview/run | Retention rules, orphan import, delete marks | `backup-cleanup.ts` |
| Restore + rollback | World/players/INI restore, pre-restore safety zip | `backup-restore.ts` |
| Import/export portability | Operator zip export/import | `backup-portability.ts` (align with renderer `backupPortability.ts`) |
| Critical jobs | Job registry, retry/dismiss/cancel | `backup-critical-jobs.ts` (shared pattern with updates) |
| Zip pipeline / staging | Archive create, manifest, retention prune | extend `backup-archive.ts` |

**Public surface to keep stable:** IPC handlers in main; exported `computeBackupServerHealth`, `CRITICAL_BACKUP_KINDS`, `BackupService` method signatures.

**Characterization:** `backup-service.test.ts` is the anchor (~2.5k lines). Extend before moving cleanup/restore blocks.

---

## Backend: `update-service.ts`

**Already extracted:** `robocopy-tree.ts`, `steamcmd-content-cache.ts`, `steamcmd-disk-progress.ts`.

**Still inside god-class:**

| Concern | Proposed module |
| --- | --- |
| Critical job queue + recovery | `update-critical-jobs.ts` |
| SteamCMD install/path/console | `steamcmd-operator.ts` |
| Per-server install/update/verify jobs | `update-server-jobs.ts` |
| Queue processor + waiter coordination | `update-queue.ts` |
| Disk progress monitor (orchestration) | keep thin wrapper; logic stays in `steamcmd-disk-progress.ts` |

**Characterization gaps:** Only `update-service-safe-update.test.ts` targets UpdateService directly. Add characterization tests for queue ordering and cancel/pause **before** phase 3 extractions.

---

## Backend: `instance-service.ts`

**Already extracted:** `move-install-service.ts`, `import-existing-install.ts`, `clone-install-copy.ts`, `clone-ini-seed.ts`, `launch-args.ts`, `ban-list.ts`, `server-installation.ts`, `validation.ts`, `sync-profile-ini.ts`, `auto-start.ts`, …

**Still inside god-class:**

| Concern | Proposed module |
| --- | --- |
| CRUD + clone/import orchestration | `instance-profile.ts` |
| Start/restart/stop/kill lifecycle | `instance-lifecycle.ts` |
| RCON + players + bans | `instance-rcon.ts` (or split ban-list further) |
| Installation probe / health | lean on `server-installation.ts`; trim service to facade |

**Characterization:** Good spread across `instance-*.test.ts`; add one integration-style test for stop→backup→start ordering before lifecycle split.

---

## Backend: `process-manager.ts`

| Concern | Proposed module |
| --- | --- |
| Spawn + argv + working dir | `process-spawn.ts` |
| Graceful stop / kill / leave-reattach | `process-stop.ts` |
| Readiness (RCON/log tail) | `process-readiness.ts` (coordinates with `asa-log-tail`, RCON) |
| Runtime state machine | keep `ProcessManager` as thin coordinator |

**Characterization:** `process-manager-lifecycle.test.ts`, `process-manager-leave.test.ts`, real-start integration.

---

## Renderer: `App.tsx`

Not in the feature size gate but highest renderer coupling risk (~2.5k lines).

| Concern | Proposed module |
| --- | --- |
| SteamCMD card / downloads dock state | `app/steamCmdShellModel.ts` + organism |
| Navigation + leave guards | `app/navigationModel.ts` (partially exists as hooks) |
| Server list refresh / polling | `app/serverFleetModel.ts` or hook under `features/overview/` |
| Settings / setup wizard orchestration | keep callbacks; move heavy handlers to feature hooks |

**Characterization:** `App.test.tsx` covers empty fleet, setup wizard, Start busy guard, SteamCMD UX. Extend before extracting refresh/poll block.

---

## Renderer: grandfathered feature pages

Follow [component-structure.md § Deferred structural migrations](component-structure.md#deferred-structural-migrations). **One organism per PR** (e.g. `BackupsPage` cleanup modal → `BackupCleanupModal.tsx`).

Suggested order (compiler + React Doctor friendly):

1. `ServerLogsPanel` — event list + update viewer (already named in deferred table)
2. `BackupsPage` — fleet metrics vs per-server policy table
3. `ConfigurationWizard` — per-step panels (model already split partially)
4. `ServerBackupPanel` — kind settings vs history table
5. `App.tsx` shell

---

## PR checklist (every slice)

- [ ] Characterization/regression tests green **before** move (or added in same PR for the block being cut)
- [ ] No IPC / operator behavior change unless documented
- [ ] `npm run typecheck`, `lint`, `knip`, `tests`; E2E if UI selectors move
- [ ] Shrink file below baseline cap **or** do not raise baseline (prefer shrink)
- [ ] Update this doc + domain runbook if public boundaries change
- [ ] `CHANGELOG.md` under `[Unreleased]` when operator-visible

## Related

- [#404](https://github.com/gabomarin/yark/issues/404) React Compiler — postpone default; giant files are top skip reason
- [#403](https://github.com/gabomarin/yark/issues/403) React Doctor baseline
- Notion **ADR-007** — React Compiler postponed; reconsider after #146 renderer splits
