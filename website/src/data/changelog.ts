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
          "Expanded release documentation so unsigned and future signed-build guidance stays synchronized with published artifacts.",
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
