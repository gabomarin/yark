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
| Auto-update (Steam newer) | #489 | Done |

MagicPath UX mock: https://magicpath.ai/files/444694713119952896

## Building blocks

| Role | Path |
| --- | --- |
| Policies (SQLite) | `maintenance_policies` (migration 18+), `MaintenanceRepository` |
| Orchestration | `MaintenanceService` |
| Restart + wipe | `MaintenanceRestartRuntime` |
| Steam-newer update | `MaintenanceUpdateRuntime` |
| Scheduler | `MaintenanceScheduler` (~60s; fires once on start; overlapping ticks coalesce; `.unref()`) |
| Shared helpers | `src/shared/maintenance-schedule.ts`, `maintenance-policy.ts`, `maintenance-restart-days.ts` |
| UI | `src/renderer/src/features/maintenance/` |

## IPC

No push channel — the Maintenance tab polls `getPolicy` while mounted.

| Shared key | Channel | Preload | Behavior |
| --- | --- | --- | --- |
| `maintenanceGetPolicy` | `maintenance:get-policy` | `getMaintenancePolicy` | `ensurePolicy` then status |
| `maintenanceSetPolicy` | `maintenance:set-policy` | `setMaintenancePolicy` | zod `maintenancePolicyWriteSchema` |
| `maintenanceClearSchedulePause` | `maintenance:clear-schedule-pause` | `clearMaintenanceSchedulePause` | Clears **both** runtimes’ pauses + fail streaks |
| `maintenanceRunRestartNow` | `maintenance:run-restart-now` | `runMaintenanceRestartNow` | Short lead → countdown |
| `maintenanceRunUpdateNow` | `maintenance:run-update-now` | `runMaintenanceUpdateNow` | Requires running + Steam newer |
| `maintenanceCancelUpcoming` | `maintenance:cancel-upcoming` | `cancelMaintenanceUpcoming` | Cancels both runtimes’ active windows |

## Constants

| Constant | Value | Notes |
| --- | --- | --- |
| `MAINTENANCE_RUN_NOW_LEAD_MS` | 10s | Run now confirm → warning window |
| `MAINTENANCE_FAIL_LIMIT` | 3 | Hard failures before session pause (per runtime) |
| `MAINTENANCE_RCON_SOFT_FAIL_LIMIT` | 3 | Consecutive ServerChat fails in one window → hard-fail that window |
| `MAINTENANCE_WIPE_POST_READY_MS` | 20s | Extra wait after `running` before wipe |
| `MAINTENANCE_WIPE_READY_TIMEOUT_MS` | 10 min | Cap waiting for post-restart ready + RCON |
| Update retry cooldown | 5 min | Private in update-runtime; failed Steam build key |
| Steam availability UI cache | 30s | Update-runtime snapshot reuse |
| Official Steam build cache | 15 min | Same as [updates-steamcmd.md](updates-steamcmd.md) |
| Scheduler tick | 60s | Immediate first cycle on start |
| UI poll | idle 10s / warning 3s / last_minute+execute 1s | Paused while `document.hidden` |

## Warning presets

From `maintenance-policy.ts` (labels in UI: Off / Minimal / Regular / Frequent / Custom):

| Job | quiet | standard | strict |
| --- | --- | --- | --- |
| Restart | `5m` | `30m,15m,5m,1m` | `30m,15m,10m,5m,1m` |
| Update | `5m` | `15m,5m,1m` | `15m,10m,5m,1m` |

Defaults: Sunday **04:00**, templates `Server restart/update in {time}`, `lastMinuteChat: true`.
Last-minute lines are **fixed** (not editable): `Restart in {n}s` / `Update in {n}s`.
**Custom** with no valid times → Off; choosing Custom again selects all default chips
(`30m|15m|10m|5m|1m`). ASA warnings use **`ServerChat`**, not `Broadcast`.

## Session runtime state

Pause after fail-streak, fail counts, `completedTargets` (restart occurrences already
run or cancelled), `handledAvailability` (Steam builds already armed), and last
restart/update/wipe outcome live **only in memory for the current YARK process**.

- Quitting YARK clears them. A server auto-paused after 3 failures will schedule again
  on the next launch until it fails again (or the operator uses **Resume**).
- Restart and update keep **separate** `pausedServerIds` / fail-streak maps. UI
  `schedulePaused` is the **OR** of both; Resume clears both.
- A restart occurrence cancelled or completed in this session will not re-arm until
  YARK restarts (`completedTargets`). Update cancel **releases** the availability key
  and **may re-arm** the same Steam build later.
- Countdown timers call `.unref()` so idle timers alone do not keep Node alive; the
  Electron main process always has other refs.

Persisting pause across launches is intentionally out of scope for #315.

## Cancel upcoming

`cancelable` only while phase is `warning` | `last_minute` (not restarting / updating / wiping).

| Job | Cancel effect |
| --- | --- |
| Restart | Mark schedule target in `completedTargets` → no re-arm this session |
| Update | `releaseAvailability(key)` → may re-arm later |
| Intentional stop mid-window | Quiet abort (same mark/release rules) |
| Unexpected process death mid-countdown | Hard-fail (counts toward fail-streak) |

