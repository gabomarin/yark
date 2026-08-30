# Maintenance (scheduled jobs)

Per-server **Maintenance** workspace tab for scheduled restart, wipe-after-restart, and
opt-in auto-update (#315). Jobs only run while YARK is open (tray-hidden is fine; quit is not) —
same honesty as [backups.md](backups.md) world schedule.

## Status

| Slice | Issue | State |
| --- | --- | --- |
| Tab + job model | #486 | Done |
| Restart + broadcast | #487 | Done |
| Wipe after restart | #488 | Separate PR when open |
| Auto-update (Steam newer) | #489 | In progress — Broadcast then safe update |

MagicPath UX mock: https://magicpath.ai/files/444694713119952896

## Building blocks

- Policies: SQLite `maintenance_policies` (migration 18)
- `MaintenanceRestartRuntime` — schedule / Run now restart countdown
- `MaintenanceUpdateRuntime` — Steam-newer detection + update countdown
- Scheduler: `MaintenanceScheduler` (~60s)
- IPC: get/set policy, clear pause, run-restart-now, run-update-now, cancel-upcoming
- UI: Up next + Restart / Wipe / Auto-update sections

## Auto-update (#489)

**Trigger:** existing Steam `buildid` mismatch (`isServerUpdateAvailable` via
`instances.installationInfo` — 15 min official cache). Presets do **not** change
how often Steam is checked.

1. Scheduler tick finds `updateEnabled` + outdated + not busy.
2. **Running:** arm Broadcast window from `updateWarnings` (last ≤60s = 1 Hz `Update in {n}s`).
3. **Stopped:** enqueue normal `UpdateService.enqueueUpdate` (no Broadcast).
4. At T0 (running): `enqueueUpdateForMaintenance` sets `wasRunning` so perform does
   stop `{ backup: false }` → pre_update backup → SteamCMD → start.
5. Does not overlap a restart countdown on the same server.
6. Fail-streak pause (3) with Resume — shared alert with restart.

Restart countdown (#487) unchanged. Wipe (#488) is post-restart when that slice lands.

World backup schedule stays on the Backups tab; log retention stays in Settings.
