# Operational logs and event details

How YARK records fleet/server activity, structures event guidance, and clears
or seeds logs for development and QA.

## Intent

- Give operators a single place for events, runtime console, SteamCMD update
  files, and backup history.
- Attach structured **What / Cause / Where / Try next** details to events so
  failures (especially safe update / rollback) are actionable.
- Keep clear/export paths explicit so diagnostic data can be reset without
  deleting the SQLite database wholesale.

## Module map

| Role | Path |
| --- | --- |
| Aggregation / export / clear | `src/backend/domains/logs/logs-service.ts` |
| Event persistence | `src/backend/infra/db/server-repository.ts` (`addEvent`) |
| DB migration (details column) | `src/backend/infra/db/database.ts` (migration **v6**) |
| Detail catalog + merge | `src/shared/event-details.ts` (`resolveEventDetails`) |
| Contracts | `src/shared/types.ts` (`AppEvent`, `AppEventDetails`, `ServerOperationalLogs`) |
| Fleet UI | `src/renderer/src/features/logs/LogsPage.tsx` |
| Server workspace Logs | `src/renderer/src/features/logs/ServerLogsPanel.tsx` |
| Detail body | `src/renderer/src/features/logs/EventDetailsBody.tsx` |

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

Catalog coverage includes `update_*`, `backup_*`, `server_started` /
`server_stopped` / `server_crashed`, `error`, `rcon_command`, plus a default
(`server_created` / `server_updated` / `server_deleted` use the default).
Safe-update paths in `UpdateService` pass rich details (operation, `wasRunning`,
install dir, rollback hints).

Export (`logs:export`) resolves the same fields so text dumps stay useful.

## Sections (server workspace)

`ServerLogsPanel` sections:

| Section | Source |
| --- | --- |
| Events | SQLite `events` for that server |
| Runtime | In-memory process stdout/stderr buffer |
| Updates | Files under userData `update-logs/` (`{serverId}-….log`) |
| Backups | Backup records from `BackupService` / repository |

Fleet **Logs** deep-links into the workspace via `logsFocus`
(`ServerLogsFocus`: optional `section`, `eventId`, `updateFileName`).
`App.openServerLogs` defaults to `{ section: "events" }` and clears focus after
consume so it cannot stick to another server. When `eventId` is set, the panel
forces section `"events"` even if another `section` was provided. Overview opens
`{ section: "updates" }` **only when that server has an active SteamCMD files
job**. Backups fleet can open `{ section: "backups" }`.

## Public IPC

| Channel | Purpose |
| --- | --- |
| `logs:list` | `ServerOperationalLogs` for one server |
| `logs:read-update` | Read one update log file |
| `logs:export` | Export resolved events + related sections |
| `logs:open-update-file` | Open an update log with the OS default handler (`shell.openPath`) |
| `logs:clear-events` | Delete SQLite events for the server |
| `logs:clear-runtime` | Clear the process runtime buffer |
| `logs:delete-update` | Delete one update log file |
| `logs:clear-updates` | Delete all update logs for the server |
| `events:recent` | Recent fleet-wide events (Overview / fleet Logs) |

Clear actions are confirmed in the UI per section. There is no single
“clear everything” IPC — call the relevant clears intentionally. The Backups
section clear uses `backups:delete`, not a `logs:*` channel.

Related push (not under `logs:*`): `push:steamcmd-progress` feeds live
SteamCMD console while jobs run (see [updates-steamcmd.md](updates-steamcmd.md)).

## Seed and visual helpers

Not wired as npm scripts — invoke after the app has created a userData DB:

```bash
# Clear + seed events (with details JSON) + sample update log files
node scripts/seed-server-logs.cjs [serverName]

# Playwright Electron review of fleet/server logs (needs display + build)
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
| Event shows only a bare message | Older row without `details`; catalog fills **What** (and **Try next** when the type has a suggestion) |
| Fleet “Open in server” opens wrong tab | Check `logsFocus.section`; `eventId` forces Events; focus is cleared after first workspace render |
| Clear did not remove update files | Events clear ≠ update-log clear — use Updates section clear/delete |
| Backups history still present after “clear” elsewhere | Backups section uses `backups:delete` |
| Seed script cannot find DB | App never launched, or wrong userData — set `YARK_USER_DATA` |
| SteamCMD console empty in Logs | Live console is on the SteamCMD dock/progress push; Updates section shows **files** after jobs |

## Verification

```bash
npm test -- event-details
npm test -- logs-service
npm run typecheck
```

Renderer: `src/renderer/src/features/logs/*.test.tsx`. Visible UI changes follow
[visual-testing.md](visual-testing.md) (`node scripts/visual-logs.cjs`).
