# Maintenance (scheduled jobs)

Per-server **Maintenance** workspace tab for scheduled restart, wipe-after-restart, and
opt-in auto-update (#315). Jobs only run while YARK is open (tray-hidden is fine; quit is not) —
same honesty as [backups.md](backups.md) world schedule.

## Status

| Slice | Issue | State |
| --- | --- | --- |
| Tab + job model | #486 | In progress — policies, idle scheduler, Up next + schedule/warning editors (no execution) |
| Restart + broadcast | #487 | Pending |
| Wipe after restart | #488 | Pending |
| Auto-update (Steam newer) | #489 | Pending |

MagicPath UX mock: https://magicpath.ai/files/444694713119952896

## Building blocks

- Policies: SQLite `maintenance_policies` (migration 18), `MaintenanceRepository` / `MaintenanceService`
- Scheduler: `MaintenanceScheduler` (~60s coalesce), wired in `main/index.ts`
- IPC: `maintenance:get-policy` / `set-policy` / `clear-schedule-pause`
- UI: `features/maintenance/MaintenancePanel` on workspace tab `maintenance`
  - Up next empty / armed summary (Run now disabled until #487)
  - Collapsed Restart / Wipe / Auto-update with schedule + per-job warning presets persisted
  - Expand while Off shows the same controls disabled; turning Restart Off also clears wipe

## Product rules (epic)

- Default every job **off**
- Wipe On = after successful scheduled restart (no standalone wipe schedule in MVP)
- Auto-update On = Steam `buildid` newer via existing poll (~15 min cache) — no faster poll
- Per-job Broadcast presets/templates; last minute ≤60s = 1 Hz countdown (#487 / #489)
- Do not invent a second lifecycle stack — reuse restart / safe update / RCON

World backup schedule stays on the Backups tab; log retention stays in Settings.
