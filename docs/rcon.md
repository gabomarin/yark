# RCON console (workspace)

Per-server admin console for a dedicated that is **`running`**: persistent Source
RCON session, command history, online players, and `BanList.txt` management.

Readiness probes and graceful stop still use RCON; those paths are summarized in
[server-lifecycle.md](server-lifecycle.md). This runbook covers the **workspace
RCON tab** and related IPC (#17 / #154).

## Intent

- Keep one live TCP session per managed server instead of connect/exec/disconnect
  for every command.
- Give operators Kick / Ban / Unban and a console history that survives tab
  switches inside the app session.
- Share the same send path with SidePanel **Save world** and RCON quick chips
  (including **Broadcast**, which prefills the command input).

## Module map

| Role | Path |
| --- | --- |
| Protocol client + one-shot `rconExec` | `src/backend/infra/rcon/rcon-client.ts` |
| Persistent sessions / reconnect / send queue | `src/backend/infra/rcon/rcon-session-manager.ts` |
| BanList path / parse / rewrite | `src/backend/domains/instances/ban-list.ts` |
| Orchestration (`execRcon`, kick/ban/unban, auto-connect) | `src/backend/domains/instances/instance-service.ts` |
| Readiness / stop one-shots (or session executor when wired) | `src/backend/infra/process/process-manager.ts` |
| Online poll + `ListPlayers` parse | `src/backend/domains/backups/player-session-watcher.ts`, `src/backend/domains/instances/list-players.ts` |
| App-level history + player cache | `src/renderer/src/App.tsx` |
| Console UI | `…/RconPanel/RconPanel.tsx`, `RconConsoleHistory.tsx` |
| Survivors / bans UI | `PlayerListSection.tsx`, `BannedPlayersSection.tsx` |
| Header status + retry | `…/RconStatusIcon/RconStatusIcon.tsx` |
| IPC | `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc-handlers.ts` |

Host is always `127.0.0.1`. Auth uses the profile `adminPassword` and the
**runtime** RCON port (`applyRuntimePorts` / session ports).

## Session lifecycle

**After readiness → `running`**

1. `InstanceService` enables auto-reconnect and calls `autoConnectRcon`.
2. TCP port probe up to `RCON_AUTO_CONNECT_TIMEOUT_MS` (**15s**), retry every
   **1s**, then `RconSessionManager.connect(...)`.
3. Best-effort: port not ready or connect failure is logged, not thrown.

**While `running`**

- Auto-reconnect on socket close/error: exponential backoff base **2s**, max
  **30s**, max **10** attempts (`MAX_RECONNECT_ATTEMPTS`).
- New `connect()` bumps `connectGeneration` so hung handshakes cannot block
  forever.
- Commands are **single-flight** per server (send queue) so console traffic
  cannot overlap `ListPlayers` polls on one socket.

**`stopping`**

- Auto-reconnect off; socket kept for `SaveWorld` / `DoExit`.
- `execRcon` still allowed; on-demand reconnect does not re-enable retries.

**`stopped` / `error`**

- `disconnect(serverId)` — clear session, emit disconnected.

**`execRcon` gate**

- Allowed for `running` or `stopping` only.
- `starting` → rejected (“Server is still starting; RCON is not ready yet”).

### Readiness vs UI session

| Path | Mechanism |
| --- | --- |
| Readiness while `starting` | Quiet **one-shot** `rconExec(..., "ListPlayers")` — not the session manager |
| Workspace console / Kick / Ban | Persistent session after promotion to `running` |
| Stop / player watcher (after main wiring) | Prefer `instances.execRcon(..., { recordEvent: false })` |

### Persistence across UI navigation

| Concern | Lives where | Survives workspace tab switch? |
| --- | --- | --- |
| TCP session | Main `RconSessionManager` | Yes (tied to process status) |
| Console history | `App.tsx` `rconHistoryByServer` (cap **100**) | Yes (in-memory; cleared on app restart) |
| Online survivors | App cache + watcher push | Yes; refresh on RCON tab focus |
| Banned list | Loaded in `BannedPlayersSection` | Reloads on mount / Refresh |

## Features

### Console

- Quick chips: `SaveWorld`, `Broadcast ` (prefill), `ListPlayers`,
  `DestroyWildDinos`, `GetChat`, `DoExit`.
- Free-text send (Enter). No `cheat` rewrite — commands are trimmed and sent as
  typed (UI advises omitting `cheat`).
- History: `pending` → `success` \| `error`. Empty body / ASA
  `"Server received, But no response!!"` → UI **No response**.
- Clear keeps **pending** entries; identical pending command blocks Send /
  Re-run.
- Audit strip: last five `rcon_command` events (command text only).

### Survivors

- `PlayerSessionWatcher` polls `ListPlayers` every **10s** while `running`.
- Kick → `KickPlayer <key>`; Ban → `BanPlayer <key>` (audited; refresh online
  list after).
- Actions require status `running` **and** RCON `connected`.
- Operator-facing copy uses **Survivors** (not “Players”); unknown counts show **–**, never a fake `0`.

### Ban list

| Item | Detail |
| --- | --- |
| Primary path | `{installDir}/ShooterGame/Binaries/Win64/BanList.txt` |
| Alternate candidates (not merged) | `ShooterGame/Saved/BanList.txt`, `{installDir}/BanList.txt` |
| Line format | Often `eosId,playerName,0`; RCON uses **id only** |
| Unban RCON | `Unban <id>` (**not** `UnbanPlayer`) when `running` / `stopping` |
| Disk | Rewrite primary Win64 file after unban; preserve comments / metadata |
| BanListURL | If set in GUS (and not blank/N/A) → warning that remote list may still block |
| Open file | `ensureBanListFile` then `shell.openPath` |

## IPC and push events

| Channel | API | Role |
| --- | --- | --- |
| `rcon:command` | `sendRconCommand` | Audited console / SidePanel send |
| `rcon:retry-connection` | `retryRconConnection` | Disconnect + connect; requires `running` |
| `rcon:get-status` / `rcon:get-all-status` | status queries | Header badge |
| `rcon:tab-focus-changed` | `notifyRconTabFocus` | Focus → refresh online list |
| `rcon:refresh-player-list` | `refreshPlayerList` | Manual refresh |
| `rcon:kick-player` / `rcon:ban-player` | Kick / Ban + refresh | Survivors section |
| `rcon:list-banned-players` | `listBannedPlayers` | Disk → `{ key, name }` |
| `rcon:unban-player` | `unbanPlayer` | RCON + disk; may return BanListURL warning |
| `rcon:open-ban-list-file` | `openBanListFile` | Open primary BanList.txt |

Push:

| Channel | Payload |
| --- | --- |
| `push:rcon-status-changed` | `{ serverId, status, lastError }` |
| `push:player-list-updated` | `{ serverId, players, timestamp, error }` |

Statuses: `disconnected` \| `connecting` \| `connected` \| `error`.

## Common pitfalls

1. Expecting the console while `starting` — wait for readiness / `running`.
2. Overlapping sends without the session queue — Source RCON is single-flight;
   the manager serializes for you.
3. Command timeout (default **5s**) destroys the socket; reconnect follows when
   auto-reconnect is on.
4. Wrong / stale RCON port — use runtime ports after session overrides.
5. Using `UnbanPlayer` — ASA expects `Unban`.
6. Editing only `Saved/BanList.txt` — unban rewrites the **Win64** primary file
   only; alternates are never merged.
7. Local unban while BanListURL is set — remote list may still block joins.
8. Treating empty ASA ACK as failure — normalize to success with no body.
9. Relying on history after app restart — history is in-memory; audit events
   persist in SQLite separately.
10. `YARK_E2E_RCON_MOCK=1` — forces mock replies for e2e; not production behavior.

## Tests and e2e

| Artifact | Focus |
| --- | --- |
| `tests/unit/rcon-session-manager.test.ts` | ACK normalize, queue, reconnect, generation supersede |
| `tests/unit/instance-rcon.test.ts` | Auto-connect, retry gate, Kick/Ban/Unban, audit vs silent |
| `tests/unit/ban-list.test.ts` | Paths, parse, remove preserves metadata, BanListURL helpers |
| `…/ServerWorkspacePage.test.tsx` | RCON tab, history, SidePanel Save/Broadcast |
| `…/RconStatusIcon.test.tsx` | Status badge / retry |
| `npm run e2e:rcon` (`scripts/e2e-rcon.cjs`) | Windows UI + mock RCON; HD/FHD/QHD shots |

Player-session backups that consume the same `ListPlayers` stream:
[backups.md](backups.md).
