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
| Log retention | `…/components/SettingsLogRetentionSection.tsx` |
| YARK self-update | `…/components/SettingsYarkUpdateSection.tsx` |
| Density load/migrate | `…/settingsModel.ts` |
| Tray / Windows startup hook | `…/useDesktopShellPreferences.ts` |
| Desktop-shell persist | `src/main/desktop-shell-settings.ts` |
| Window bounds / maximized | `src/main/window-state.ts` (`app_settings.windowState`) |
| Windows login item | `src/main/windows-login-item.ts` |
| Tray icon / menu | `src/main/app-tray.ts` |
| Shared keys / defaults | `src/shared/desktop-shell.ts`, `src/shared/ui-density.ts`, `src/shared/log-retention.ts`, `src/shared/app-update.ts` |
| Density theme apply | `src/renderer/src/app/AppProviders.tsx`, `src/renderer/src/main.tsx` |
| SteamCMD service | `src/backend/domains/updates/*` (path/install/caches) |
| YARK self-update | `src/main/app-update-service.ts` |
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
| **Log retention** limits + Clean up now | Per-section clear on Logs workspace; ASA Saved/Logs never touched — [logs.md](logs.md) |
| **YARK updates** check / download / restart | Overview **Check for updates** is ASA/SteamCMD only; sidebar `vX.Y.Z` accents when a YARK update is available — [versioning.md](versioning.md) |

## Controls and defaults

### General

