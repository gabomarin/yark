# Decomposition map (#146)

**Issue:** [#146](https://github.com/gabomarin/yark/issues/146) — Decompose oversized backend services and renderer pages  
**Status:** Phase 6 in progress — ConfigurationWizard + ServerForm and earlier slices removed from baseline; three grandfathered files remain; Phase 6 exit (all files ≤ cap) still pending  
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
| `backup-fleet.ts` | Fleet health row, alerts, disk usage aggregation, dismiss filter (+ unit tests) |
| `backup-restore.ts` | Pure restore planning: folder name preference, map-token resolve, world file filter, players layout assert, restore-history ownership (+ unit tests). Apply/orchestration still on `BackupService`. |
| `backup-portability.ts` | Pure import/export naming + disk-import guess helpers (+ unit tests). `parseBackupManifest` lives in `backup-archive.ts`. Export/import orchestration still on `BackupService`. |
| `backup-critical-jobs.ts` | Pure critical-job types, phase/status checks, context sanitize, merge, load disposition, retry plan (+ unit tests). Queue I/O and resume orchestration still on `BackupService`. |

### Phase 3 progress

| Module | Status |
| --- | --- |
| `update-critical-jobs.ts` | Pure update critical-job types, phase/status checks, context sanitize, merge, load omit/ambiguous, resume phase, reorder, cancel/pause eligibility (+ unit tests). Queue I/O and SteamCMD orchestration still on `UpdateService`. |
| `steamcmd-path.ts` | Pure SteamCMD path candidates, cached resolve, normalize, install PowerShell script, verify-exit decision, job-needs-exe (+ unit tests). Install/spawn/verify orchestration still on `UpdateService` (`steamcmd-operator` later). |
| `steamcmd-console.ts` | Pure SteamCMD console ring buffer, CR/LF chunk split, line prefix strip, progress log throttle (+ unit tests). Console state + emit still on `UpdateService`. |
| `update-server-jobs.ts` | Pure safe-update decisions: pre-update backup evidence, install-may-have-changed, log path/content, interrupted-job recovery on load (+ unit tests). Install/update/verify orchestration still on `UpdateService`. |
| `update-queue.ts` | Pure queue flow: next-job selection, handler routing, pause/cancel/failure disposition, persisted-row validation (+ unit tests). Queue I/O and `processQueue` orchestration still on `UpdateService`. |
| `steamcmd-operator.ts` | Pure SteamCMD operator copy/progress: cache/sync labels, invoke console lines, status derivation, disk-progress preference (+ unit tests). Spawn/install/verify orchestration still on `UpdateService`. |

**Phase 3 exit:** `update-service.ts` is a coordinator; SteamCMD + queue decisions live in siblings above. Further shrinks are optional orchestration moves only.

### Phase 4 progress

| Module | Status |
| --- | --- |
| `instance-lifecycle.ts` | Pure stop progress copy, backup labels, fleet id compare, bounded `mapPool` (+ unit tests). Start/stop orchestration still on `InstanceService`. |
| `instance-profile.ts` | Pure session port validation/apply, fleet inspect key and scan gate (+ unit tests). CRUD/clone/import orchestration still on `InstanceService`. |
| `instance-crash.ts` | Pure unexpected-exit event/notify planning (+ unit tests). `recordUnexpectedProcessExit` orchestration still on `InstanceService`. |
| `process-spawn.ts` | Pure ASA launch log/console flags and Windows verbatim spawn (+ unit tests). `ProcessManager.start` orchestration still on `ProcessManager`. |
| `process-readiness.ts` | Pure ready-log detection, RCON probe delay, runtime log ring (+ unit tests). `waitUntilReady` / log capture still on `ProcessManager`. |
| `process-stop.ts` | Pure unexpected-exit classification and last-error copy (+ unit tests). Graceful stop/kill orchestration still on `ProcessManager`. |

**Phase 4 exit:** `instance-service.ts` and `process-manager.ts` are coordinators; lifecycle/profile/crash and spawn/readiness/stop decisions live in siblings above. Optional: `instance-rcon.ts` trim, further orchestration moves.

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
| `App.tsx` (~1571 lines) | Wired to fleet + RCON hooks; fewer inline effects |

**Phase 5c exit:** Fleet refresh and RCON lifted into hooks; INI editor table/filter extracted. Optional: further `App.tsx` shrink via grouped props/context; text-mode/header splits for `ConfigurationEditor`.

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
| Remaining grandfathered (3) | `ServerBackupPanel`, `ServerLogsPanel`, `configurationWizardModel` |

**Phase 6 exit:** No entries in `component-structure-baseline.json`; optional backend line gate.


## Backend: `backup-service.ts`

**Already extracted:** `backup-scheduler.ts`, `backup-archive.ts`, `world-snapshot.ts`, `player-session-watcher.ts`, `backup-disk.ts`, `list-players.ts`.

**Still inside god-class:**

| Concern | Approx. responsibility | Proposed module |
| --- | --- | --- |
| Policy + fleet summary | CRUD policy, disk alerts, fleet health rows | `backup-fleet.ts` |
| Cleanup preview/run | Retention rules, orphan import, delete marks | `backup-cleanup.ts` |
| Restore + rollback | World/players/INI apply + critical-job resume still on service; pure planning helpers in `backup-restore.ts` | later: apply orchestration / `backup-critical-jobs.ts` |
| Import/export portability | Export/import apply still on service; pure naming/guess helpers in `backup-portability.ts`; manifest parse in `backup-archive.ts` | later: orchestration move if needed |
| Critical jobs | Queue I/O + resume still on service; pure phase/merge/retry/load helpers in `backup-critical-jobs.ts` | later: enqueue/processQueue move if needed |
| Zip pipeline / staging | Archive create, **manifest parse**, retention prune | extend `backup-archive.ts` (manifest parse landed) |

**Public surface to keep stable:** IPC handlers in main; exported `computeBackupServerHealth`, `CRITICAL_BACKUP_KINDS`, `BackupService` method signatures.

**Characterization:** `backup-service.test.ts` is the anchor (~2.5k lines). Extend before moving cleanup/restore blocks.

---

## Backend: `update-service.ts`

**Already extracted:** `robocopy-tree.ts`, `steamcmd-content-cache.ts`, `steamcmd-disk-progress.ts`, `update-critical-jobs.ts`, `steamcmd-path.ts`, `steamcmd-console.ts`, `update-server-jobs.ts`, `update-queue.ts`, `steamcmd-operator.ts`.

**Still inside coordinator (by design):**

| Concern | Notes |
| --- | --- |
| Queue I/O + `processQueue` | Uses pure helpers from `update-queue.ts` / `update-critical-jobs.ts` |
| SteamCMD spawn/install/verify | Uses pure helpers from `steamcmd-path.ts`, `steamcmd-console.ts`, `steamcmd-operator.ts` |
| Disk progress monitor | Thin wrapper; logic in `steamcmd-disk-progress.ts` |

---

## Backend: `instance-service.ts`

**Already extracted:** `move-install-service.ts`, `import-existing-install.ts`, `clone-install-copy.ts`, `clone-ini-seed.ts`, `launch-args.ts`, `ban-list.ts`, `server-installation.ts`, `validation.ts`, `sync-profile-ini.ts`, `auto-start.ts`, `instance-lifecycle.ts`, `instance-profile.ts`, `instance-crash.ts`, …

**Still inside coordinator (by design):**

| Concern | Notes |
| --- | --- |
| CRUD + clone/import orchestration | Uses pure helpers from `instance-profile.ts` where applicable |
| Start/restart/stop/kill lifecycle | Uses pure helpers from `instance-lifecycle.ts`; orchestration on `InstanceService` |
| RCON + players + bans | Optional `instance-rcon.ts` trim; `ban-list.ts` already extracted |
| Installation probe / health | Uses `instance-profile.ts` fleet inspect helpers + `server-installation.ts` |

**Characterization:** Good spread across `instance-*.test.ts`; add one integration-style test for stop→backup→start ordering before lifecycle split.

---

## Backend: `process-manager.ts`

**Already extracted:** `process-spawn.ts`, `process-readiness.ts`, `process-stop.ts`.

| Concern | Notes |
| --- | --- |
| Spawn + argv | Uses pure helpers from `process-spawn.ts` |
| Graceful stop / kill / leave-reattach | Uses pure helpers from `process-stop.ts`; orchestration on `ProcessManager` |
| Readiness (RCON/log tail) | Uses pure helpers from `process-readiness.ts`; coordinates with `asa-log-tail`, RCON |
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
