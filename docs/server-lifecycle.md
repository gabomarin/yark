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
| ASA launch-options catalog (#92) | `src/shared/asa-launch-options-catalog.ts` (+ JSON); see [launch-options-catalog.md](launch-options-catalog.md) |
| Profile → INI sync | `src/backend/domains/instances/sync-profile-ini.ts` |
| Orchestration | `src/backend/domains/instances/instance-service.ts` |
| Profile validation | `src/backend/domains/instances/validation.ts` |
| Import existing install (#254) | `src/backend/domains/instances/import-existing-install.ts` |
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
| `-ServerPlatform` | CLI (default `ALL` unless structured/raw trailing args already set it) |
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
3. `-ServerPlatform=ALL` unless structured or raw trailing args match `/ServerPlatform/i`
4. `-mods=id1,id2,…` when `mods.length > 0`
5. If **both** `clusterId` and `clusterDir` are set:
   `-clusterid=…`, `-ClusterDirOverride=…`, `-NoTransferFromFiltering`
6. Structured Launch-tab selections (`structuredLaunchArgs`, catalog id → token)
7. `…profile.extraArgs` (raw Extra arguments)

UI: workspace tab **Launch** (after Mods) edits structured + raw; create/edit
Server form no longer hosts Mods IDs or Extra arguments.
See [docs/launch-options-catalog.md](launch-options-catalog.md) for curation.

UI / runtime logs use `formatLaunchCommandLine` (logical `"` quotes). On
Windows, live spawn uses `buildWindowsVerbatimSpawnArgs` so Node does not add
an outer quote pair around the complete, spaced map URL.

Example logical argv:

```text
"TheIsland_WP"?SessionName="MyServer" -port=7777 -ServerPlatform=ALL -mods=123,456
```

### Custom / modded maps (#65 Phase 1)

ASA map packs use the same launch shape as content mods:

| Concern | Behavior |
| --- | --- |
| Launch token | `profile.map` in argv[0] map URL (official `KNOWN_MAPS` or free-form e.g. `Svartalfheim_WP`) |
| Map pack Project ID | Must be **enabled** on `profile.mods` → `-mods=` |
| Linked identity | Optional `profile.mapModId` for custom maps; cleared for official maps |
| ASE `ActiveMapMod` / `-MapModID=` | **Not used** |

Operator flow: enable a CurseForge **Maps** mod → toast (map unchanged) → Server Information
**Map** groups Official / Map mods / Custom… → choosing a Map mod sets `map` + `mapModId`.

**Start blockers** (`mapIdentityStartBlockers` / `assertMapIdentityReadyForStart`): for a custom
map, Start fails when `mapModId` is unset, missing from `mods`, or listed in `disabledMods`.
The Launch tab shows a yellow alert for the same cases (soft). Save remains soft-warn only.

Research archive + live evidence: [spikes/65-modded-asa-maps.md](spikes/65-modded-asa-maps.md).
Engineering Mods inventory / `-mods=`: [mods.md](mods.md). Operator guide: website
`docs/mods.mdx` (Maps / custom worlds) and `docs/lifecycle.mdx`.

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

| Mode | `shell` | `windowsVerbatimArguments` | `windowsHide` | `detached` | stdio |
| --- | --- | --- | --- | --- | --- |
| Piped (default) | `false` | `true` on Windows | `true` | `true` | ignore / pipe / pipe |
| Native console (`openNativeConsole`) | `false` | `true` on Windows | `false` | `true` | ignore |

Constraints:

- Do **not** wrap with `.cmd` / `cmd /c` / `start` — wrong tracked PID and a
  flashing console. Integration test
  `tests/integration/process-manager-real-start.test.ts` (win32-only) asserts
  the PID is `ArkAscendedServer.exe`.
- Keep the map URL literal in verbatim mode. Node's default escaping wraps a
  spaced map URL in an extra pair, producing
  `""Map"?SessionName="My Server""` in ASA's Commandline log.
- Quote each other spaced argument independently. CreateProcess receives the
  executable path separately, and `argv0` is quoted explicitly, so a spaced
  install path does not require a shell wrapper.
- Spawn is always **detached** so ASA can survive an unexpected Electron exit
  (crash / Task Manager). While a server is managed, YARK **checkpoints**
  process identity (PID + OS creation time required) and clears it on clean
  stop/exit. On the next launch, startup re-validates identity before reattach.
  There is no user-facing Leave-running quit option — prefer **Close window to
  tray** to keep YARK (and backups) alive. Stop waits for starting with a
  readiness timeout so quit cannot hang forever.
- Native console and piped Runtime logs are mutually exclusive for the **console
  window** — with a native console, Runtime is mostly system messages. With the
  console off (piped mode), YARK still captures any stdout/stderr and **tails
  `ShooterGame/Saved/Logs/ShooterGame.log`** into the same in-memory Runtime buffer
  (`MAX_RUNTIME_LOG_LINES = 1200`). Piped mode also appends `-log` when missing
  so Unreal is more likely to write those disk logs.
- `servers:open-native-terminal` opens a separate `cmd` in the install dir; that
  is **not** the game process.

Kill on win32 uses `taskkill /pid … /T /F`.

## Start / stop / kill / restart

IPC:

| Channel | Backend |
| --- | --- |
| `servers:start` | sync INI → `ProcessManager.start` |
| `servers:set-enabled` | Locked explicit enable/disable transition; never starts or stops ASA implicitly. |
| `servers:stop` | `InstanceService.stop`: RCON `SaveWorld` → wait `SAVE_WAIT_MS` (8s) → `DoExit` exact process → best-effort stable `pre_stop` backup (world/ini). Progress via `push:server-stop-progress`. Pass `{ backup: false }` to skip the snapshot (SteamCMD update/verify, restart). |
| `servers:restart` | `InstanceService.restart`: lock `"restart"` → stop with `{ backup: false }` → fail-hard `pre_restart` backup → start. Options match `servers:start` (`StartServerOptions`). |
| `servers:kill` | immediate terminate (warning event; UI confirms) |

Status push: `push:server-status`. Stop phase progress: `push:server-stop-progress`.

### Enabled and disabled profiles

`ServerProfile.enabled` is persisted profile visibility/lifecycle state, not
runtime process state. Existing and new rows default to enabled. Generic profile
updates cannot change it; only `InstanceService.setServerEnabled` may do so.

- Disable requires the per-server operation lock and a stopped, idle profile.
  Configuration, INIs, mods, health, logs, backups, offline SteamCMD work,
  cloning, export, and deletion remain available.
- Enable revalidates the profile, all saved-profile ports, and cluster
  compliance. It refreshes install health for the UI but **does not require**
  install `ready` (#132). It does not start ASA.
- Manual Start also owns the per-server lock. The common `startInternal` path
  rejects disabled profiles and non-`ready` installs, covering restart and
  maintenance recovery paths. **enabled** = fleet/profile eligibility;
  **installation ready** = spawn eligibility.
- Clones inherit the source enabled state and receive a unique sibling install
  directory. Disabled profiles remain cluster members and participate in port
  conflict checks.
- **Install directory** is read-only in normal profile editing. Relocate with
  **Move installation** (`servers:move-install`): requires stopped idle server,
  lock `"move-install"`, source health `ready`, empty/missing destination.
  Same-volume moves use folder rename (with verify + rollback); cross-volume
  copies via a YARK-owned temp folder (includes `ShooterGame\Saved`) with live
  copy progress (free-space estimate), then promote. After verify, commit
  `install_dir` and delete the previous folder when it still exists. Progress:
  `push:move-install-progress`. Interrupted temp dirs are recorded and swept on
  app start (including destination parents that are not profile parents).
  Failures before commit never leave the profile on an unverified destination.
  If deleting the previous folder fails, main records that prior path
  (`move-install-pending-cleanup.json`); `servers:move-install-cleanup` may only
  wipe that recorded path for that server (#215) — renderer-supplied mismatches
  are rejected with no filesystem side effects. A later successful move clears
  pending only when it removed that same recorded path, so an older leftover is
  not dropped from the registry.

### Remove or delete a server (#267)

Overview card kebab / context menu → **Delete server** opens a confirm
(`servers:delete` with required `{ deleteInstallFiles: boolean }`). Both modes
reject while the process is active. Missing profiles are a no-op.

| Mode | UI | Disk | Notes |
| --- | --- | --- | --- |
| **Remove from YARK only** (default when a choice is shown) | Keeps install path copy; blue “kept” alert | Never calls `rm` on `installDir` | Allowed even when another profile shares the path. Import (#254) can re-adopt only a **ready** ASA tree |
| **Delete everything** | Danger alert; confirm **Delete everything** | Recursive wipe of `installDir` after wipe-safety + shared-path checks | Same full wipe as before #267 |

**Empty install folder:** when install health is `empty` (folder exists but has
no ASA files — typical never-installed profile), the mode picker is hidden and
delete always wipes the empty path. Keeping an empty folder is not useful:
Import rejects empty / incomplete trees. Health `missing` and `incomplete` still
show both modes (partial work or path issues may still matter to the operator).
The empty shortcut sends `requireEmptyInstall: true`; the backend re-inspects
with cache bypass and refuses the wipe if the folder is no longer empty, so the
UI falls back to an explicit mode choice.

**What is purged:** the `servers` row and one fleet audit event (`server_deleted`).
Related `events` / `backups` / `backup_policies` rows are **not** FK-cascaded
(same as historical delete). Profile-only events state that files were kept and
record the path.

**Contrast with related flows:**

- **Disable** (#129) — profile stays in YARK; no spawn. Not a removal.
- **Remove from YARK only** (#267) — catalog row gone; ASA folder untouched.
- **Delete everything** (#267) — profile + install folder wipe.
- **Import install** (#254) — reverse of profile-only remove: adopt an existing
  on-disk folder as a new profile (ready installs only).

**Start** (`InstanceService.start`):

1. Acquire the per-server operation lock and reject disabled profiles.
2. Bypass-cache install-health inspect — reject unless `health === "ready"`.
3. Apply optional `sessionPorts` onto an **effective** profile (not persisted).
4. Port-conflict check vs **other active** servers (`findPortConflicts` on effective ports).
5. Host TCP/UDP probe on effective ports (`assertHostPortsAvailable`): UDP game +
   query, TCP RCON. **Busy** always blocks start. **Inconclusive** blocks unless
   `skipPortValidation: true` (“Start anyway”). Errors may include a
   bind-confirmed free `suggested=` set for a session-only retry.
6. `await syncProfileSettingsToIni` (effective ports).
7. `processes.start` (args from `launchArgsOverride` or `buildLaunchArgs` on the
   effective profile). Runtime ports are kept on the managed process for the
   whole session (stop / RCON / player watcher / hot SaveWorld) and written into
   the durable process checkpoint / Leave identity so crash reattach restores them.
8. Event `server_started` (“waiting for readiness”; notes session ports when used).

**Busy** recovery: `sessionPorts` (this run only) or permanently editing saved
ports. **Inconclusive** also offers **Start anyway** (`skipPortValidation`),
which does not bypass busy. After a **restart** that already stopped the process,
probe recovery actions call **start** (not restart again).

Actionable install degradation (e.g. `ready` → `missing`) emits
`installation_health_degraded` once per transition (no startup spam).

### Auto-start on application launch (#53)

After leave-running reattach completes (`reattachLeftRunningProcesses` in
`src/main/index.ts`), `runAutoStartOnLaunch` evaluates profiles with
`autoStart === true`:

1. Skip Inactive (`enabled === false`) — preference kept; event `auto_start_skipped`.
2. Skip already managed / reattached (`ProcessManager.isActive`).
3. Skip uncertain reattach (`inaccessible` left-running identity).
4. Otherwise call `InstanceService.start` (same guards as manual start: ready
   install, ports, locks). Concurrency **1** (sequential). Failures emit
   `auto_start_failed` and do not stop the queue; success emits
   `auto_start_succeeded` (plus the usual `server_started` from start).

Opt-in default is `false`. UI: Server tab Startup switch + Settings summary.

**Readiness:** status stays `"starting"` until RCON `ListPlayers` on
`127.0.0.1` succeeds. Probes wait for a startup log signal **or** a minimum boot
grace (~45s), then require a successful probe, a settle window (~15s), and a
confirming probe before `"running"` (poll `DEFAULT_READY_POLL_MS = 3000`, timeout
`DEFAULT_READY_TIMEOUT_MS = 10 * 60 * 1000`). Log patterns can unlock probes
early; `skipReadinessCheck` skips this for tests / binaries without RCON.
Timeout → `"error"` + terminate. The persistent UI RCON session connects a few
seconds after promotion to `"running"` — workspace console, players, and ban
list: [rcon.md](rcon.md).

**Stop** (`InstanceService.stop`):

1. Emit stop-progress (`saving`).
2. `ProcessManager.beginGracefulStop` — status `stopping`, RCON `SaveWorld` + wait
   and return an ownership handle for the exact child.
   RCON failure → kill + clear (no backup).
3. `finishGracefulStop` validates the ownership handle, then `DoExit` / kill
   fallback. A replacement process is left untouched.
4. Unless `{ backup: false }`, `BackupService.createPreStopBackup` packages
   stable stopped files (skip flush; kinds world/ini).
5. Clear stop-progress. Event distinguishes saved, RCON-killed, externally
   exited, and backup-failed outcomes.

Stop is single-flight and holds the per-instance operation lock. Force close,
start, update, and verify are rejected while its backup is active. If the
server is still `"starting"`, stop waits for readiness (stop-progress phase
`waiting`) before SaveWorld so RCON can succeed. Normal app close waits for
active stop jobs before quitting. App-quit **Stop** uses the same graceful
path (`InstanceService.stopAllForAppQuit`, including pre-stop backup).

**Restart** (`InstanceService.restart` via `servers:restart`):

1. Reject if the process is not active.
2. Hold per-instance lock purpose `"restart"` for the whole sequence.
3. Register a **critical job** through stop + `pre_restart` (not start) so
   `isStopInProgress` / backups IPC / Force close cover the recovery ZIP after
   the inner stop job clears. Concurrent user `stop` rejects while that critical
   job is active (does not coalesce onto the no-backup stop).
4. App quit uses `shouldBlockAppQuit` / `settleForAppQuit`: wait for critical
   stop/backup work **and** the `"restart"` lock (covers post-backup sync →
   spawn), then graceful `stopAllForAppQuit` if any process is still active.
5. `enqueueStop(id, false)` — SaveWorld / DoExit **without** a nested
   `pre_stop` snapshot (avoids double backup and nested `stop-and-backup` lock).
6. `createPreRestartBackup` (`pre_restart`, world/ini, `skipFlush: true`)
   — **fail-hard**: on failure the server stays stopped and start is not called.
7. `startForMaintenance` under the same `"restart"` lock (same start path as
   `servers:start`, including `openNativeConsole` from the renderer).

`App.restartServer` calls a single `window.api.restartServer` IPC. Failure
table: lock conflict / not running → reject before work; stop failure → no
backup/start; backup failure → stopped, no start; start failure → left stopped
with a completed `pre_restart` snapshot.

**App quit (#59):** Tray **Quit YARK** and closing the window with **Close
window to tray** disabled both enter `before-quit`. When managed servers are
active, YARK always shows a confirmation dialog (Stop / Cancel):

- **Stop**: wait for any still-starting servers, then graceful stop (SaveWorld →
  DoExit → pre-stop backup) with stop-progress in the UI, then quit.
- **Cancel**: abort quit and restore the window.

There is no Settings Ask/Stop preference and no Leave-running quit option.
Prefer **Close window to tray** so YARK (and scheduled/player backups) keep
running with the servers. Process attach/detach exists for **crash recovery and
forced closes** (Task Manager / unexpected Electron exit): durable checkpoints
written while servers are active; startup validates candidates, reattaches
matches as `starting` until RCON confirms (`running`), and records
rejected/stale outcomes. Reattach never force-kills on RCON timeout.

Windows e2e for this path (manual Windows check before merge — not in CI):

```bash
npm run build
npm run e2e:quit-policy
npm run e2e:crash-reattach
```

`e2e:crash-reattach` needs SteamCMD plus a warm ASA content cache (or time for
a full install). Mark as a required manual step on PRs that touch quit/reattach.

Hide-to-tray is **not** a quit and never stops servers. Critical in-flight
stop/restart work still uses `shouldBlockAppQuit` / `settleForAppQuit` first.
With **Close window to tray** off, closing while servers are active keeps the
window open until the quit confirmation resolves (Cancel restores the UI; Stop keeps
the window visible through wait/save/backup progress).

### System tray and Windows startup (#54)

- **Close window to tray** (default on): the window close button hides YARK to
  the system tray instead of quitting. Minimize still uses the normal taskbar.
  Optional Windows toast (Settings: **Show notification when hiding to tray**,
  default on); click the toast or tray icon to reopen. Quit from the tray menu
  to exit. There is no native application menu bar (Electron default File/Edit/
  View/Help is disabled).
- **Start with Windows** (default off): uses Electron `setLoginItemSettings` so
  toggling does not leave duplicate login registrations. Dev (`electron .`)
  registers the Electron binary with the app path as an argument; packaged
  builds register `YARK.exe`. This does **not** auto-start ASA servers (#53).
- Second-instance launches focus the existing window (`requestSingleInstanceLock`).

`StartServerOptions.sessionPorts` optionally overrides game/query/RCON for a
single start (INI sync + launch). It does **not** update the saved profile;
runtime ports stay on the managed process until exit so stop/RCON use them, and
are stored on leave/crash checkpoints for reattach.
`StartServerOptions.skipPortValidation` allows start only when the host probe
is **inconclusive** (never when busy).

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

Host probe (start only): bind-probes UDP game/query and TCP RCON. Busy includes
best-effort Windows owner PID/name (async PowerShell). Inconclusive never claims
occupied; it blocks unless `skipPortValidation`. Suggestions use the same bind
probe and skip ports reserved by other YARK profiles. Start checks active peers
using each peer’s **runtime** ports (session overrides included).

Hot profile updates while running are allowed; ports/map take effect after the
next restart.

## Main-process I/O (#145)

Interactive fleet/start/stop/update paths must not use unbounded `*Sync`
filesystem or child-process APIs. Shared helper:
`src/backend/infra/process/exec-file-bounded.ts` (timeout + `maxBuffer`).

| Path | Behavior |
|------|----------|
| Install inspect (fleet / start) | `inspectServerInstallationAsync` — promise FS; opt-in PowerShell VersionInfo / log tails via `execFileBounded` |
| Crash reattach / checkpoints | `queryWindowsProcessIdentity` async PowerShell |
| Stop / kill / SteamCMD cancel / move cancel | `killWinProcessTreeAsync` (`taskkill` bounded) |
| SteamCMD discovery | Candidate `access` + bounded `where.exe` (status polls skip `where`) |

Local Windows sample (2026-08-10, `node scripts/bench-main-hot-paths.cjs`):

| Probe | p50 | p95 |
|-------|-----|-----|
| Async FS install probe (version + manifest) | ~1.0 ms | ~1.4 ms |
| Bounded `where.exe steamcmd` | ~39 ms | ~45 ms |
| Bounded PowerShell PID identity | ~221 ms | ~586 ms |

These remain wall-clock work but run off the main thread’s sync call stack so
IPC/UI can continue. Re-run the script after storage changes; CI does not gate
on the numbers.

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

## Import existing ASA install (#254)

When ASA files already exist on disk (orphaned after **Start empty**, or adopted
from another manager) but YARK has no profile:

1. Overview / workspace **New server ▾** → **Import install** (empty fleet also
   offers **Import existing install**).
2. Point at the **ASA dedicated root** (folder that contains `ShooterGame`).
3. YARK probes install health on folder selection. Only **ready** installs can
   continue. Paths under `ShooterGame\...` (e.g. `Binaries\Win64`) are rejected as
   nested folders with a suggested dedicated root. Incomplete / wrong shape are
   blocked. Best-effort GUS / SavedArks / Mods detection then creates a profile
   with the **absolute** `installDir` (does **not** nest via
   `resolveServerInstallDir` / base-folder create). Map prefill prefers the
   newest world `.ark` under `SavedArks` (mtime), then GUS leftovers, else
   `TheIsland_WP`.
4. No SteamCMD sync and **no INI writes** on import — profile-owned GUS keys
   sync on **Start** (same as other profiles). Discovered mod Project IDs import
   **disabled**.
5. Workspace opens on the new profile **without** first-steps onboarding (ASA
   files and world already exist on disk). Create/import/clone uniqueness checks
   are serialized so concurrent imports cannot share an `installDir` or ports.

Helpers: `src/backend/domains/instances/import-existing-install.ts`
(`resolveNestedAsaInstallRoot`, `probeImportInstall`).
IPC: `servers:probe-import`, `servers:import-existing`.
UI badges: `importHealthBadgeLabel` in
`src/renderer/src/features/servers/importInstallModel.ts`.

### Import probe badges

Only **Ready** unlocks Continue. Other badges block import and show guidance
next to the path field (including folders already owned by another YARK profile):

| Badge | When it appears |
| --- | --- |
| **Ready** | Chosen folder is a usable ASA dedicated root (`ArkAscendedServer.exe` present under the expected Win64 path). |
| **Already managed** | Folder matches an existing YARK profile `installDir` (case-insensitive). Continue is blocked; open that server instead. |
| **Nested folder** | Path contains a `ShooterGame` segment but is not the dedicated root (e.g. `...\ShooterGame\Binaries\Win64`). YARK suggests the parent of `ShooterGame` and offers **Use suggested folder**. |
| **Empty folder** | Path exists and is empty — fine for SteamCMD install, not for import. |
| **Incomplete** | ASA markers exist (`ShooterGame` / `Engine` / `steamapps`) but the dedicated executable is missing or the tree is only partial. |
| **Missing path** | Path does not exist on disk. |
| **Inaccessible** | Path exists but YARK cannot read it (permissions). |
| **Not an ASA install** | Non-empty folder without ASA layout (wrong folder / foreign contents). Operator-facing label for classifier health `suspicious` — not a malware warning. |
| **Check failed** | Unexpected I/O while probing the path. |

## Common pitfalls

1. Wrong map URL quoting → ASA Commandline log drops quotes / misparses session.
2. Putting RCON / passwords / QueryPort on CLI → use `syncProfileSettingsToIni`.
3. Default Node escaping around the spaced map URL → unwanted outer quotes.
4. cmd / start / `.cmd` wrapper → lifecycle tracks the shell, not ASA.
5. Treating OS spawn as `running` → wait for RCON (or `skipReadinessCheck` in tests).
6. Expecting Runtime logs with native console → pipes and Saved/Logs tail are
   off in that mode (use the console window, or turn native console off).
7. Thin Runtime with console off → check `ShooterGame/Saved/Logs/ShooterGame.log`
   exists and that `-log` is on the command line in Runtime system lines.
8. Treating client INI regeneration as user dirty → sanitize first.
9. Assuming restart skips backup → it takes a fail-hard `pre_restart` snapshot
   after stop and before start (`servers:restart`).
10. Using `skipPortValidation` on busy ports → still blocked; only inconclusive may proceed.
11. Expecting session ports to persist in SQLite → they only affect that run’s INI/CLI;
    stop/RCON still use the live runtime ports until the process exits.

## Tests that lock behavior

| File | Focus |
| --- | --- |
| `tests/unit/launch-args.test.ts` | CLI shape; no listen/RCON/passwords/QueryPort |
| `npm run e2e:import-install` | Windows UI: Import install wizard (#254) — nested/ready/Already managed, profile-only INI |
| `tests/unit/sync-profile-ini.test.ts` | Exact INI keys / null password → `""` |
| `tests/unit/validation.test.ts` | Ports, paths, cluster, mods, conflicts |
| `tests/unit/host-port-probe.test.ts` | Host bind classify, suggestions, UDP release, error prefixes |
| `tests/unit/instance-host-port-start.test.ts` | Start gate busy/inconclusive/sessionPorts |
| `tests/unit/left-running.test.ts` | Leave identity parse including optional runtimePorts |
| `npm run e2e:host-port-probe` | Windows UI: busy modal, Edit ports, session start |
| `tests/unit/ini-service.test.ts` | Sanitize + semantic validation |
| `tests/unit/import-existing-install.test.ts` | Mod tree discovery + GUS prefill + health gates |
| `tests/unit/configuration-wizard-model.test.ts` | Presets, difficulty, preserve unknowns |
| `tests/unit/asa-log-tail.test.ts` | Saved/Logs decode + follow for Runtime |
| `tests/unit/instance-stop.test.ts` | Pre-stop backup order / best-effort failure |
| `tests/unit/instance-restart.test.ts` | Restart order, fail-hard backup, lock conflict |
| `tests/integration/process-manager-real-start.test.ts` | win32 direct spawn / spaced paths |

See also [backups.md](backups.md) (restore requires `!isActive`),
[updates-steamcmd.md](updates-steamcmd.md) (stopped-server safe update,
`pre_update`, rollback, real-host validation),
[logs.md](logs.md) (runtime buffer from piped stdout/stderr and Saved/Logs tail;
`npm run e2e:launch-args` asserts structured/raw tokens on Runtime `Commandline`),
[rcon.md](rcon.md) (workspace console / players / ban list),
[settings.md](settings.md) (tray, Start with Windows, auto-start summary), and
[clusters.md](clusters.md) (transfer-compliance reports and cluster launch trio).