| Control | Storage | Default | Notes |
| --- | --- | --- | --- |
| Show server console on start | `localStorage` `overview.openNativeTerminalOnStart` (`"1"`/`"0"`) | off | Passed as `StartServerOptions.openNativeConsole` |
| Close window to tray | SQLite `closeWindowToTray` | **on** | Hide on close; minimize still uses the taskbar |
| Show notification when hiding to tray | SQLite `trayCloseHintDismissed` (UI inverted) | toast **on** | Visible only when close-to-tray is on |
| Start with Windows | SQLite `startWithWindows` + `setLoginItemSettings` | **off** | App only — does **not** start ASA (#54 vs #53) |
| Display size | SQLite `uiDensity` | **compact** | `compact` \| `comfortable`; see [design-system.md](design-system.md) |
| Quick jump | localStorage `yark.spotlightRecent.v1` (MRU) | Ctrl+K | Jump to pages/servers; Recent group; Settings → General + logo tooltip (#104) |
| Window size / position | SQLite `windowState` | **maximized** | Remembers last bounds + maximized; off-screen → maximize again |
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
| Path + Choose… | SQLite `steamcmdPath` via `steamcmd:set-path` | Validates file exists + `steamcmd +quit`; resets content-cache freshness. Chip is shared `ReadonlyPath` with Choose… and **Install SteamCMD** on the same row (not `PathField`) so the install CTA stays beside the path (#234). |
| Install SteamCMD | `steamcmd:install` | Shown when `detected === false` |
| Shared caches | `steamcmd:open-cache` / `steamcmd:clear-cache` (`depot` \| `content`) | Clear blocked while jobs run |

Full SteamCMD workflows: [updates-steamcmd.md](updates-steamcmd.md).

### App data folders

Collapsed list with Open actions for App data, Backups, Update logs, and Bundled
SteamCMD under Electron `userData`.

The profile SQLite file is `yark-server-manager.db` under App data. On open,
YARK sets `busy_timeout` (5s) so a brief lock does not fail boot immediately.
When that file already exists, boot also keeps rotating snapshots under
`profile-db-snapshots/` (before schema migrations and after each healthy reopen)
for manual rollback — see [profile-database.md](profile-database.md) (#252).
If the database cannot open or migrate, boot shows a recovery dialog instead of
a blank window: **Restore snapshot** (when available), **Open folder**, **Quit**,
or **Start empty…** (YARK does not repair the live file; Start empty / Restore
rename the broken DB + WAL/SHM as `*.corrupt.<timestamp>` first). ASA installs on
disk are not deleted. See [profile-database.md](profile-database.md) (#218, #252).

### Log retention (#84)

| Control | Storage | Default | Notes |
| --- | --- | --- | --- |
| Keep routine events (days) | `logRetention.v1` | 90 | Non-failure SQLite events; min 1 day |
| Keep failure events (days) | same | 180 | Must be ≥ routine days; min 1 day |
| Keep successful update logs | same | 20 | Per-server count |
| Keep failed update logs (days) | same | 180 | Failed/unknown SteamCMD files; min 1 day |
| Automatic cleanup | same | on | Startup + ~daily; changes save immediately |
| Clean up now… | IPC preview/run | — | Scan → Remove; reports skipped/failed |

Full ownership table and recovery limits: [logs.md](logs.md#ownership-and-retention-84).

### YARK updates (#165)

In-app update for the **desktop app** (not ASA files). Uses `electron-updater`
against GitHub Releases (`latest.yml` from the release workflow). While the app is
`0.x`, GitHub prereleases are accepted (the release workflow marks every `0.x` tag
as prerelease). From `1.0.0+`, only non-prerelease releases count. No silent
download — operator must Check → Download → Restart and install. A later
Check now (or the quiet ~60s startup check) must not downgrade `ready` /
`downloading` back to Download for the same version.

| Control | IPC | Notes |
| --- | --- | --- |
| Status | `app:get-update-status` + `push:app-update` | Quiet check ~60s after launch |
| Check now | `app:check-for-update` | Packaged: updater feed; unpackaged: GitHub API compare |
| Download | `app:download-update` | Packaged only |
| Restart and install | `app:install-update` | Only rendered once a download is ready; blocked if servers running, SteamCMD/critical jobs busy, or settle in progress |
| Release notes | `app:open-yark-release-notes` | Opens GitHub in the browser |

The section is a single compact row: heading, then `v{APP_VERSION} · <status>`,
with the actions right-aligned. Progress, install-block, and error lines only
render when they apply.

Sidebar `vX.Y.Z` uses cryo accent + tooltip when an update is available; click
opens this Settings section (does not install directly). When a quiet check (or
**Check now**) finds an update — or a download finishes — the shell also shows an
operator toast that deep-links here. Up-to-date and quiet-check failures stay
silent outside Settings status text.

## Related subsystems (not on this page)

- **Backup disk alerts** — key `backupDiskAlerts.v1`; IPC
  `backups:get-disk-alert-settings` / `backups:set-disk-alert-settings`; UI on
  Backups page. Defaults and normalize rules: [backups.md](backups.md).
- **Quit policy (#59)** — always Stop / Cancel when quitting with active
  servers; no Settings Ask/Stop preference.
- **INI setting meta** (`src/shared/ini-setting-meta.json`) — descriptions / value types / inferred editor inputs from `defaults/*.ini` (`npm run catalog:ini-meta`); unrelated to this Settings page.

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
| `src/renderer/src/features/settings/SettingsPage.test.tsx` | Page controls, density, caches, base folder, SteamCMD setup, log retention, YARK updates |
| `tests/unit/log-retention.test.ts` | Defaults / normalize / failure classification |
| `tests/unit/logs-service.test.ts` | Retention preview/run path guards |
| `tests/unit/ui-density-pref.test.ts` | Load / write / legacy migration |
| `tests/unit/app-settings-ui-density.test.ts` | SQLite round-trip |
| `tests/unit/desktop-shell-settings.test.ts` | Tray / Windows prefs persist |
| `tests/unit/database-boot-recovery.test.ts` | Corrupt DB open/migrate errors, quarantine, recovery loop |
| `tests/unit/auto-start.test.ts` | Launch skip/start behavior |
| `scripts/visual-settings.cjs` | Packaged Settings visual review |

See also [server-lifecycle.md](server-lifecycle.md) (tray, auto-start, quit),
[design-system.md](design-system.md) (density tokens), and
[updates-steamcmd.md](updates-steamcmd.md).
