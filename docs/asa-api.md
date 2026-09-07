# Ark Server API / Version.dll (#243)

Optional **community** server API support (not Wildcard, not CurseForge `-mods=`).
YARK installs and toggles the [ArkServerApi](https://github.com/ArkServerApi/AsaApi)
stack so operators can load native plugins beside an ASA dedicated; it does **not**
endorse third-party DLLs.

Operator-facing guide: website
[`/docs/ark-server-api/`](../website/src/content/docs/docs/ark-server-api.mdx).
Spawn / adopt / quit interactions: [server-lifecycle.md](server-lifecycle.md).
SteamCMD sync excludes only `ShooterGame\Saved` — see
[updates-steamcmd.md](updates-steamcmd.md) and **Pitfalls** below.

## Intent

- Give operators a stop-gated Install / Remove / plugin zip flow for community
  AsaApi under each server’s `ShooterGame\Binaries\Win64`.
- Default **Load on Start** injects via `Version.dll` so Start still spawns
  `ArkAscendedServer.exe` (single game PID). Optional loader mode parks
  Version.dll and adopts the game child of `AsaApiLoader.exe`.
- Keep download zips in YARK app data so reinstall / multi-server is cheap.

## Module map

| Role | Path |
| --- | --- |
| Facade | `src/backend/domains/asa-api/asa-api-service.ts` |
| Paths / GitHub constants | `asa-api-paths.ts` |
| Profile → inject mode + Version.dll park | `asa-api-inject.ts` |
| GitHub download + extract | `asa-api-install.ts` |
| Zip cache + prune | `asa-api-cache.ts` |
| Disk status + plugin enable/delete + legacy migrate | `asa-api-status.ts` |
| Plugin zip install | `asa-api-plugin-install.ts` |
| Uninstall Win64 API files | `asa-api-uninstall.ts` |
| Spawn binary / loader adopt | `launch-args.ts`, `process-start.ts`, `process-manager.ts` |
| “Loading Ark Server API…” window poll | `process-asa-api-loading.ts` |
| IPC wiring | `src/main/ipc-handlers.ts`, `src/shared/ipc.ts` |
| UI | `…/ServerAsaApiPanel/*` (workspace tab after Maintenance) |
| Schema | `schema-migrations.json` (`use_asa_api`, `use_asa_api_loader`) |

Cache root: `<userData>/cache/asa-api` (`appDataFolders.asaApiCache` in
`src/main/index.ts`). Settings → App data folders lists **Ark Server API downloads**.

## Profile flags → inject modes

SQLite columns `use_asa_api` / `use_asa_api_loader` map to profile
`useAsaApi` / `useAsaApiLoader` (defaults **false**). Patch group `"asaApi"`.

| Flags | `resolveAsaApiInjectMode` | Start binary | Version.dll on disk |
| --- | --- | --- | --- |
| `useAsaApi` false | `off` | `ArkAscendedServer.exe` | Parked as `Version.dll.yark-off` if present |
| `useAsaApi` true, loader false | `versionDll` | `ArkAscendedServer.exe` | Must be active `Version.dll` |
| both true | `loader` | `AsaApiLoader.exe` | Parked (loader must not see active Version.dll) |

`syncAsaApiVersionDll` / `syncAsaApiVersionDllForProfile` rename between
`Version.dll` and `Version.dll.yark-off`. If both active and parked exist when
parking, the active file is deleted. Version.dll mode throws if neither file
exists (operator must Install first). Called from Start / profile-flag updates
(`InstanceService`).

Clone copies both flags; Import install seeds them **false**. Config transfer
does **not** copy AsaApi flags or Win64 API files (identity / install stay on
the target).

## Operator surface

Workspace tab **Ark Server API** (last tab, after Maintenance):

1. **Install** — latest GitHub release of `ArkServerApi/AsaApi` (~25–30 MB zip)
   plus `ArkServerApi/AsaApiLoader` VersionLoader zip into this server’s Win64,
   with on-screen progress (`push:asa-api-install-progress`). Zips land under
   `{cache}/AsaApi/<tag>/` and `{cache}/AsaApiLoader/<tag>/`; keep **2** newest
   tag folders per repo; downloads use `.partial` then rename. **Clear download
   cache** is on the tab; Settings can open the folder.
2. **Remove** — deletes API / loader / plugins / parked DLL (and AsaApi-shaped
   `config.json` when recognized); game binaries stay. Clears profile Load-on-Start
   flags. Stop first.
3. **Load on Start** — off by default; Version.dll inject.
4. **Use older loader instead** — optional fallback if Version.dll fails.
5. **Plugins** — **Add plugin zip** → `ArkApi\Plugins\<Name>` (folder name matches
   `Name.dll`). Off moves the folder to sibling `ArkApi\Disabled_Plugins\`. Trash
   permanently deletes (confirm; server stopped). Legacy `Plugins\Name.disabled`
   and older `Win64\Disabled_Plugins` migrate on read/toggle.

Confirms (Remove, Clear cache, Delete plugin) use `AppPanelConfirmModal`
(same chrome as What's new / Quit YARK).

## Install pipeline (verified)

1. Fetch latest releases (`User-Agent: YARK-server-manager`).
2. Prefer `AsaApi_*.zip` from AsaApi; VersionLoader / `Version*.zip` from AsaApiLoader.
3. Obtain each zip (cache hit by path + size, else download to `.partial`).
4. Extract both into Win64; require `AsaApiLoader.exe`, `Version.dll` (or
   `.yark-off`), and `ArkApi\AsaApi.dll`.
5. Return status with `installedVersionLabel` = AsaApi release tag (UI keeps a
   session hint; `getStatus` does **not** persist the tag — disk scans return
   `installedVersionLabel: null`).

Progress phases: `resolving` → `downloading` → `extracting` → `finishing`.

## IPC

| Channel | Gate | Behavior |
| --- | --- | --- |
| `servers:asa-api-status` | — | Disk scan + legacy plugin migrate |
| `servers:asa-api-install` | Stop if live | Install + progress push |
| `servers:asa-api-uninstall` | Stop if live | Uninstall files; clear `useAsaApi*` |
| `servers:asa-api-set-plugin-enabled` | Stop if live | Move Plugins ↔ Disabled_Plugins |
| `servers:asa-api-delete-plugin` | Stop if live | Permanent delete |
| `servers:asa-api-add-plugin-zip` | Stop if live | Native open dialog → extract |
| `servers:asa-api-open-win64` / `open-plugins` | — | `shell.openPath` |
| `servers:asa-api-clear-cache` | — | Wipe `<userData>/cache/asa-api` |
| `push:asa-api-install-progress` | — | Normalized progress to all windows |

Live = any status with `processLive` for that server id.

## Process lifecycle

- **Version.dll (default):** Start = `ArkAscendedServer.exe`. No child adopt.
- **AsaApiLoader:** Start = `AsaApiLoader.exe`; YARK polls for child
  `ArkAscendedServer.exe` and **adopts** that PID for status / Leave /
  readiness. Kill prefers the loader PID with `taskkill /T` so the tree exits.
- While inject mode ≠ `off`, managed process sets `asaApiLoading` until the
  console **main window** appears (2s poll via `AsaApiWindowPoller`) **or**
  ShooterGame.log / runtime chunks start writing. Overview / workspace show
  **Loading Ark Server API…**; Runtime gets a system line that clears when the
  boot phase ends.

## Pitfalls

- **Windows only** (Win64 layout + `taskkill` / window probe).
- ASA game patches often break AsaApi until authors publish a new build —
  operators re-run **Install** / **Check updates** on a non-prod profile first.
- **SteamCMD robocopy does not preserve AsaApi.** Sync excludes only
  `ShooterGame\Saved` (`ASA_CONTENT_SYNC_EXCLUDE_DIRS`). Update / Verify can
  overwrite Win64 `Version.dll`, `AsaApiLoader.exe`, and `ArkApi\`. After an
  update job, re-check the tab (or re-Install) if Load on Start fails.
  Move-install copies the whole tree and keeps API files when the source had them.
- Direct SteamCMD `app_update` on the install dir (robocopy fallback) has the
  same risk for Win64 community files.
- YARK does not endorse community DLLs; treat them as operator-owned risk.

## Tests

| File | Focus |
| --- | --- |
| `tests/unit/asa-api-cache.test.ts` | Cache paths, size match, prune keep-2, clear |
| `tests/unit/asa-api-status.test.ts` | Inject park, plugin list / migrate / enable |
| `tests/unit/asa-api-plugin-install.test.ts` | Zip → Plugins folder layout |

Process-manager / launch coverage for loader adopt and loading chrome lives with
the broader lifecycle unit tests.
