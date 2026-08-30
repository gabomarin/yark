# Maintenance (scheduled jobs)

Per-server **Maintenance** workspace tab for scheduled restart, wipe-after-restart, and
opt-in auto-update (#315). Jobs only run while YARK is open (tray-hidden is fine; quit is not) —
same honesty as [backups.md](backups.md) world schedule.

## Status

| Slice | Issue | State |
| --- | --- | --- |
| Tab + job model | #486 | Done — policies, Up next shell, schedule/warning editors |
| Restart + broadcast | #487 | In progress — countdown, 1 Hz last minute, Run now / Cancel |
| Wipe after restart | #488 | Pending |
| Auto-update (Steam newer) | #489 | Pending |

MagicPath UX mock: https://magicpath.ai/files/444694713119952896

## Building blocks

- Policies: SQLite `maintenance_policies` (migration 18), `MaintenanceRepository` / `MaintenanceService`
- Restart runtime: `MaintenanceRestartRuntime` (countdown + Broadcast + `InstanceService.restart`)
- Scheduler: `MaintenanceScheduler` (~60s coalesce) arms windows when within the warning lead
- IPC: `maintenance:get-policy` / `set-policy` / `clear-schedule-pause` / `run-restart-now` / `cancel-upcoming`
- Shared schedule helpers: `src/shared/maintenance-schedule.ts` (offsets, next local time, templates)
- UI: `features/maintenance/MaintenancePanel` on workspace tab `maintenance`
  - Up next: empty / armed / live countdown; **Run restart now** (confirm → ~10s window) / **Cancel window**
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
   - Transient RCON Broadcast errors during warning / last-minute — soft-fail (retry next tick); do **not** abort the window or inflate fail-streak
   - Unexpected process death during countdown — abort + fail-streak
   - Operator/YARK intentional stop (`isStopInProgress` / status `stopping`) — abort without fail-streak
   - Fail-streak pause after 3 consecutive hard failures (restart execute / unexpected stop)

Wipe (#488) runs after a successful maintenance restart. Auto-update (#489) uses Steam-newer on the existing poll.

World backup schedule stays on the Backups tab; log retention stays in Settings.