## Restart schedule (#487)

Weekly uses **restartDaysOfWeek** (0=Sun … 6=Sat), local `HH:mm`, and per-job
`lastMinuteChat` (last ≤60s ServerChat every second; Run now always does this).

Execute path (schedule or Run now):

1. Requires enabled + running + not paused + peer update countdown idle.
2. Arms only when remaining ≤ max warning lead.
3. At T0: `InstanceService.restart` (omit `openNativeConsole`) → stop `{ backup: false }` →
   fail-hard `pre_restart` → `startForMaintenance` (Settings **Show server console on start**
   fills when omitted — see [server-lifecycle.md](server-lifecycle.md)).
4. Late: if remaining &lt; **-30s**, skip and mark `completedTargets`.

## Wild wipe after restart (#488)

When **Wild dino wipe** is On (toggle in Up next; turning wipe On enables restart):

1. After a **successful** maintenance restart, wait until status is `running`.
2. Ensure RCON, wait `MAINTENANCE_WIPE_POST_READY_MS` (~20s) for settle / wildlife spawn.
3. `SaveWorld`, then `DestroyWildDinos` (`wipeSaveWorldFirst` is always written `true` from the UI).
4. Wipe failure is recorded (`lastWipeOk`); it does **not** inflate the restart fail-streak.
5. Launch `-ForceRespawnDinos` (wipe on every start) stays on the Launch tab — unchanged.

## Auto-update (#489)

**Trigger:** Steam `buildid` mismatch (`isServerUpdateAvailable` via
`instances.installationInfo`). Warning presets do **not** change how often Steam is checked.

1. Scheduler tick finds `updateEnabled` + outdated + not busy.
2. **Running:** arm ServerChat window from `updateWarnings` (last ≤60s = 1 Hz
   `Update in {n}s`).
3. At T0: **stop immediately** (`backup: false`) so the map goes offline when
   warnings hit 0 — even if another Downloads job is still running (#498).
4. Then `UpdateService.enqueueUpdateForMaintenance(serverId, { wasRunning: true })`
   and **wait** for `pre_update` world+ini → SteamCMD → start (or rollback).
   Callers that already stopped for player-aligned downtime must pass
   `wasRunning: true`; otherwise the queue would see a stopped process and leave
   it stopped after SteamCMD. See [updates-steamcmd.md](updates-steamcmd.md).
5. **Stopped:** start `updateServer` **without awaiting inside the policy loop**
   (completion still updates `lastUpdate*` off-loop).
6. Does not overlap a restart countdown on the same server.
7. Skips arming / Run update now / T0 stop while Downloads is **paused** (or otherwise
   held for the operator) so a live map is not taken offline behind that hold. Scheduled
   **restart** maintenance does not yet share this gate — follow-up if restart countdowns
   should also defer while Downloads is held.
8. Fail-streak pause (`MAINTENANCE_FAIL_LIMIT`) with Resume; failed Steam builds also
   cool down 5 minutes before re-arm. Availability key = `${serverId}:${officialBuild}`.
9. **Run update now** requires `updateEnabled` + running + Steam newer; stopped servers
   get an error (“use Downloads”).

`getPolicy` on the repository is read-only (defaults when no row). Rows seed via
`ensurePolicy` / `ensurePoliciesForServers` (`INSERT OR IGNORE`) from UI open + each
scheduler cycle.

## UI model

- `MaintenancePanel` + `MaintenanceUpNext` + `MaintenanceRestartSchedule` +
  `MaintenanceJobSections` + `MaintenancePlayerWarnings`
- Model: `model/maintenancePanelModel.ts`; hook: `hooks/useMaintenancePanel.ts`
- Wipe toggle in Up next; On forces `restartEnabled`
- **Run update now** only when `steamUpdateAvailable`
- Run restart now confirm mentions graceful restart **with backup** (`pre_restart`)

## Schema notes

- Canonical days: `restart_days_of_week_json` (migration 19). Legacy `restart_cadence` /
  `restart_day_of_week` still written for older readers.
- World backup schedule stays on the Backups tab; log retention stays in Settings.

## Pitfalls

| Symptom | Likely cause |
| --- | --- |
| Jobs never fire | YARK quit (tray-hidden is OK); jobs need the app process |
| Schedule paused banner | 3 hard failures this session — use Resume (clears both jobs) |
| Cancelled restart comes back after relaunch | `completedTargets` is in-memory only |
| Cancelled update returns | Availability was released; cooldown may still apply after a fail |
| Run update now disabled / errors | Need running + Steam newer; stopped → Downloads |
| Update countdown never arms | Downloads is paused or held for the operator |
| Players still online at update T0 | T0 stop failed or was skipped; check stop errors / cancel race |
| Wipe ran but animals returned | `-ForceRespawnDinos` on Launch is separate; wipe is one-shot after restart |
| Console missing after maintenance start | Settings **Show server console on start** was off |

## Tests / e2e

- Unit / panel: `MaintenancePanel.test.tsx`, shared schedule helpers
- Playwright: `npm run e2e:maintenance` (Up next, schedule, wipe, warnings Off) —
  see [e2e-validation.md](e2e-validation.md)
