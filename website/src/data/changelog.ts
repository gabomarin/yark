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
