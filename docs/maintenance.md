# Maintenance (scheduled jobs)

Per-server **Maintenance** workspace tab for scheduled restart, wipe-after-restart, and
opt-in auto-update (#315). Jobs only run while YARK is open (tray-hidden is fine; quit is not) —
same honesty as [backups.md](backups.md) world schedule.

## Status

| Slice | Issue | State |
| --- | --- | --- |
| Tab + job model | #486 | Done |
| Restart + warnings | #487 | Done |
| Wipe after restart | #488 | Done |
| Auto-update (Steam newer) | #489 | In progress — ServerChat then safe update |

MagicPath UX mock: https://magicpath.ai/files/444694713119952896

## Building blocks

- Policies: SQLite `maintenance_policies` (migration 18+), `MaintenanceRepository` / `MaintenanceService`
- `MaintenanceRestartRuntime` — schedule / Run now restart countdown (`ServerChat`) + optional wipe (#488)
- `MaintenanceUpdateRuntime` — Steam-newer detection + update countdown (`ServerChat`) (#489)
- Scheduler: `MaintenanceScheduler` (~60s)
- IPC: get/set policy, clear pause, run-restart-now, run-update-now, cancel-upcoming
- Shared schedule helpers: `src/shared/maintenance-schedule.ts` (offsets, next local time, templates, wipe settle)
- UI: Up next + Restart / Auto-update sections; **Wild dino wipe** toggle in Up next (**Run update now** only when `steamUpdateAvailable`)

## Restart schedule (#487)

Weekly/daily uses **restartDaysOfWeek** (0=Sun … 6=Sat), local `HH:mm` time, and per-job
`lastMinuteChat` (last ≤60s ServerChat every second; Run now always does this).

Player warnings: **Off** / Minimal / Regular / Frequent / Custom. **Custom** with no times falls
back to Off; choosing Custom again selects all default offsets.

Restart / post-update **start** uses Settings **Show server console on start**
(`InstanceService` fills `openNativeConsole` when callers omit it).

ASA note: warnings use `ServerChat` (global chat), not `Broadcast`.

## Wild wipe after restart (#488)

When **Wild dino wipe** is On (toggle in Up next; turning wipe On enables restart):

1. After a **successful** maintenance restart (schedule or Run now), wait until status is `running`.
2. Ensure RCON, wait `MAINTENANCE_WIPE_POST_READY_MS` (~20s) for settle / wildlife spawn.
3. `SaveWorld`, then `DestroyWildDinos` (always on in policy write).
4. Wipe failure is recorded (`lastWipeOk`); it does **not** inflate the restart fail-streak.
5. Launch `-ForceRespawnDinos` (wipe on every start) stays on the Launch tab — unchanged.

## Auto-update (#489)

**Trigger:** existing Steam `buildid` mismatch (`isServerUpdateAvailable` via
`instances.installationInfo` — 15 min official cache). Presets do **not** change how often Steam is checked.

1. Scheduler tick finds `updateEnabled` + outdated + not busy.
2. **Running:** arm ServerChat window from `updateWarnings` (last ≤60s = 1 Hz `Update in {n}s`).
3. **Stopped:** enqueue `UpdateService.updateServer` and wait for completion (no player warning).
4. At T0 (running): `enqueueUpdateForMaintenance` sets `wasRunning` and **waits** for
   stop `{ backup: false }` → pre_update backup → SteamCMD → start (or rollback).
5. Does not overlap a restart countdown on the same server.
6. Fail-streak pause (3) with Resume — shared alert with restart.

World backup schedule stays on the Backups tab; log retention stays in Settings.
