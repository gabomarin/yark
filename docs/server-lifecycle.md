# Server lifecycle (launch, process, profile → INI)

How YARK builds dedicated-server command lines, syncs profile networking into
`GameUserSettings.ini`, spawns `ArkAscendedServer.exe`, and decides ready /
stop / kill. Adjacent INI sanitize and configuration-assistant rules that
affect start and config writes are summarized at the end.

## Intent

- Keep CLI args minimal and ASA-compatible (`"Map"?SessionName="…"` + `-port`).
- Put RCON, passwords, and query port in INI — not on the command line.
- Track the **game** process (never a `cmd` / `.cmd` wrapper).
- Gate `running` on RCON readiness so Overview/workspace status matches
  “accepting players”, not merely “OS process started”.

## Module map

| Role | Path |
| --- | --- |
| Launch args | `src/backend/domains/instances/launch-args.ts` |
| Profile → INI sync | `src/backend/domains/instances/sync-profile-ini.ts` |
| Orchestration | `src/backend/domains/instances/instance-service.ts` |
| Profile validation | `src/backend/domains/instances/validation.ts` |
| Port conflicts | `src/shared/port-conflicts.ts` |
| Process lifecycle | `src/backend/infra/process/process-manager.ts` |
| INI read/save | `src/backend/domains/config/ini-service.ts` |
| INI text / sanitize | `src/shared/ini-text.ts` |
| Defaults | `src/shared/defaults/*.ini`, `src/shared/ini-defaults.ts` |
| Config assistant model | `src/renderer/src/features/server-workspace/configurationWizardModel.ts` |
| Config assistant UI | `…/components/ConfigurationWizard.tsx` |
| Restart composition | `src/renderer/src/App.tsx` (`stop` then `start`) |
| IPC | `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc-handlers.ts` |

Binary path: `{installDir}/ShooterGame/Binaries/Win64/ArkAscendedServer.exe`
(`serverBinaryPath`).

## CLI vs INI split

| Concern | Where |
| --- | --- |
| Map + session name | CLI map URL (`buildMapUrlArg`) |
| Game port | CLI `-port=N` **and** INI `[SessionSettings] Port` |
| `-ServerPlatform` | CLI (default `ALL` unless `extraArgs` already sets it) |
| Mods / cluster trio | CLI when present on the profile |
| RCON enable/port | INI `[ServerSettings]` only |
| Admin / server password | INI `[ServerSettings]` only |
| Query port | INI `[SessionSettings] QueryPort` only |

**Never** put `?listen`, `?Port=`, RCON keys, passwords, or `-QueryPort` on the
CLI. Unit tests in `tests/unit/launch-args.test.ts` lock this.

## Launch args

`buildLaunchArgs(profile)` order:

1. `"${map}"?SessionName="${escapedSessionName}"` — **separate** quotes around
   map and SessionName (never `"Map?SessionName=…"`).
2. `-port=${gamePort}`
3. `-ServerPlatform=ALL` unless any `extraArgs` matches `/ServerPlatform/i`
4. `-mods=id1,id2,…` when `mods.length > 0`
5. If **both** `clusterId` and `clusterDir` are set:
   `-clusterid=…`, `-ClusterDirOverride=…`, `-NoTransferFromFiltering`
   (compliance / Clusters UI: [clusters.md](clusters.md))
6. `…profile.extraArgs`

UI / runtime logs use `formatLaunchCommandLine` (logical `"` quotes). Helper
`buildWindowsVerbatimSpawnArgs` / `buildWindowsCreateProcessCommandLine` are
for diagnostics only — live spawn does **not** use them.

Example logical argv:

```text
"TheIsland_WP"?SessionName="MyServer" -port=7777 -ServerPlatform=ALL -mods=123,456
```

## Profile → INI sync

`syncProfileSettingsToIni(profile)` writes
`{installDir}/ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini`
(seeds from `defaultGameUserSettingsIni` when missing):

| Section | Keys |
| --- | --- |
| `ServerSettings` | `RCONEnabled=True`, `RCONPort`, `ServerAdminPassword`, `ServerPassword` (`""` when null) |
| `SessionSettings` | `SessionName`, `Port` (game), `QueryPort` |

**When:**

- `InstanceService.start` — **awaited** before `ProcessManager.start`
- `InstanceService.update` — fire-and-forget (start syncs again if the file was missing)

## Process spawn

`spawnAsaProcess` in `process-manager.ts` always spawns the **exe + logical
args** directly with `cwd = installDir`:

| Mode | `shell` | `windowsVerbatimArguments` | `windowsHide` | stdio |
| --- | --- | --- | --- | --- |
| Piped (default) | `false` | `false` | `true` | ignore / pipe / pipe |
| Native console (`openNativeConsole`) | `false` | `false` | `false` | ignore |

Constraints:

- Do **not** wrap with `.cmd` / `cmd /c` / `start` — wrong tracked PID and a
  flashing console. Integration test
  `tests/integration/process-manager-real-start.test.ts` (win32-only) asserts
  the PID is `ArkAscendedServer.exe`.
- Do **not** set `windowsVerbatimArguments: true` when the exe path has spaces
  (Node leaves the path unquoted and argv breaks). Prefer `false` so Node
  quotes the exe and keeps real `"` on the map token.
- Native console and piped Runtime logs are mutually exclusive — with a native
  console, Runtime logs are system messages only (`MAX_RUNTIME_LOG_LINES = 1200`
  for the in-memory buffer).
- `servers:open-native-terminal` opens a separate `cmd` in the install dir; that
  is **not** the game process.

Kill on win32 uses `taskkill /pid … /T /F`.

