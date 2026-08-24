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
- Category rail (General, Servers, SteamCMD, Logs, About) — one pane at a
  time, like a native desktop settings window. Sidebar YARK-update icon
  opens **About**.

## Module map

| Role | Path |
| --- | --- |
| Page shell | `src/renderer/src/features/settings/SettingsPage.tsx` |
| Category rail | `…/components/SettingsNav.tsx` (`SETTINGS_CATEGORIES`) |
| General | `…/components/SettingsGeneralSection.tsx` |
| Servers (console, base folder) | `…/components/SettingsServersSection.tsx` |
| Auto-start summary | `…/components/SettingsAutoStartSection.tsx` |
| SteamCMD | `…/components/SettingsSteamCmdSection.tsx` |
| Log retention | `…/components/SettingsLogRetentionSection.tsx` |
| About (YARK updates + app data folders) | `…/components/SettingsYarkUpdateSection.tsx`, `…/components/SettingsAppDataSection.tsx` |
| Density / console-on-start load/migrate | `…/settingsModel.ts` |
| First-run setup wizard | `src/renderer/src/features/setup-wizard/` (`onboarding.v1`) |
| Tray / Windows startup hook | `…/hooks/useDesktopShellPreferences.ts` |
| Desktop-shell persist | `src/main/desktop-shell-settings.ts` |
| Window bounds / maximized | `src/main/window-state.ts` (`app_settings.windowState`) |
| Windows login item | `src/main/windows-login-item.ts` |
| Tray icon / menu | `src/main/app-tray.ts` |
| Shared keys / defaults | `src/shared/desktop-shell.ts`, `src/shared/ui-density.ts`, `src/shared/open-native-console.ts`, `src/shared/log-retention.ts`, `src/shared/app-update.ts` |
| Desktop alerts catalog | `src/shared/os-notification-events.ts` (allowlist, focus skip, cooldown, silent) |
| Windows OS toasts | `src/main/os-notifications.ts` (`FleetOsNotifier`) |
| Crash / toast deep-links | `src/renderer/src/app/hooks/useAppServerLifecycle.ts` (`push:os-notification-open`) |
| Setup wizard shell | `src/renderer/src/app/hooks/useAppOnboarding.ts` |
| Density theme apply | `src/renderer/src/app/AppProviders.tsx`, `src/renderer/src/main.tsx` |
| SteamCMD service | `src/backend/domains/updates/*` (path/install/caches) |
| YARK self-update | `src/main/app-update-service.ts` |
| IPC | `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc-handlers.ts` |

## What lives where

