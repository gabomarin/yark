# Operational logs and event details

How YARK records activity across servers, structures event guidance, and clears
or seeds logs for development and QA.

## Intent

- Give operators a single place for events, runtime console, SteamCMD update
  files, and backup history.
- Attach structured **What / Cause / Where / Try next** details to events so
  failures (especially safe update / rollback) are actionable. `server_crashed`
  also stores a short sanitised ShooterGame.log excerpt (Fatal / CFCore) because
  Runtime is in-memory only.
- Keep clear/export paths explicit so diagnostic data can be reset without
  deleting the SQLite database wholesale.
- Bound YARK-owned operational history with a conservative retention policy
  (#84) while never taking ownership of ASA runtime log files.

## Module map

| Role | Path |
| --- | --- |
| Aggregation / export / clear / retention | `src/backend/domains/logs/logs-service.ts` |
| Retention scheduler | `src/backend/domains/logs/log-retention-scheduler.ts` |
| Shared defaults / normalize | `src/shared/log-retention.ts` |
| Event persistence | `src/backend/infra/db/server-repository.ts` (`addEvent`) |
| DB migration (details column) | `src/backend/infra/db/database.ts` (migration **v6**) |
| Detail catalog + merge | `src/shared/event-details.ts` (`resolveEventDetails`) |
| Contracts | `src/shared/types.ts` (`AppEvent`, `AppEventDetails`, `ServerOperationalLogs`, `LogRetentionSettings`) |
| Sidebar Logs (all servers) | `src/renderer/src/features/logs/LogsPage.tsx` (Mantine **Accordion** event rows) |
| Server workspace Logs | `src/renderer/src/features/logs/ServerLogsPanel.tsx` (Mantine **Accordion** event rows; deep-link focus preserved) |
| Detail body | `src/renderer/src/features/logs/EventDetailsBody.tsx` (Accordion.Panel content) |
| Overview recent activity | `src/renderer/src/features/overview/components/RecentActivityPanel.tsx` (Mantine **Timeline**) |
| Settings retention UI | `src/renderer/src/features/settings/components/SettingsLogRetentionSection.tsx` |

## Ownership and retention (#84)

| Source | Owner | Retention |
| --- | --- | --- |
| SQLite `events` | YARK | Age-based: routine default **90** days; failure evidence **180** days |
| `userData/update-logs/{serverId}-*.log` | YARK | Keep last **20** successful files per server; failed/unknown kept **180** days |
| In-memory runtime buffer | YARK (session) | Hard cap **1200** lines in `ProcessManager` — not a Settings control |
| `ShooterGame/Saved/Logs` | ASA | **Never** deleted by YARK; read/tail only |
| Backup ZIP history | BackupService | Own retain counts — see [backups.md](backups.md) |

Persisted policy key: `app_settings` → `logRetention.v1`. Invalid Settings values
are rejected and the previous policy is kept.

**Failure evidence** (kept longer): event `severity` warning/error, or types such as
`server_crashed`, `update_failed`, `update_rolled_back`, `auto_start_failed`,
`install_move_failed`, `error`; update logs with non-zero / unknown exit status.

**Automatic cleanup** (default on): once ~60s after app launch, then about daily.
**Manual cleanup**: Settings → Log retention → Clean up now (preview → confirm).
Outcome is a single summary event (`logs_retention_completed` /
`logs_retention_failed`) — not one event per deleted file.

**Recovery:** deleted events and update-log files are not recoverable. Export
before cleanup when you need a durable diagnostic snapshot.

ASA runtime logs remain under the game’s own rotation; clearing the Runtime tab
only clears YARK’s in-memory buffer.

## Event details

SQLite `events.details` stores optional JSON (`AppEventDetails`):

```ts
{
  what?: string;
  cause?: string;
  location?: string;
  suggestion?: string;
  context?: Record<string, string | number | boolean | null>;
}
```

`resolveEventDetails(event)` merges stored fields with a **type catalog**
(fallback for older rows without details). UI labels:

| Field | UI label |
| --- | --- |
| `what` | What |
| `cause` | Cause |
| `location` | Where |
| `suggestion` | Try next |
| `context` | Key/value chips under the body |

Catalog coverage includes `update_*`, `backup_*`, `server_*`, `error`,
`rcon_command`, `logs_retention_*`, plus a default. Safe-update paths in
`UpdateService` pass rich details (operation, `wasRunning`, install dir,
rollback hints).

Export (`logs:export`) resolves the same fields so text dumps stay useful.

## Sections (server workspace)

`ServerLogsPanel` sections:

| Section | Source |
| --- | --- |
| Events | SQLite `events` for that server |
| Runtime | In-memory buffer: stdout/stderr plus live tail of `ShooterGame/Saved/Logs/ShooterGame.log` (native console on or off). Cleared on the next Start, not on crash. |
| Updates | Files under userData `update-logs/` (`{serverId}-….log`) |
| Backups | Backup records from `BackupService` / repository |

While the Runtime tab is selected, the panel quietly refreshes about every 1.5s
via `logs:runtime` (runtime buffer only — not a full `logs:list`). Stale responses
after switching servers are ignored. A compact **Source** select filters
All / System / Server log / Process. The viewer hides YARK capture timestamps;
Server log lines show Unreal stamps interpreted as UTC and formatted locally.
UI timestamps across Events / Runtime / Updates / Backups use `formatLogDateTime`
(`YYYY-MM-DD HH:MM:SS`, with `.mmm` for Unreal stamps). Runtime tails
`ShooterGame/Saved/Logs/ShooterGame.log` in both native-console and piped modes
(truncate/rotation handling) and buffers partial lines/UTF-16 bytes. Native
console still opens the OS window; it does not replace Runtime. The buffer is
kept after a crash and cleared on the next Start (or a manual Runtime clear).

Sidebar **Logs** deep-links into the workspace via `logsFocus`
(`ServerLogsFocus`: optional `section`, `eventId`, `updateFileName`).
`App.openServerLogs` defaults to `{ section: "events" }` and clears focus after
consume so it cannot stick to another server. Overview can open
`{ section: "updates" }`; sidebar Backups can open `{ section: "backups" }`.

## Public IPC

| Channel | Purpose |
| --- | --- |
| `logs:list` | `ServerOperationalLogs` for one server |
| `logs:read-update` | Read one update log file |
| `logs:export` | Export resolved events + related sections |
| `logs:open-update-file` | Reveal/open an update log on disk |
| `logs:clear-events` | Delete SQLite events for the server |
| `logs:clear-runtime` | Clear the process runtime buffer |
| `logs:delete-update` | Delete one update log file |
| `logs:clear-updates` | Delete all update logs for the server |
| `logs:get-retention-settings` / `logs:set-retention-settings` | Read/write retention policy |
| `logs:preview-cleanup` / `logs:run-cleanup` | Manual retention preview + confirm |
| `events:recent` | Recent events across servers (Overview / sidebar Logs) |

Clear actions are confirmed in the UI per section. There is no single
“clear everything” IPC — call the relevant clears intentionally.
Retention cleanup is separate (Settings) and never targets ASA Saved/Logs.

Related push (not under `logs:*`): `push:steamcmd-progress` feeds live
SteamCMD console while jobs run (see [updates-steamcmd.md](updates-steamcmd.md)).

## Seed and visual helpers

Not wired as npm scripts — invoke after the app has created a userData DB:

```bash
# Clear + seed events (with details JSON) + sample update log files
node scripts/seed-server-logs.cjs [serverName]

# Playwright Electron review of sidebar/server logs (needs display + build)
npm run build
unset ELECTRON_RUN_AS_NODE
node scripts/visual-logs.cjs
```

UserData resolution in the seed script:

| Platform | Default path |
| --- | --- |
| Windows | `%APPDATA%/yark-server-manager` |
| macOS | `~/Library/Application Support/yark-server-manager` |
| Linux | `~/.config/yark-server-manager` |

Override with `YARK_USER_DATA` when needed (cloud agents, portable profiles).

## Troubleshooting

| Symptom | Likely cause / next step |
| --- | --- |
| Event shows only a bare message | Older row without `details`; catalog still fills What / Try next from `type` |
| Sidebar “Open in server” opens wrong tab | Check `logsFocus.section`; focus is cleared after first workspace render |
| Clear did not remove update files | Events clear ≠ update-log clear — use Updates section clear/delete |
| Seed script cannot find DB | App never launched, or wrong userData — set `YARK_USER_DATA` |
| SteamCMD console empty in Logs | Live console is on the SteamCMD dock/progress push; Updates section shows **files** after jobs |
| History disappeared after a few months | Retention policy (#84); check Settings → Log retention; deleted data is not recoverable |
| Cleanup skipped a file | In use / permission — retry later; paths outside `update-logs` are never deleted |

## Verification

```bash
npm test -- event-details
npm test -- logs-service
npm test -- log-retention
npm run typecheck
npm run build && npm run e2e:log-retention
npm run build && npm run e2e:launch-args

```

Renderer: `src/renderer/src/features/logs/*.test.tsx`, Settings retention in
`SettingsPage.test.tsx`. Visible UI changes follow
[visual-testing.md](visual-testing.md) (`node scripts/visual-logs.cjs`).