## Start / stop / kill / restart

IPC (no `servers:restart` channel):

| Channel | Backend |
| --- | --- |
| `servers:start` | sync INI → `ProcessManager.start` |
| `servers:stop` | RCON `SaveWorld` → wait `SAVE_WAIT_MS` (8s) → `DoExit`; force after `EXIT_WAIT_MS` (30s) |
| `servers:kill` | immediate terminate (warning event; UI confirms) |

Status push: `push:server-status`.

**Start** (`InstanceService.start`):

1. Port-conflict check vs **other active** servers (`findPortConflicts`).
2. `await syncProfileSettingsToIni`.
3. `processes.start` (args from `launchArgsOverride` or `buildLaunchArgs`).
4. Event `server_started` (“waiting for readiness”).

**Readiness:** status stays `"starting"` until RCON `ListPlayers` on
`127.0.0.1` succeeds (poll `DEFAULT_READY_POLL_MS = 3000`, timeout
`DEFAULT_READY_TIMEOUT_MS = 10 * 60 * 1000`). Log patterns are observational;
transition to `"running"` requires RCON unless `skipReadinessCheck` (tests /
binaries without RCON). Timeout → `"error"` + terminate.

**Restart:** renderer-only — `App.restartServer` calls `stopServer` then
`startServer`. A failure mid-way can leave the server stopped. There is no
atomic backend restart.

**App quit:** `before-quit` runs `processManager.stopAll` when any server is
active.

`StartServerOptions.skipPortValidation` is declared but **unused** today.

## Profile / port validation

Constants: `PORT_MIN = 1024`, `PORT_MAX = 65535`.

`validateProfileInput`:

- Ports in range; game / query / rcon **distinct** within the profile.
- Name 1–64 (Windows folder rules); map + session required.
- `installDir` absolute Windows (`C:\…` or UNC).
- Admin password length ≥ 4; mods unique; `clusterId` ⇒ `clusterDir` required.

Inter-profile: `findPortConflicts` flags the same numeric port used by
different profile ids (any kind). Create/update check all other profiles;
start checks **active** others only. Clone bumps ports by +10 (retry up to
offset 1000).

Hot profile updates while running are allowed; ports/map take effect after the
next restart.

## INI read / save / sanitize (adjacent)

Paths under `{installDir}/ShooterGame/Saved/Config/WindowsServer/`:
`GameUserSettings.ini`, `Game.ini`.

- Read seeds missing files from `src/shared/defaults` and always returns
  `sanitizeServerIniPayload` (disk is not rewritten on read).
- Save (lock purpose `"ini-save"`): sanitize → semantic validate → write both
  files → event; IPC best-effort `createIniSaveBackup`.
- Sanitize strips client noise (`ShooterGameUserSettings`, scalability /
  resolution / volume keys, etc.). Never treat stripped noise as dirty pending
  edits.
- Do **not** use npm `ini` for ASA — dots in section headers are literal
  (`ini-text.ts`).
- Semantic save checks (only when `[ServerSettings]` present): `RCONPort`
  1024–65535, `MaxPlayers` 1–255 (**ServerSettings**), `DifficultyOffset` 0–1.
- Reset-to-defaults is UI-only (no `ini:reset` IPC).

## Configuration assistant

On-demand from the Server tab — **not** a permanent nav tab. Six steps:
Profile → Pace → Breeding → World → QoL → Review (`STEP_COUNT = 6`).

- Blocked while the manual INI editor is dirty (`configurationAssistantDisabled`).
- Draft-only until **Apply changes**; apply re-reads latest INI, overlays only
  curated keys (`applyWizardDraftToIni`), then preview + save.
- Preserve unknown keys / section casing; skip no-op writes.
- Difficulty: only an explicit level choice rewrites `DifficultyOffset` /
  `OverrideOfficialDifficulty`; otherwise raw values stay.
- Wizard `MaxPlayers` writes `/Script/Engine.GameSession` (not
  `ServerSettings` — note the dual home vs IniService range-check).

## Common pitfalls

1. Wrong map URL quoting → ASA Commandline log drops quotes / misparses session.
2. Putting RCON / passwords / QueryPort on CLI → use `syncProfileSettingsToIni`.
3. `windowsVerbatimArguments: true` + spaced install path → broken argv.
4. cmd / start / `.cmd` wrapper → lifecycle tracks the shell, not ASA.
5. Treating OS spawn as `running` → wait for RCON (or `skipReadinessCheck` in tests).
6. Expecting Runtime logs with native console → pipes are off in that mode.
7. Treating client INI regeneration as user dirty → sanitize first.
8. Assuming restart is one IPC → it is stop + start in the renderer.
9. Relying on `skipPortValidation` → currently a no-op.

## Tests that lock behavior

| File | Focus |
| --- | --- |
| `tests/unit/launch-args.test.ts` | CLI shape; no listen/RCON/passwords/QueryPort |
| `tests/unit/sync-profile-ini.test.ts` | Exact INI keys / null password → `""` |
| `tests/unit/validation.test.ts` | Ports, paths, cluster, mods, conflicts |
| `tests/unit/ini-service.test.ts` | Sanitize + semantic validation |
| `tests/unit/configuration-wizard-model.test.ts` | Presets, difficulty, preserve unknowns |
| `tests/integration/process-manager-real-start.test.ts` | win32 direct spawn / spaced paths |

See also [backups.md](backups.md) (restore requires `!isActive`),
[updates-steamcmd.md](updates-steamcmd.md) (safe update stop/restart), and
[logs.md](logs.md) (runtime buffer from piped stdout/stderr).
