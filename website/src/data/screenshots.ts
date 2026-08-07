import { withBase } from "./site";

export type Screenshot = {
  src: string;
  alt: string;
  caption: string;
};

export const screenshots: Screenshot[] = [
  {
    src: withBase("/screenshots/overview.png"),
    alt: "Servers overview listing ARK profiles with map artwork, status, and recent activity",
    caption:
      "Servers overview — profiles with map artwork, status, and recent activity in one place.",
  },
  {
    src: withBase("/screenshots/workspace-server.png"),
    alt: "Server configuration with identity, Move installation, networking, cluster, and Auto-start with YARK",
    caption:
      "Server configuration — identity, Move installation, ports, access, cluster, and Auto-start. Mods live on the Mods tab.",
  },
  {
    src: withBase("/screenshots/workspace-mods.png"),
    alt: "Mods tab listing CurseForge mods with enable toggles, Project IDs, metadata, and CurseForge links",
    caption:
      "Mods — CurseForge Project IDs, enable/disable, and Worker-backed metadata per server.",
  },
  {
    src: withBase("/screenshots/workspace-ini.png"),
    alt: "Visual INI editor showing GameUserSettings.ini options with toggles, values, and descriptions",
    caption:
      "Visual INI editor — edit GameUserSettings.ini with searchable, described controls.",
  },
  {
    src: withBase("/screenshots/workspace-backups.png"),
    alt: "Per-server Backups tab with destination, schedule, Import, and Backup actions",
    caption:
      "Server Backups — create, schedule, import, and restore world / players / INI archives per profile.",
  },
  {
    src: withBase("/screenshots/configuration-wizard.png"),
    alt: "Configuration assistant with a six-step wizard and preset server-type cards",
    caption:
      "Configuration assistant — a guided six-step wizard with presets; nothing is written until the final review.",
  },
  {
    src: withBase("/screenshots/backups.png"),
    alt: "Backups dashboard with fleet health badges, disk usage, volumes, and per-server destinations",
    caption:
      "Backups — fleet health badges, disk usage, destinations, and alerts across servers.",
  },
  {
    src: withBase("/screenshots/clusters.png"),
    alt: "Clusters page with create/membership actions, INI templates, and compliance for Cluster ID and shared directory",
    caption:
      "Clusters — create and membership, INI templates, and Cluster ID / shared directory compliance.",
  },
  {
    src: withBase("/screenshots/logs.png"),
    alt: "Logs page listing recent problems and activity across servers with severity filters",
    caption:
      "Logs — problems and activity across servers, with drill-down into each server’s Logs tab.",
  },
  {
    src: withBase("/screenshots/settings.png"),
    alt: "Settings page showing log retention and YARK updates alongside SteamCMD and desktop prefs",
    caption:
      "Settings — SteamCMD, log retention, YARK updates, auto-start summary, and desktop preferences.",
  },
];
