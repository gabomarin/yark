export type ChangelogSection = {
  title: string;
  items: string[];
};

export type ChangelogEntry = {
  version: string;
  date: string;
  sections: ChangelogSection[];
};

/** SQLite `app_settings.key` for the last dismissed in-app What's new version. */
export const LAST_SEEN_CHANGELOG_VERSION_SETTING_KEY = "lastSeenChangelogVersion";

/** Default number of releases shown in Settings → Recent. */
const DEFAULT_RECENT_CHANGELOG_LIMIT = 8;

/**
 * Curated changelog for the public site and in-app What's new.
 * Keep in sync with root CHANGELOG.md when cutting releases.
 * website/src/data/changelog.ts re-exports this (website/ is a separate package).
 *
 * @lintignore
 */
export const changelog: ChangelogEntry[] = [
  {
    version: "0.18.2",
    date: "2026-09-03",
    sections: [
      {
        title: "Fixed",
        items: [
          "Server Version / Update chrome no longer desyncs after Update, Verify, or a second Steam build — install-dir appmanifest only, local-ahead builds count as current, and the refresh hint stays when files are newer than the displayed ARK label.",
        ],
      },
    ],
  },
  {
    version: "0.18.1",
    date: "2026-09-02",
    sections: [
      {
        title: "Changed",
        items: [
          "Critical-path backups (pre-stop, pre-restart, pre-update) archive world only — INI stays on save / Backup now.",
          "Backup history Date shows English relative time for the last 24 hours and a local timestamp for older rows.",
        ],
      },
    ],
  },
  {
    version: "0.18.0",
    date: "2026-08-31",
    sections: [
      {
        title: "Added",
        items: [
          "Per-server Maintenance tab (off by default): Up next, schedules, and player warning presets while YARK is open.",
          "Scheduled restart with in-game chat countdown, weekdays + local time, Run now / Cancel, and graceful restart with backup.",
          "Optional wild dino wipe right after a successful maintenance restart.",
          "Opt-in auto-update when a newer dedicated build is available — warn players, stop at countdown end, update, then start again (skipped while Downloads is paused).",
        ],
      },
      {
        title: "Changed",
        items: [
          "Keyboard: Ctrl+K Spotlight, Overview cards and menus, workspace tabs, and Settings categories.",
          "Status uses words and a status dot instead of light-pill badges; panels use solid fills and tighter radius.",
          "Logs and Settings sit on the page canvas; What's new is a wider release brief.",
          "Destructive confirms share one red-styled danger modal helper.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Scheduled restart still runs when player warnings are Off; fail-streak pause stops both restart and auto-update.",
          "Fleet Cleanup keep-limit and Keep last N keep world archives per map when rotating maps.",
        ],
      },
      {
        title: "Security",
        items: [
          "Logs, crash excerpts, events, and IPC errors omit GameUserSettings password settings and redact leftover credential assignments.",
        ],
      },
    ],
  },
  {
    version: "0.17.0",
    date: "2026-08-29",
    sections: [
      {
        title: "Added",
        items: [
          "RCON Admins: configure ASA admin whitelist via remote http(s) AdminListURL (Validate, interval, Current ids).",
          "Create and Clone suggest the next free game/query/RCON ports across your YARK fleet.",
          "Search Maps… on Server Information: CurseForge Maps grid, details with screenshots, and one-step map + mod link.",
          "Mods detail drawer: CurseForge screenshot carousel and clamped plain-text description on inspect.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Server Information Map field opens a visual popover (Official thumbs, Map mods, Search Maps… / Custom…).",
          "Official-token remasters keep mapModId and launch with -MapModID= when the pack is enabled.",
          "Workspace Backups: shared Destination, Backup now in the history toolbar, and clearer embedded chrome.",
          "Logs Backup history renamed (distinct from the Backups tab); shorter intros and operator toasts.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Remaster World save folder persists when mapModId is set; clearing AdminListURL no longer reseeds Current ids from the names sidecar.",
          "Clone port suggestions skip occupied fleet ports (fallback +10 wraps near the port ceiling); RCON tab scrolls on narrow widths; SteamCMD Install refreshes the path field.",
          "Search Maps… gates missing Maps category and avoids a flash while categories load; Mods description entities and overflow Show more.",
        ],
      },
    ],
  },
  {
    version: "0.16.0",
    date: "2026-08-26",
    sections: [
      {
        title: "Added",
        items: [
          "Overview fleet metric strip: Running, Stopped, Needs attention, and Updates available with click-to-filter tiles.",
          "Survivor counts on Overview cards and the header Survivors total; workspace Status shows Survivors and Uptime.",
          "Dedicated-process RAM and CPU on Overview cards and header sums; workspace Status shows per-server samples while those surfaces are visible.",
          "Settings → About links to THIRD_PARTY_NOTICES for Arkobat templates, ark.wiki.gg catalog sources, and map thumbnails.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Overview server search stays for the session when you leave and return; SearchFields gain an in-field clear control.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Survivors no longer flash a false 0 after stop→start; Running strip includes starting/stopping; RAM/CPU clears when sampling turns off.",
          "Version-refresh hint no longer appears when the dedicated ARK Version is already ahead of Wildcard officials.",
          "Enable on the server card works again when files are not installed; overlapping overview polls no longer drop Check server updates results.",
        ],
      },
    ],
  },
  {
    version: "0.15.0",
    date: "2026-08-22",
    sections: [
      {
        title: "Added",
        items: [
          "Desktop alerts: optional Windows toasts for server crashes, SteamCMD install/update/verify results, and YARK updates (even from the tray).",
          "Discover mods browses CurseForge with category filter, pagination, and table-column catalog sort.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Content panels use a flat AppSurfaceCard shell; dense icon-only actions stay quiet subtle while labeled destructive buttons stay filled.",
          "Disabled mods rows are dimmed; Stop and other labeled destructive actions use filled red, Restart uses fossil amber.",
          "Operator copy prefers en dashes and …, with clearer Close/Finish labels instead of vague Done.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "ScrollArea and Select dropdowns no longer show a double scrollbar.",
          "Start and Restart show immediate Starting… / Restarting… feedback while pre-spawn work runs.",
        ],
      },
    ],
  },
  {
    version: "0.14.1",
    date: "2026-08-19",
    sections: [
      {
        title: "Changed",
        items: [
          "Workspace search and INI segmented switches share Overview chrome.",
          "Operator toasts appear bottom-right so they do not cover Overview and workspace toolbars.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Compact Overview server cards stay denser when the window narrows.",
          "ASA launch catalog uses one list scrollbar, explains browse filters, and points operators to where YARK already manages a command.",
          "Completed actions use toasts instead of lingering success banners; leftover-folder and failure Alerts stay.",
        ],
      },
    ],
  },
  {
    version: "0.14.0",
    date: "2026-08-19",
    sections: [
      {
        title: "Added",
        items: [
          "Launch tab search filters curated ASA flags by token, description, or group.",
          "Overview Update All previews eligible stopped servers and queues safe SteamCMD updates into Downloads after confirm.",
          "Overview and workspace server list share Order added vs A–Z sort and All servers / By cluster layout toggles.",
          "Downloads queue page with stacked rows, Pause/Resume, console pane, and a minified footer teaser on other pages.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Overview, Settings, Clusters, Backups, Logs, and Downloads use quieter chrome: fewer subtitles, sentence-case badges, and tighter server cards.",
          "Overview cards show read-only queue progress; click the status line to open Downloads for pause, resume, and cancel.",
          "Downloads queue keeps console output while paused, clears on resume, and hides internal backup phases from row copy.",
          "Update All confirm uses Accept, drops the green Queue badge, and keeps the header enable state live while the modal is open.",
        ],
      },
      {
        title: "Security",
        items: [
          "Packaged builds no longer honor a YARK_DEVTOOLS env override; DevTools stay off until an unpackaged dev/preview run.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Downloads queue ordering, cancel/retry/resume, SteamCMD-missing blocked jobs, and recovered restart-interrupted jobs behave consistently across restarts.",
          "Overview Update All enqueues without waiting for SteamCMD and closes the confirm modal as soon as queueing finishes.",
          "Show server console on start applies to Auto-start with YARK and waits until the main window is shown.",
        ],
      },
    ],
  },
  {
    version: "0.13.1",
    date: "2026-08-17",
    sections: [
      {
        title: "Changed",
        items: [
          "Sidebar YARK update icon and version text use fossil amber so the available-update cue matches other warn accents.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Home screenshot slideshow serves native 1440px WebP at higher quality so the product preview stays sharp on large and high-DPI displays.",
        ],
      },
    ],
  },
  {
    version: "0.13.0",
    date: "2026-08-17",
    sections: [
      {
        title: "Added",
        items: [
          "Profile-owned Max players (default 70, 0–255) launches as -WinLiveMaxPlayers; empty or 0 omits the flag (ASA then defaults to 70).",
          "Clone server copies Game.ini and GameUserSettings.ini from the source and can optionally copy the install folder.",
          "Skippable first-run setup (SteamCMD, Windows shell, optional cluster, then create or import); Settings can reopen the setup assistant.",
          "Mods detail drawer can enable/disable and Remove configured IDs, and Add to this server from Discover inspect.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Workspace Mods uses the same panel shell as Server Settings and Launch; Discover uses the shared search field.",
          "Configuration wizard: profile cards, Pace/World/QoL/Breeding polish, Match cluster defaults, and Use default configuration on first-run create.",
          "Settings uses a category sidebar (General, Servers, SteamCMD, Logs, About).",
          "getyark.com serves responsive WebP screenshots and loads faster on phones.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Upgrade keeps a leftover Launch/extra -WinLiveMaxPlayers cap on Max players instead of silently starting at 70.",
          "Clone port +10 wraps within 1024–65535; clone INI seed and folder copy fail closed on Windows directory junctions.",
          "First-run cluster Yes shows the directory error when no default base folder is set; the suggested folder follows a later base-folder change.",
          "The INI editor hides MaxPlayers because ASA ignores that INI key; Max players on the Server tab is the live cap.",
        ],
      },
      {
        title: "Security",
        items: [
          "Recursive install/backup/move/cache copies no longer follow Windows directory junctions; write paths fail closed on parent or destination links.",
        ],
      },
    ],
  },
  {
    version: "0.12.0",
    date: "2026-08-13",
    sections: [
      {
        title: "Added",
        items: [
          "Animated startup splash (brand SVG, 1.5s min until the main window is ready); honors reduced motion; skipped in E2E.",
          "In-app What's new from the curated notes shared with the public site (Settings, sidebar version, one-shot after upgrade).",
          "Create/clone install folders must be empty (or missing) and must not sit inside or wrap another YARK or ASA server.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Create/edit server form: Browse chips for paths, identity + reachability columns, reserved port-conflict slot, fixed Save footer; New server Map is official maps only.",
          "Compact UI density and shared EmptyState on workspace, Settings auto-start, and Logs fleet empties.",
          "Runtime keeps the ShooterGame.log tail with native console on; the buffer survives a crash until the next Start; unexpected exits record server_crashed with a log excerpt.",
          "Log retention day fields accept a minimum of 1 day (was 7).",
          "YARK updates Download and Restart and install use fossil amber instead of teal.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Move installation dest preview matches create (empty folder, not another YARK or ASA tree); same-drive rename restores the source if cancel or commit fails.",
          "Workspace Server/INI and create/edit server forms confirm before navigation discards unsaved edits.",
          "Create/Move install-path checks walk ASA ancestors on disk and stay async so a slow UNC folder cannot freeze YARK.",
        ],
      },
    ],
  },
  {
    version: "0.11.0",
    date: "2026-08-12",
    sections: [
      {
        title: "Added",
        items: [
          "Remove a server from YARK only (keep the ASA folder) or wipe everything; empty never-installed folders always wipe after a live emptiness check.",
          "Import incomplete ASA folders with an explicit Import anyway opt-in, then finish with Install/Verify; empty folders stay blocked.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Player backups are join/leave only (flat PlayerProfiles/); restore into the current map; critical-path snapshots stay world + INI.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Backups kind tab no longer resets to World save when resizing the window.",
          "Force update stays disabled while the server is active; queued jobs recheck and stay Retry-able after Stop.",
          "Add servers to cluster: nothing selected by default, enabled unclustered only, Error-state idle allowed, Seed INI opt-in.",
        ],
      },
    ],
  },
  {
    version: "0.10.0",
    date: "2026-08-12",
    sections: [
      {
        title: "Added",
        items: [
          "Import an existing ASA dedicated folder as a YARK profile (mods discovered disabled; no SteamCMD until you choose).",
          "Profile database snapshots before migrations and on healthy reopen; boot recovery can restore a snapshot.",
          "Windows CI Electron E2E gates for smoke, CRUD, install-health, and host-port-probe.",
        ],
      },
      {
        title: "Changed",
        items: [
          "World backups are scoped to the active map folder (smaller ZIPs, safer restore); custom maps can set a World save folder override.",
          "World schedule waits after process start, respects the interval after failures, and pauses for the session after repeated failures; Clear failed cleans history noise.",
          "Public site trust copy focuses on official downloads and SHA-256 checks (Authenticode remains deferred).",
        ],
      },
      {
        title: "Security",
        items: [
          "Packaged builds enable Electron fuses and ASAR integrity validation; grantFileProtocolExtraPrivileges stays on while loadFile serves the UI.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Packaged builds keep grantFileProtocolExtraPrivileges enabled so the renderer loads (blank window / ERR_FILE_NOT_FOUND when the fuse was off).",
          "World restore after a wipe recreates the live map folder from the backup (mod maps like Svartalfheim/), not a mistaken MapToken directory; empty live maps skip the pre-restore safeguard.",
          "Import install map detection finds nested SavedArks folders even when the folder name is not a MapToken.",
          "Safe Update backup progress/cancel and large world snapshot packaging; YARK update Ready state survives re-checks.",
          "Native Electron menu bar hidden; Windows publisher/author shows gabomarin26.",
        ],
      },
    ],
  },
  {
    version: "0.9.1",
    date: "2026-08-10",
    sections: [
      {
        title: "Changed",
        items: [
          "Sidebar shows an update icon next to the YARK version when an app update is available, and centers the SteamCMD status label.",
          "Public site serves at https://getyark.com with SEO and operator-facing roadmap updates after v0.9.0.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Release CI no longer flakes on execFileBounded maxBuffer coverage on Windows runners.",
        ],
      },
      {
        title: "Added",
        items: [
          "Engineering runbook for workspace Mods in docs/mods.md.",
        ],
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-08-10",
    sections: [
      {
        title: "Added",
        items: [
          "Corrupt or unopenable profile database shows a boot recovery dialog (open folder / quit / start empty).",
          "Local/dev builds can set the CurseForge proxy URL via gitignored .env / .env.local.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Public docs cover profile-database boot recovery; marketing roadmap refreshed for work after v0.9.0.",
          "Launch and Mods saves use narrow patch IPC with server-side merge so concurrent edits no longer last-write-wins.",
          "Overview server cards skip re-render on unrelated status polls; focused cards open the row menu with Shift+F10.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Main-process fleet/SteamCMD/stop hot paths use bounded async I/O instead of blocking sync calls.",
          "Overview/Logs/Backups quiet polls no longer wipe UI from host refresh identity churn.",
          "Website build keeps a single GitHub Pages 404.html without a duplicate /404 route warning.",
          "Settings YARK updates and Log retention clear busy state when IPC fails.",
        ],
      },
      {
        title: "Security",
        items: [
          "Every renderer→main IPC invoke validates arguments with Zod.",
          "GitHub Actions are SHA-pinned; CurseForge proxy URL is baked from a protected Actions variable (no source fallback).",
          "CurseForge proxy adds rate limits, body/time bounds, caching, and an abuse runbook.",
          "Open release notes and target=_blank opens use the shared host allowlist; move-install cleanup is path-gated.",
        ],
      },
    ],
  },
  {
    version: "0.8.1",
    date: "2026-08-09",
    sections: [
      {
        title: "Added",
        items: [
          "Quiet YARK updates check (and Settings Check now) shows an operator toast when a new desktop build is available or ready to install.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Public docs body links under GitHub Pages keep the /yark base path.",
        ],
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-08-09",
    sections: [
      {
        title: "Added",
        items: [
          "Workspace Launch tab with curated ASA flags, Extra arguments, command preview, and a browsable launch-options catalog.",
          "Quick jump (Ctrl+K) to pages and servers, with a small Recent list.",
          "Custom / CurseForge Maps launch tokens with map-mod linking, Start/Launch alerts, and CurseForge logos as map art.",
          "Shared YarkDataTable for backup history and Mods load order, plus right-click context menus on cards and table rows.",
          "Sidebar and workspace icon-rail chrome with remembered Full ↔ rail modes.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Mods and Extra arguments live on the Mods / Launch workspace tabs (not the create/edit Server form); new mods start disabled.",
          "Servers health feedback, AppMetricCard fleet strip, Accordion/Timeline logs, and shared console ScrollArea surfaces.",
          "Operator docs and screenshots cover Launch, Quick jump, and custom Maps flows; gallery capture uses an isolated demo fleet.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Stale fleet refresh and Launch/Mods persist races no longer clobber newer UI after overlapping polls or server switches.",
          "External links open only allowlisted hosts; CurseForge proxy follows HTTPS on-host redirects only.",
          "Fleet poll identity and quiet player-list updates stop resetting Mods/Backups mid-edit chrome.",
        ],
      },
      {
        title: "Removed",
        items: [
          "Redundant Back to servers control from the workspace header (use the sidebar Servers nav).",
        ],
      },
    ],
  },
  {
    version: "0.7.0",
    date: "2026-08-07",
    sections: [
      {
        title: "Added",
        items: [
          "Create server can join an existing fleet cluster (or none), with live port-conflict checks against other profiles.",
          "Copy configuration between server profiles: selective INI, mods, launch args, backup policy, and opt-in passwords to stopped targets.",
          "Create cluster and add/remove membership from the Clusters workspace (stopped servers only).",
          "Cluster INI templates with Promote, Restore, and opt-in Seed when adding servers; Game.ini and/or GameUserSettings.ini selectable.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Enable server no longer requires installation files to be ready; Start, Restart, and auto-start still do.",
          "Server and cluster INI editors share GameUserSettings / Game.ini switching and denser Clusters chrome.",
          "INI setting metadata is built from defaults only; catalog wiki scrape tooling is removed.",
          "Public operator docs cover Copy configuration and workspace RCON; Getting started and Clusters match create/join flows.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "INI editors ignore stale loads when switching server or cluster mid-fetch; dirty leave-guards stay accurate.",
          "Cluster and Copy configuration wizards remount cleanly when reopened.",
          "Copy configuration category toggles, GameUserSettings rates with mods/launch args, and Replace blocked-key handling.",
          "YARK in-app updates no longer 404 on space-rewritten installer asset names.",
        ],
      },
    ],
  },
  {
    version: "0.6.0",
    date: "2026-08-05",
    sections: [
      {
        title: "Added",
        items: [
          "In-app YARK updates from GitHub Releases (Settings + accented sidebar version), with safe busy-state blocking and an assisted Windows installer.",
          "Log retention for YARK-owned events and SteamCMD update logs, with Settings controls and manual cleanup preview.",
          "Portable backup export/import and per-archive delete, with compact local date stamps on managed filenames.",
          "Move installation for same-drive rename or cross-drive copy with progress, then profile path commit.",
          "Opt-in Auto-start with YARK per server profile after leave-running reattach.",
          "Map artwork thumbs for known ASA maps on the server list and workspace header.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Sidebar Backups no longer resets unsaved schedule edits on App polling, and idle stopped servers no longer false-alarm on missing world backups.",
          "Backup create/restore require Ready installs; export works to Windows drive roots with a real .zip extension.",
          "Move installation recovers orphaned cross-drive staging and improves cancel/progress guidance.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Sidebar Backups health badges and fleet alerts use clearer tooltips and a compact Alerts panel.",
          "Filesystem paths use shared read-only chips with Browse/Clear across Settings, servers, clusters, and backups.",
        ],
      },
    ],
  },
  {
    version: "0.5.2",
    date: "2026-08-02",
    sections: [
      {
        title: "Changed",
        items: [
          "Reworked the repository README with product guidance, release badges, screenshots, architecture, and contribution information.",
          "Updated the public roadmap after 0.5.1 and aligned the Settings guide with the current Stop/Cancel quit behavior.",
          "Expanded release documentation so download-verification guidance stays synchronized with published artifacts.",
        ],
      },
      {
        title: "Security",
        items: [
          "Added SHA-256 verification instructions for prerelease installer downloads.",
          "Documented the current SQLite, ASA INI, and backup credential-storage boundary.",
        ],
      },
    ],
  },
  {
    version: "0.5.1",
    date: "2026-08-02",
    sections: [
      {
        title: "Added",
        items: [
          "Enable, disable, and clone server profiles.",
          "Installation health checks for missing, partial, invalid, and ready server folders.",
          "TCP/UDP host-port probes before start, with retry and session-port override actions.",
        ],
      },
      {
        title: "Changed",
        items: [
          "ARK Version is displayed separately from the Steam build used for update decisions.",
          "Quitting with active servers always confirms Stop or Cancel.",
        ],
      },
      {
        title: "Security",
        items: [
          "Updated Electron and the Windows packaging toolchain to remove known dependency vulnerabilities.",
          "Enabled renderer sandboxing, blocked untrusted navigation/window creation, and bounded CurseForge proxy requests.",
        ],
      },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-08-01",
    sections: [
      {
        title: "Added",
        items: [
          "Windows system tray with Close window to tray and Start with Windows settings.",
          "Quit policy when servers are active (Ask / Stop), with safe stop progress.",
          "Critical-job crash recovery and idempotent resume for install/update/verify, pre-update backup, and restore.",
          "Original Windows application icon for window, tray, and installer.",
          "Public project site rebuilt with Astro + Starlight (docs, FAQ, changelog, download).",
        ],
      },
      {
        title: "Changed",
        items: [
          "Official version and local install probes run less often to avoid UI freezes.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Quit cancel no longer leaves a dead tray-only process when Close window to tray is off.",
          "Quit Stop waits for starting servers and runs save + pre-stop backup with progress.",
          "Pre-update backup recovery requires verified evidence before treating a backup as complete.",
        ],
      },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-07-30",
    sections: [
      {
        title: "Added",
        items: [
          "Restart is one backend operation: stop → fail-hard pre_restart backup → start, under a single instance lock.",
          "Safe-update real-host validation helper and unit coverage for the stop → pre_update → SteamCMD → conditional restart/rollback path.",
        ],
      },
      {
        title: "Changed",
        items: [
          "UI stack upgraded to React 19.2 and Mantine 9.",
          "Operator-facing lock, status, update-check, backups, mods, cluster, and logs copy simplified for clearer actions.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Safe-update docs and UpdateService contract aligned with the implemented auto-stop / single pre_update / conditional-restart behavior.",
        ],
      },
    ],
  },
  {
    version: "0.3.2",
    date: "2026-07-29",
    sections: [
      {
        title: "Added",
        items: [
          "Runtime logs in piped mode follow ShooterGame/Saved/Logs into the in-memory buffer with live refresh.",
          "Runtime Source filter: All / System / Server log / Process.",
          "Shared log datetime formatting across Events, Updates, Backups, and Runtime.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Server card actions are icon-only (Play/Pause, Restart, Update).",
          "Server list drops the Files column; Version uses color + weight for update state.",
        ],
      },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-07-28",
    sections: [
      {
        title: "Highlights",
        items: [
          "CurseForge Mods tab with Project IDs, enable/disable, and Worker-backed metadata.",
          "Safer update and restart paths with pre-operation backups.",
        ],
      },
    ],
  },
];

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

/** Find a curated entry for an installed/app version string (optional `v` prefix). */
export function getChangelogForVersion(
  version: string,
  entries: readonly ChangelogEntry[] = changelog,
): ChangelogEntry | null {
  const needle = normalizeVersion(version);
  if (needle.length === 0) {
    return null;
  }
  return entries.find((entry) => normalizeVersion(entry.version) === needle) ?? null;
}

/** Newest-first slice for the in-app Recent tab (source array is already newest-first). */
export function getRecentChangelog(
  limit: number = DEFAULT_RECENT_CHANGELOG_LIMIT,
  entries: readonly ChangelogEntry[] = changelog,
): ChangelogEntry[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  return entries.slice(0, safeLimit);
}

/** True when auto What's new should open (version changed and curated notes exist). */
export function shouldShowWhatsNewForVersion(
  appVersion: string,
  lastSeenVersion: string | null | undefined,
  entries: readonly ChangelogEntry[] = changelog,
): boolean {
  const current = normalizeVersion(appVersion);
  if (current.length === 0) {
    return false;
  }
  if (getChangelogForVersion(current, entries) === null) {
    return false;
  }
  const seen =
    lastSeenVersion === null || lastSeenVersion === undefined
      ? ""
      : normalizeVersion(lastSeenVersion);
  return seen !== current;
}
