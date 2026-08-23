# Decomposition map (#146)

**Issue:** [#146](https://github.com/gabomarin/yark/issues/146) — Decompose oversized backend services and renderer pages  
**Status:** Complete for ticket scope — renderer feature baselines empty; optional backend line gate live with three grandfathered coordinators; `App.tsx` shrunk via shell hooks  
**Policy:** `scripts/component-structure-baseline.json`, `scripts/backend-structure-baseline.json`, [component-structure.md](component-structure.md)

## Goal

Reduce change coupling by extracting cohesive modules **without** changing externally observable behavior. One reviewable PR per slice; remove size baselines as files shrink.

## Mega-files (2026-08-23)

| File | Lines | Baseline? | Primary tests |
| --- | ---: | --- | --- |
| `src/backend/domains/backups/backup-service.ts` | ~1,550 | Backend grandfathered | `tests/unit/backup-service.test.ts`, `backup-archive.test.ts`, … |
| `src/backend/domains/instances/instance-service.ts` | ~937 | Backend grandfathered | `instance-*.test.ts` |
| `src/backend/domains/instances/move-install-service.ts` | ~1,203 | Backend grandfathered | move-install unit/E2E |
| `src/renderer/src/App.tsx` | ~715 | Outside `features/` gate | `App.test.tsx` |

Cleared from baseline (≤800): `update-service.ts` (~732), `server-installation.ts` (~505).

Renderer **feature** files previously listed here are under the standard TSX/TS caps (Phase 6). Further backend shrinks remove rows from `backend-structure-baseline.json`.

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
| `backup-fleet.ts` | Fleet health row, alerts, disk usage aggregation, dismiss filter (+ unit tests) |
| `backup-restore.ts` | Pure restore planning: folder name preference, map-token resolve, world file filter, players layout assert, restore-history ownership (+ unit tests). Apply/orchestration still on `BackupService`. |
| `backup-portability.ts` | Pure import/export naming + disk-import guess helpers (+ unit tests). `parseBackupManifest` lives in `backup-archive.ts`. Export/import orchestration still on `BackupService`. |
| `backup-critical-jobs.ts` | Pure critical-job types, phase/status checks, context sanitize, merge, load disposition, and retry plan (+ unit tests). |
| `backup-critical-queue.ts` | Durable queue I/O/recovery, waiters, and cancellation/retry state machine; `BackupService` keeps thin facades. |
| `backup-critical-job-executor.ts` | Pre-update and restore resume execution behind the queue's narrow, directly testable executor seam. |
| `backup-package.ts` | World, player-profile, and INI package staging plus shared safe copy/list helpers. |
| `backup-reconcile.ts` | Serialized disk/DB reconciliation, interrupted-create recovery, missing-row pruning, and archive import. |
| `backup-restore-apply.ts` | ZIP/folder restore application for world, player-profile, and INI backups. |

### Phase 3 progress

| Module | Status |
| --- | --- |
| `update-critical-jobs.ts` | Pure update critical-job types, phase/status checks, context sanitize, merge, load omit/ambiguous, resume phase, reorder, cancel/pause eligibility (+ unit tests). Queue I/O and SteamCMD orchestration still on `UpdateService`. |
| `steamcmd-path.ts` | Pure SteamCMD path candidates, cached resolve, normalize, install PowerShell script, verify-exit decision, job-needs-exe (+ unit tests). Install/spawn/verify orchestration still on `UpdateService` (`steamcmd-operator` later). |
| `steamcmd-console.ts` | Pure SteamCMD console ring buffer, CR/LF chunk split, line prefix strip, progress log throttle (+ unit tests). Console state + emit still on `UpdateService`. |
| `update-server-jobs.ts` | Pure safe-update decisions: pre-update backup evidence, install-may-have-changed, log path/content, interrupted-job recovery on load (+ unit tests). Install/update/verify orchestration still on `UpdateService`. |
| `update-queue.ts` | Pure queue flow: next-job selection, handler routing, pause/cancel/failure disposition, persisted-row validation (+ unit tests). Queue I/O and `processQueue` orchestration still on `UpdateService`. |
| `steamcmd-operator.ts` | Pure SteamCMD operator copy/progress: cache/sync labels, invoke console lines, status derivation, disk-progress preference (+ unit tests). Spawn/install/verify orchestration still on `UpdateService`. |
| `update-perform.ts` / `steamcmd-run.ts` | Install/update/verify safety orchestration and SteamCMD cache/run orchestration; `UpdateService` keeps thin queue-facing facades and shared runtime state. |
| `update-queue-runtime.ts` | Durable queue load/persist/recovery, waiters, operator actions, and processing orchestration; `UpdateService` keeps compatibility facades. |
| `steamcmd-progress-runtime.ts` | SteamCMD console buffers, live/paused progress, disk estimates, and active process/sync runtime state. |
| `steamcmd-install.ts` | SteamCMD install/discover/verify/path persistence; `UpdateService` keeps thin public facades. |
| `steamcmd-control.ts` | Cancel/pause orchestration against progress + queue runtime via a narrow host. |

**Phase 3 exit:** `update-service.ts` is a coordinator (≤800); SteamCMD + queue decisions live in siblings above.

### Phase 4 progress

| Module | Status |
| --- | --- |
| `instance-lifecycle.ts` | Pure stop progress copy, backup labels, fleet id compare, bounded `mapPool` (+ unit tests). Start/stop orchestration still on `InstanceService`. |
| `instance-profile.ts` | Pure session port validation/apply, fleet inspect key and scan gate (+ unit tests). CRUD/clone/import orchestration still on `InstanceService`. |
| `instance-crash.ts` | Pure unexpected-exit event/notify planning (+ unit tests). `recordUnexpectedProcessExit` orchestration still on `InstanceService`. |
| `instance-stop.ts` | Stop job coalescing, restart critical-job tracking, quit fan-out, graceful stop/backup orchestration, and progress emission; `InstanceService` keeps lifecycle facades. |
| `process-spawn.ts` | Pure ASA launch log/console flags and Windows verbatim spawn (+ unit tests). `ProcessManager.start` orchestration still on `ProcessManager`. |
| `process-readiness.ts` | Pure ready-log detection, RCON probe delay, runtime log ring (+ unit tests). |
| `process-ready-wait.ts` | Readiness wait orchestration (RCON poll / settle / timeout / reattach); `ProcessManager.waitUntilReady` is a thin facade. |
| `process-stop.ts` | Pure unexpected-exit classification and last-error copy (+ unit tests). Graceful stop/kill orchestration still on `ProcessManager`. |
| `process-leave.ts` | Leave-running identity collect / detach / reattach; `ProcessManager` keeps thin facades. |
| `process-graceful-stop.ts` | SaveWorld → DoExit graceful stop begin/finish; `ProcessManager` keeps thin facades. |
| `instance-fleet-install.ts` | Fleet installation inspect, coalesce, and health-memory events; `InstanceService` keeps thin facades (#427). |
| `install-steam-build.ts` / `official-ark-probe.ts` / `install-health.ts` | Split from `server-installation.ts` (now ≤800). |

**Phase 4 exit:** `instance-service.ts` and `process-manager.ts` are coordinators; lifecycle/profile/crash/stop/fleet-install and spawn/readiness/leave/stop decisions live in siblings above.

### Phase 5 progress

| Surface | Extracted | Coordinator |
| --- | --- | --- |
| `ServerLogsPanel.tsx` (706 lines) | `LogsPanelChrome`, `LogsEventsTab`, `LogsUpdatesTab`, `LogsBackupsTab` | Tab shell, IPC, focus routing |
| `BackupsPage.tsx` (544 lines) | `backupsPageModel`, `BackupVolumeStrip`, `ServerHealthCard`, `BackupDiskAlertModal`, `BackupCleanupModal` | Fleet load/save, filters |
| `ServerBackupPanel.tsx` (829 lines) | `serverBackupPanelModel`, `BackupKindSettings`, `BackupListToolbar` | Per-server backup CRUD, autosave |
| `ConfigurationWizard.tsx` (651 lines) | `wizardSteps`, six step panels, `WizardChangesModal`, `WizardFooter` | INI load/apply, preset choosers |
| `App.tsx` (2172 lines) | `appOverlay`, `steamCmdShellModel`, `AppMainRouter` | Fleet poll, RCON, SteamCMD jobs, modals |

### Phase 5b progress

| Module | Status |
| --- | --- |
| `appShellChrome.ts` | Shared `AppShellWithChrome` wrapper for overlay routes |
| `AppWorkspaceOverlay.tsx` | Workspace branch (`ServerWorkspacePage` + files-job state) |
| `AppFormOverlays.tsx` | Create / edit `ServerForm` overlays |
| `AppRouterPages.tsx` | Sidebar routes via `AppRouter` (overview, downloads, clusters, logs, backups, settings) |
| `workspaceFilesJobState.ts` | Pure files-job props for workspace overlay (+ unit tests) |
| `AppMainRouter.tsx` (~267 lines) | Thin overlay switch; props still passed from `App.tsx` |

**Phase 5b exit:** `AppMainRouter` is a small switch; each overlay organism owns its branch.

### Phase 5c progress

| Module | Status |
| --- | --- |
| `useAppFleetRefresh.ts` (~413 lines) | Fleet poll, install scan, SteamCMD/status IPC, `refresh` / `runInstallHealthScan` |
| `useAppRcon.ts` (~280 lines) | RCON history, player list, kick/ban/send handlers |
| `ConfigurationEditorFilterBar.tsx` | Search/filter bar for INI settings table |
| `IniSettingRow.tsx` | Single INI setting row (value editor, reset, dirty state) |
| `ConfigurationEditorSettingsTable.tsx` | Virtualized settings table shell |
| `ConfigurationEditor.tsx` (575 lines) | Coordinator: text mode, header toolbar, load/save still in parent |
| `App.tsx` (~716 lines) | Wired to fleet, RCON, onboarding, SteamCMD action, server lifecycle, and server update hooks |

**Phase 5c optional exit:** `useAppOnboarding`, `useAppSteamCmdActions`, `useAppServerLifecycle`, and `useAppServerUpdates` now own the remaining large shell workflows. `App.tsx` is a thin composition coordinator; grouped router props/context remain optional.

**Phase 5 exit:** Grandfathered feature pages are organisms + thin coordinators.

### Phase 6 progress

| Item | Status |
| --- | --- |
| `ServerModsPanel.tsx` (345 lines) | Removed from baseline (≤ 350 TSX cap) |
| `iniModel.ts` (380 lines) | Removed from baseline (≤ 450 TS cap) |
| `ServerWorkspacePage.tsx` (339 lines) | `WorkspaceCompactDrawers` extracted; removed from baseline |
| `ClusterIniTemplateModal.tsx` (321 lines) | `ClusterIniTemplateModalFooter` extracted; removed from baseline |
| `ConfigurationEditor.tsx` (485 lines) | Header, text panel, preview alert extracted; baseline lowered to 480 |
| `BackupsPage.tsx` (152 lines) | `useBackupsPageFleet` hook + `BackupsPageServerSection`; removed from baseline |
| `ConfigurationEditor.tsx` (162 lines) | `useConfigurationEditor` hook + status/open-file organisms; removed from baseline |
| `ServerForm.tsx` | `useServerForm` hook + `ServerFormEmbedded`; removed from baseline |
| `ConfigurationWizard.tsx` | `useConfigurationWizard` + `configurationWizardChoosers`; removed from baseline |
| `configurationWizardModel.ts` (3 lines) | Presets, INI mapping/operations, and shared types split into pure sibling modules; facade preserves existing imports; removed from baseline |
| `ServerLogsPanel.tsx` | State, focus/load generations, runtime polling, and IPC actions moved to `useServerLogsPanel` + `serverLogsPanelActions`; removed from baseline |
| `ServerBackupPanel.tsx` | Load generations, quiet polling, autosave, selection, restore, and CRUD moved to `useServerBackupPanel` + `serverBackupPanelActions`; removed from baseline |
| Remaining grandfathered (0) | Renderer baseline `files` map is empty |
| Backend line gate | `backend-structure-baseline.json` — new backend `.ts` ≤ 800; three grandfathered coordinators |

**Phase 6 exit:** Achieved — empty renderer `component-structure-baseline.json` `files` map; optional backend line gate enforced via `backend-structure-baseline.json` (new `src/backend` `.ts` ≤ 800; three grandfathered coordinators).


## Backend: `backup-service.ts`

**Already extracted:** `backup-scheduler.ts`, `backup-archive.ts`, `world-snapshot.ts`, `player-session-watcher.ts`, `backup-disk.ts`, `list-players.ts`.

**Still inside god-class:**

| Concern | Approx. responsibility | Proposed module |
| --- | --- | --- |
| Policy + fleet summary | CRUD policy, disk alerts, fleet health rows | `backup-fleet.ts` |
| Cleanup preview/run | Retention rules, orphan import, delete marks | `backup-cleanup.ts` |
| Restore + rollback | Apply orchestration is in `backup-restore-apply.ts`; critical-job resume is in `backup-critical-job-executor.ts`; pure planning helpers remain in `backup-restore.ts` | optional further restore API extraction |
| Import/export portability | Disk archive discovery/import is in `backup-reconcile.ts`; explicit export/import APIs remain on service with pure naming helpers in `backup-portability.ts` | later: explicit portability orchestration if needed |
| Critical jobs | Queue I/O/recovery/cancellation and `processQueue` are in `backup-critical-queue.ts`; resume execution is in `backup-critical-job-executor.ts`; pure helpers remain in `backup-critical-jobs.ts` | extracted in #427 Track A slice 1 |
| Zip pipeline / staging | Package staging is in `backup-package.ts`; archive create and retention remain on service; manifest parsing lives in `backup-archive.ts` | optional archive orchestration move |

**Public surface to keep stable:** IPC handlers in main; exported `computeBackupServerHealth`, `CRITICAL_BACKUP_KINDS`, `BackupService` method signatures.

**Characterization:** `backup-service.test.ts` is the anchor (~2.5k lines). Extend before moving cleanup/restore blocks.

---

## Backend: `update-service.ts`

**Already extracted:** `robocopy-tree.ts`, `steamcmd-content-cache.ts`, `steamcmd-disk-progress.ts`, `update-critical-jobs.ts`, `steamcmd-path.ts`, `steamcmd-console.ts`, `update-server-jobs.ts`, `update-queue.ts`, `update-queue-runtime.ts`, `steamcmd-operator.ts`, `steamcmd-progress-runtime.ts`, `update-perform.ts`, `steamcmd-run.ts`.

**Still inside coordinator (by design):**

| Concern | Notes |
| --- | --- |
| Queue I/O + `processQueue` | Runtime orchestration lives in `update-queue-runtime.ts`; pure decisions remain in `update-queue.ts` / `update-critical-jobs.ts` |
| File job execution | Thin facades delegate install/update/verify safety orchestration to `update-perform.ts` |
| SteamCMD spawn/install/verify | `steamcmd-run.ts` owns cache/update/sync execution and calls back into shared progress/cancellation state |
| SteamCMD console/progress state | Runtime state and disk-monitor orchestration live in `steamcmd-progress-runtime.ts`; disk decisions remain in `steamcmd-disk-progress.ts` |

---

## Backend: `instance-service.ts`

**Already extracted:** `move-install-service.ts`, `import-existing-install.ts`, `clone-install-copy.ts`, `clone-ini-seed.ts`, `instance-clone.ts`, `instance-rcon.ts`, `instance-stop.ts`, `launch-args.ts`, `ban-list.ts`, `server-installation.ts`, `validation.ts`, `sync-profile-ini.ts`, `auto-start.ts`, `instance-lifecycle.ts`, `instance-profile.ts`, `instance-crash.ts`, …

**Still inside coordinator (by design):**

| Concern | Notes |
| --- | --- |
| CRUD + import orchestration | Uses pure helpers from `instance-profile.ts` where applicable; clone orchestration lives in `instance-clone.ts` |
| Start/restart/stop/kill lifecycle | Stop pipeline and in-flight job ownership live in `instance-stop.ts`; `InstanceService` keeps restart/start/kill and public facades |
| RCON + players + bans | Session, E2E mock, auto-connect, player, and ban orchestration live in `instance-rcon.ts`; `InstanceService` keeps facades |
| Installation probe / health | Uses `instance-profile.ts` fleet inspect helpers + `server-installation.ts` |

**Characterization:** Good spread across `instance-*.test.ts`; add one integration-style test for stop→backup→start ordering before lifecycle split.

---

## Backend: `process-manager.ts`

**Already extracted:** `process-spawn.ts`, `process-readiness.ts`, `process-ready-wait.ts`, `process-stop.ts`.

| Concern | Notes |
| --- | --- |
| Spawn + argv | Uses pure helpers from `process-spawn.ts` |
| Graceful stop / kill / leave-reattach | Uses pure helpers from `process-stop.ts`; orchestration on `ProcessManager` |
| Readiness (RCON/log tail) | Pure helpers in `process-readiness.ts`; wait loop in `process-ready-wait.ts`; log capture still on `ProcessManager` |
| Runtime state machine | `ProcessManager` remains thin coordinator |

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
