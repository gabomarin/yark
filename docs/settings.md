# Settings (app-wide preferences)

Operator preferences for the **YARK desktop shell and tooling**. Settings does
**not** edit per-server ASA gameplay INI or profile networking — those live on
the Server tab / workspace.

## Intent

- Centralize SteamCMD path, desktop-shell behavior, and shared UX prefs.
- Keep per-server operational toggles (for example **Auto-start with YARK**) on
  the profile that owns them; Settings only summarizes where helpful.
- Persist durable prefs in SQLite `app_settings`; keep a few create-flow
  conveniences in renderer `localStorage`.

## Module map

| Role | Path |
| --- | --- |
| Page shell | `src/renderer/src/features/settings/SettingsPage.tsx` |
| General controls | `…/components/SettingsGeneralSection.tsx` |
| Auto-start summary | `…/components/SettingsAutoStartSection.tsx` |
| Density load/migrate | `…/settingsModel.ts` |
| Tray / Windows startup hook | `…/useDesktopShellPreferences.ts` |
| Desktop-shell persist | `src/main/desktop-shell-settings.ts` |
| Windows login item | `src/main/windows-login-item.ts` |
| Tray icon / menu | `src/main/app-tray.ts` |
| Shared keys / defaults | `src/shared/desktop-shell.ts`, `src/shared/ui-density.ts` |
| Density theme apply | `src/renderer/src/app/AppProviders.tsx`, `src/renderer/src/main.tsx` |
| SteamCMD service | `src/backend/domains/updates/*` (path/install/caches) |
| IPC | `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc-handlers.ts` |

## What lives where

| On Settings | Elsewhere |
| --- | --- |
| Close-to-tray, tray toast, Start with Windows | Per-server `autoStart` toggle (Server tab → Startup) |
| UI density (compact / comfortable) | Theme is **hardcoded dark** (`AppProviders`) — no light/dark control |
| SteamCMD path + shared caches | Live progress: floating dock + Logs → Updates |
| Default create base folder (`localStorage`) | Profile `installDir` (absolute, per server) |
| App data folder shortcuts | Backup disk-alert thresholds (Backups page modal) |
| Opted-in auto-start **summary** | Quit-with-servers Stop/Cancel dialog (hardcoded in main; not a Setting) |

## Controls and defaults

### General

| Control | Storage | Default | Notes |
| --- | --- | --- | --- |
| Show server console on start | `localStorage` `overview.openNativeTerminalOnStart` (`"1"`/`"0"`) | off | Passed as `StartServerOptions.openNativeConsole` |
| Close window to tray | SQLite `closeWindowToTray` | **on** | Hide on close; minimize still uses the taskbar |
| Show notification when hiding to tray | SQLite `trayCloseHintDismissed` (UI inverted) | toast **on** | Visible only when close-to-tray is on |
| Start with Windows | SQLite `startWithWindows` + `setLoginItemSettings` | **off** | App only — does **not** start ASA (#54 vs #53) |
| Display size | SQLite `uiDensity` | **compact** | `compact` \| `comfortable`; see [design-system.md](design-system.md) |
| Default base folder | `localStorage` `settings.defaultServerBaseFolder` | unset | Prefills create-server base path only |

IPC for shell / density:

| Channel | API |
| --- | --- |
| `app:get-ui-density` / `app:set-ui-density` | `getUiDensity` / `setUiDensity` |
| `app:get-desktop-shell-preferences` | `getDesktopShellPreferences` |
| `app:set-close-window-to-tray` | `setCloseWindowToTray` |
| `app:set-start-with-windows` | `setStartWithWindows` |
| `app:set-tray-close-hint-dismissed` | `setTrayCloseHintDismissed` |
| `app:list-data-folders` / `app:open-data-folder` | App / backups / update-logs / steamcmd roots under `userData` |

Density load: `main.tsx` calls `loadUiDensityPref()` before the first theme mount.
`getUiDensity` returns `null` when unset (caller applies default; read does not
write). Legacy `localStorage` key `settings.uiDensity` migrates once and clears
only after a successful SQLite write.

### Server auto-start summary (#53)

Lists profiles with `autoStart === true` (column `auto_start`, default **false**).
Badges: Will start / Ignored (inactive) / Blocked (install not ready). Edit the
preference on the Server tab. Launch order and skip rules:
[server-lifecycle.md](server-lifecycle.md#auto-start-on-application-launch-53).

### SteamCMD

| Control | IPC / storage | Notes |
| --- | --- | --- |
| Path + Choose… | SQLite `steamcmdPath` via `steamcmd:set-path` | Validates file exists + `steamcmd +quit`; resets content-cache freshness |
| Install SteamCMD | `steamcmd:install` | Shown when `detected === false` |
| Shared caches | `steamcmd:open-cache` / `steamcmd:clear-cache` (`depot` \| `content`) | Clear blocked while jobs run |

Full SteamCMD workflows: [updates-steamcmd.md](updates-steamcmd.md).

### App data folders

Collapsed list with Open actions for App data, Backups, Update logs, and Bundled
SteamCMD under Electron `userData`.

## Related subsystems (not on this page)

- **Backup disk alerts** — key `backupDiskAlerts.v1`; IPC
  `backups:get-disk-alert-settings` / `backups:set-disk-alert-settings`; UI on
  Backups page. Defaults and normalize rules: [backups.md](backups.md).
- **Quit policy (#59)** — always Stop / Cancel when quitting with active
  servers; no Settings Ask/Stop preference.
- **ASA settings catalog** (`docs/asa-server-settings-catalog.json`) — INI
  editor metadata, unrelated to this page.

## Common pitfalls

1. **Two storage backends** — density / shell / SteamCMD path → SQLite;
   console-on-start + default base folder → `localStorage` only.
2. **Start with Windows ≠ Auto-start with YARK** — #54 opens the app; #53 starts
   opted-in ASA profiles after reattach.
3. **Tray toast polarity** — stored key is `trayCloseHintDismissed`; the switch
   is “show notification” = `!dismissed`.
4. **No theme toggle** — operator docs that mention a theme control are stale;
   appearance on Settings is density only.
5. **Do not persist density default on read** — only user changes (or legacy
   migration) write `uiDensity`.
6. **Shell switches disabled until IPC ready** — failed preference load leaves
   controls disabled at defaults.
7. **SteamCMD set-path** rejects empty paths and requires a successful `+quit`.
8. **`setStartWithWindows`** can fail after the DB write if login-item
   registration throws (win32).
9. Desktop-shell errors may surface next to App data folders (`shellError`).

## Tests

| File | Focus |
| --- | --- |
| `src/renderer/src/features/settings/SettingsPage.test.tsx` | Page controls, density, caches, base folder, SteamCMD setup |
| `tests/unit/ui-density-pref.test.ts` | Load / write / legacy migration |
| `tests/unit/app-settings-ui-density.test.ts` | SQLite round-trip |
| `tests/unit/desktop-shell-settings.test.ts` | Tray / Windows prefs persist |
| `tests/unit/auto-start.test.ts` | Launch skip/start behavior |
| `scripts/visual-settings.cjs` | Packaged Settings visual review |

See also [server-lifecycle.md](server-lifecycle.md) (tray, auto-start, quit),
[design-system.md](design-system.md) (density tokens), and
[updates-steamcmd.md](updates-steamcmd.md).