| On Settings | Elsewhere |
| --- | --- |
| Close-to-tray, tray toast, Start with Windows | Per-server `autoStart` toggle (Server tab → Startup) |
| UI density (compact / comfortable) | Theme is **hardcoded dark** (`AppProviders`) — no light/dark control |
| SteamCMD path + shared caches | Live progress: **Downloads** page + footer teaser + Logs → Updates |
| Default create base folder (`localStorage`) | Profile `installDir` (absolute, per server) |
| App data folder shortcuts | Backup disk-alert thresholds (Backups page modal) |
| Opted-in auto-start **summary** | Quit-with-servers Stop/Cancel dialog (hardcoded in main; not a Setting) |
| **Log retention** limits + Clean up now | Per-section clear on Logs workspace; ASA Saved/Logs never touched — [logs.md](logs.md) |
| **YARK updates** check / download / restart | Overview **Check server updates** is ASA/SteamCMD only; sidebar `vX.Y.Z` accents when a YARK update is available — [versioning.md](versioning.md) |
| **What's new** (curated notes, one-shot after upgrade) | Sidebar version label; Settings → About → What's new (#290) |
| **Open setup assistant** (SteamCMD + Windows shell; full wizard when the fleet is empty) | First-run auto-show after a **successful** read when `onboarding.v1` is unset and there are no profiles; a read error keeps Overview usable and can be retried (#298) |

## Controls and defaults

### General

| Control | Storage | Default | Notes |
| --- | --- | --- | --- |
| Close window to tray | SQLite `closeWindowToTray` | **on** | Hide on close; minimize still uses the taskbar |
| Desktop alerts | SQLite `osNotifyEnabled` | **on** | Master switch for Windows notifications (#331) |
| Server crash | SQLite `osNotifyCrash` | **on** | Nested under Desktop alerts; click opens that server's log |
| Installs and updates | SQLite `osNotifySteamCmd` | **on** | Nested; one banner when install/update/verify finishes or fails. Click opens Downloads |
| YARK updates | SQLite `osNotifyYarkUpdate` | **on** | Nested; when a new YARK version is available or ready to install. Click opens Settings → About |
| Hide to tray | SQLite `trayCloseHintDismissed` (UI inverted) | toast **on** | Nested; visible only when close-to-tray is on. Also gated by Desktop alerts |
| Start with Windows | SQLite `startWithWindows` + `setLoginItemSettings` | **off** | App only — does **not** start ASA (#54 vs #53) |
| Display size | SQLite `uiDensity` | **compact** | `compact` \| `comfortable`; see [design-system.md](design-system.md) |
| Quick jump | localStorage `yark.spotlightRecent.v1` (MRU) | Ctrl+K | Jump to pages/servers; Recent group; Settings → General + logo tooltip (#104) |
| Window size / position | SQLite `windowState` | **maximized** | Remembers last bounds + maximized; off-screen → maximize again |
| Open setup assistant | SQLite `onboarding.v1` | unset until skip/complete | Empty fleet reopens the full wizard; otherwise Paths + Windows only. Does not reset SteamCMD (#298) |

### Servers

| Control | Storage | Default | Notes |
| --- | --- | --- | --- |
| Show server console on start | SQLite `openNativeConsoleOnStart` (`"1"`/`"0"`) | off | Passed as `StartServerOptions.openNativeConsole` on Start, Restart, and Auto-start. Also on first-run Windows step. Legacy `localStorage` `overview.openNativeTerminalOnStart` migrates once. |
| Default base folder | `localStorage` `settings.defaultServerBaseFolder` | unset | Prefills create-server base path only |
| Server auto-start summary | Profile `autoStart` | off | Lists opted-in servers; edit on the Server tab |

IPC for shell / density / console:

| Channel | API |
| --- | --- |
| `app:get-ui-density` / `app:set-ui-density` | `getUiDensity` / `setUiDensity` |
| `app:get-open-native-console` / `app:set-open-native-console` | `getOpenNativeConsole` / `setOpenNativeConsole` |
| `app:get-desktop-shell-preferences` | `getDesktopShellPreferences` |
| `app:get-last-seen-changelog-version` / `app:set-last-seen-changelog-version` | What's new dismiss |
| `app:get-onboarding` / `app:set-onboarding` | First-run wizard `onboarding.v1` (`completed` \| `skipped`, or `null` to clear) |
| `app:set-close-window-to-tray` | `setCloseWindowToTray` |
| `app:set-start-with-windows` | `setStartWithWindows` |
| `app:set-tray-close-hint-dismissed` | `setTrayCloseHintDismissed` |
| `app:set-os-notify-enabled` / `app:set-os-notify-crash` / `app:set-os-notify-steamcmd` / `app:set-os-notify-yark-update` | Desktop alerts master + crash + installs/updates + YARK update categories (#331) |
| `app:list-data-folders` / `app:open-data-folder` | App / backups / update-logs / steamcmd roots under `userData` |

Density load: `main.tsx` calls `loadUiDensityPref()` before the first theme mount.
`getUiDensity` returns `null` when unset (caller applies default; read does not
write). Legacy `localStorage` key `settings.uiDensity` migrates once and clears
only after a successful SQLite write.

Console-on-start load: `main.tsx` also calls `loadOpenNativeConsolePref()` before
first paint. `getOpenNativeConsole` returns `null` when unset. Main-process
auto-start reads the same SQLite key when the main window is shown (after splash),
not while the splash is up. Legacy `overview.openNativeTerminalOnStart` migrates
once (same rules as density).

### Server auto-start summary (#53)

Lists profiles with `autoStart === true` (column `auto_start`, default **false**).
Badges: Will start / Ignored (inactive) / Blocked (install not ready). Edit the
preference on the Server tab. Launch order and skip rules:
[server-lifecycle.md](server-lifecycle.md#auto-start-on-application-launch-53).

### Desktop alerts / OS notifications (#331)

Windows Action Center toasts for a short fleet-event allowlist. Settings → General
exposes the master switch and nested categories; behavior lives in main + shared
catalog (not in the renderer toggle UI).

| Category | Event / trigger | Click opens |
| --- | --- | --- |
| Server crash | `server_crashed` | That server's workspace **Logs → Events** (`eventId`) |
| Installs and updates | `update_completed`, `update_failed` (**error** only), `update_rolled_back` | **Downloads** |
| YARK updates | App update `available` or `ready` | Settings → **About** |
| Hide to tray | Close-to-tray banner (not an OS toast) | Reopen window |

**Focus skip:** when the main window is focused and visible (not minimized), crash
and YARK update OS toasts are always suppressed (in-app toast is enough). SteamCMD
skips when focused **only if** the job was operator-awaited (`context.operatorAwaited`
set when Install / Update / Verify is started from the UI and awaited) — background
or tray jobs still raise an OS banner while YARK is in front.

**Dedupe / cooldown:**

- Crash: one OS toast per `serverId` within `OS_NOTIFY_CRASH_COOLDOWN_MS` (120s).
- SteamCMD: one OS toast per `jobId` for the process session.
- YARK update: one OS toast per `phase:version` for the session.

**Silent vs sound:** success / “available” banners stay quiet
(`steamCmdOsToastSilent` for `update_completed`; `yarkUpdateOsToastSilent` for
`available`). Failures, rollbacks, crashes, and “ready to install” use the system
sound.

**E2E:** `YARK_E2E_USER_DATA` (and unsupported `Notification`) suppress native
toasts via `shouldSkipNativeNotification`.

**Deep-link push:** click sends `push:os-notification-open`
(`OsNotificationOpenPush`) after revealing the main window. Wire new fleet
categories through `os-notification-events.ts` — Discord webhooks (#241) should
reuse this catalog, not fork it.

Related: [server-lifecycle.md](server-lifecycle.md) (crash events),
[updates-steamcmd.md](updates-steamcmd.md) (Downloads / job outcomes).

### First-run setup wizard (#298)

Skippable assistant for SteamCMD path, default server folder, Windows shell, and
(when the fleet is empty) optional cluster + first create/import. Persists
`onboarding.v1` in SQLite (`OnboardingRecord`: `status` `completed` \| `skipped`,
`completedAt`, optional `pendingCluster`). Independent of telemetry prefs.

| Mode | Steps | When |
| --- | --- | --- |
| `first-run` | Welcome → Paths → Windows → Cluster → First server | Auto-show or empty-fleet **Open setup assistant** |
| `paths-shell` | Paths → Windows | **Open setup assistant** with one or more profiles |

**Auto-show:** `shouldAutoShowSetupWizard` — empty fleet, `onboarding.v1` unset,
`getOnboarding()` `ok`, and not E2E. A failed read must **not** be treated as
unset (that would trap the operator if persist also fails); Overview stays usable
with a retry toast. E2E (`YARK_E2E_USER_DATA`) never auto-shows.

**Open setup assistant:** empty fleet clears the record (`setOnboarding(null)`)
and reopens `first-run`; non-empty opens `paths-shell` only (does not reset
SteamCMD or wipe prefs). Path / Windows changes save as you go; Skip / Close /
Back are explicit (`closeOnClickOutside={false}`; keep **Back** on First server).

**Pending cluster:** optional Cluster ID + folder on the Cluster step is stored
on the onboarding record until the first successful create/import consumes it —
see [clusters.md](clusters.md). Operator copy:
[design-system.md](design-system.md#operator-facing-copy); agent rule:
[`.cursor/rules/setup-wizard.mdc`](../.cursor/rules/setup-wizard.mdc).

### SteamCMD

| Control | IPC / storage | Notes |
| --- | --- | --- |
| Path + Choose… | SQLite `steamcmdPath` via `steamcmd:set-path` | Validates file exists + `steamcmd +quit`; resets content-cache freshness. Chip is shared `ReadonlyPath` with Choose… and **Install SteamCMD** on the same row (not `PathField`) so the install CTA stays beside the path (#234). |
| Install SteamCMD | `steamcmd:install` | Shown when `detected === false` |
| Shared caches | `steamcmd:open-cache` / `steamcmd:clear-cache` (`depot` \| `content`) | Clear blocked while jobs run |

Create/import a profile does **not** wait for SteamCMD. **Install files** /
Update / Verify fail until a `steamcmd.exe` is found — see
[updates-steamcmd.md](updates-steamcmd.md#steamcmd-not-configured). Operator
copy for this row matches first-run setup
([design-system.md](design-system.md#operator-facing-copy)).

Full SteamCMD workflows: [updates-steamcmd.md](updates-steamcmd.md).

### App data folders

Lives under **About**. Collapsed list with Open actions for App data, Backups, Update logs, and Bundled
SteamCMD under Electron `userData`. Bundled SteamCMD is YARK’s own install folder
(used by **Install SteamCMD**). When Settings → SteamCMD points at another
`steamcmd.exe`, About shows **Not in use** on that row. When SteamCMD is not
configured yet, the row says it stays empty until Install SteamCMD.

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

Lives under **About**. In-app update for the **desktop app** (not ASA files). Uses `electron-updater`
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

Sidebar `vX.Y.Z` uses fossil accent + tooltip when an update is available; click
opens Settings → About (does not install directly). When a quiet check (or
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

1. **Two storage backends** — density / shell / SteamCMD path / console-on-start
   → SQLite; default base folder → `localStorage` only.
2. **Start with Windows ≠ Auto-start with YARK** — #54 opens the app; #53 starts
   opted-in ASA profiles after reattach.
3. **Tray alert polarity** — stored key is `trayCloseHintDismissed`; the nested
   **Hide to tray** switch is “show alert” = `!dismissed`. The master
   **Desktop alerts** switch also gates this banner.
4. **No theme toggle** — operator docs that mention a theme control are stale;
   appearance on Settings is density only.
5. **Do not persist density or console-on-start defaults on read** — only user
   changes (or legacy migration) write `uiDensity` / `openNativeConsoleOnStart`.
6. **Shell switches disabled until IPC ready** — failed preference load leaves
   controls disabled at defaults.
7. **SteamCMD set-path** rejects empty paths and requires a successful `+quit`.
8. **`setStartWithWindows`** can fail after the DB write if login-item
   registration throws (win32).
9. Desktop-shell errors may surface next to App data folders (`shellError`).
10. **`update_failed` + warning** (retry) is not an OS toast — only **error**
    severity counts as a finished SteamCMD failure.
11. **Focused Install/Update/Verify** with `operatorAwaited` skips the SteamCMD
    OS banner; a job started while YARK was in the tray still toasts when the
    window is focused later if that flag was never set.
12. **Onboarding read failure ≠ unset** — do not coerce failed `getOnboarding`
    to `record: null` or the wizard auto-opens and can trap the operator.
13. **Empty-fleet “Open setup assistant”** clears `onboarding.v1`; Paths/Windows
    saves from a prior run are not undone by Skip/Close alone.

## Tests

| File | Focus |
| --- | --- |
| `src/renderer/src/features/settings/SettingsPage.test.tsx` | Page controls, density, caches, base folder, SteamCMD setup, log retention, YARK updates |
| `src/renderer/src/features/setup-wizard/SetupWizard.test.tsx` | Modes, skip/close, cluster continue, pending cluster |
| `tests/unit/os-notification-events.test.ts` | Focus skip, SteamCMD allowlist, cooldown, silent, E2E skip |
| `tests/unit/log-retention.test.ts` | Defaults / normalize / failure classification |
| `tests/unit/logs-service.test.ts` | Retention preview/run path guards |
| `tests/unit/ui-density-pref.test.ts` | Load / write / legacy migration |
| `tests/unit/open-native-console-pref.test.ts` | Console-on-start load / write / legacy migration |
| `tests/unit/app-settings-ui-density.test.ts` | SQLite round-trip |
| `tests/unit/app-settings-open-native-console.test.ts` | SQLite console-on-start round-trip |
| `tests/unit/desktop-shell-settings.test.ts` | Tray / Windows prefs persist |
| `tests/unit/database-boot-recovery.test.ts` | Corrupt DB open/migrate errors, quarantine, recovery loop |
| `tests/unit/auto-start.test.ts` | Launch skip/start behavior |
| `scripts/visual-settings.cjs` | Packaged Settings visual review |
| `scripts/visual-setup-wizard.cjs` | Isolated first-run assistant at HD / Full HD / QHD |

See also [server-lifecycle.md](server-lifecycle.md) (tray, auto-start, quit, crash),
[design-system.md](design-system.md) (density tokens, operator copy), and
[updates-steamcmd.md](updates-steamcmd.md).
