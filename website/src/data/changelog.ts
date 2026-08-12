export type ChangelogSection = {
  title: string;
  items: string[];
};

export type ChangelogEntry = {
  version: string;
  date: string;
  sections: ChangelogSection[];
};

/** Curated site changelog — keep in sync with root CHANGELOG.md when cutting releases. */
export const changelog: ChangelogEntry[] = [
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
