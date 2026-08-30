# Maintenance (scheduled jobs)

Per-server **Maintenance** workspace tab for scheduled restart, wipe-after-restart, and
opt-in auto-update (#315). Jobs only run while YARK is open (tray-hidden is fine; quit is not) —
same honesty as [backups.md](backups.md) world schedule.

## Status

| Slice | Issue | State |
| --- | --- | --- |
| Tab + job model | #486 | Done — policies, Up next shell, schedule/warning editors |
| Restart + broadcast | #487 | Done — countdown, 1 Hz last minute, Run now / Cancel |
| Wipe after restart | #488 | In progress — DestroyWildDinos after successful maintenance restart |
| Auto-update (Steam newer) | #489 | Pending |

MagicPath UX mock: https://magicpath.ai/files/444694713119952896

## Building blocks

- Policies: SQLite `maintenance_policies` (migration 18), `MaintenanceRepository` / `MaintenanceService`
- Restart runtime: `MaintenanceRestartRuntime` (countdown + Broadcast + `InstanceService.restart` + optional wipe)
- Scheduler: `MaintenanceScheduler` (~60s coalesce) arms windows when within the warning lead
- IPC: `maintenance:get-policy` / `set-policy` / `clear-schedule-pause` / `run-restart-now` / `cancel-upcoming`
- Shared schedule helpers: `src/shared/maintenance-schedule.ts` (offsets, next local time, templates, wipe settle)
- UI: `features/maintenance/MaintenancePanel` on workspace tab `maintenance`
  - Up next: empty / armed / live countdown / wiping; **Run restart now** / **Cancel window**
  - Collapsed Restart / Wipe / Auto-update with schedule + per-job warning presets
  - Expand while Off shows the same controls disabled; turning Restart Off also clears wipe
  - Fail-streak pause (3 consecutive) with Resume — session only, like world backup schedules

## Restart countdown (#487)

1. Scheduler tick finds an enabled restart within `max(offsets, 60s)` of the local target and the server is running.
2. Preset/custom offsets fire `Broadcast` once each as remaining crosses them.
3. Last ≤60s: 1 Hz `Restart in {n}s` regardless of preset; Cancel clears the timer immediately
   and skips that scheduled occurrence (no re-arm until the next local window).
4. At T0: `InstanceService.restart` (SaveWorld → DoExit → pre_restart backup → start). No second lifecycle stack.
5. Skip / fail gates:
   - Disabled / not running / already in countdown / session pause — do not arm
   - Operator/YARK intentional stop (`isStopInProgress` / status `stopping`|`stopped`) — abort without fail-streak (checked while process may still be live)
   - Transient RCON Broadcast errors — soft-fail up to 3 consecutive ticks, then hard-fail + fail-streak
   - Unexpected process death (typically status `error`) — abort + fail-streak
   - Fail-streak pause after 3 consecutive hard failures

## Wild wipe after restart (#488)

When **Wild dino wipe** is On (and restart is armed — turning wipe On enables restart):

1. After a **successful** maintenance restart (schedule or Run now), wait until status is `running`.
2. Ensure RCON, wait `MAINTENANCE_WIPE_POST_READY_MS` (~20s) for settle / wildlife spawn.
3. Optional `SaveWorld` when `wipeSaveWorldFirst` is true, then `DestroyWildDinos`.
4. Wipe failure is recorded (`lastWipeOk`) and logged as an event; it does **not** inflate the restart fail-streak.
5. Launch `-ForceRespawnDinos` (wipe on every start) stays on the Launch tab — unchanged.

Auto-update (#489) uses Steam-newer on the existing poll.

World backup schedule stays on the Backups tab; log retention stays in Settings.
