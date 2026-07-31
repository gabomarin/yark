import { withBase } from "./site";

export type Screenshot = {
  src: string;
  alt: string;
  caption: string;
};

export const screenshots: Screenshot[] = [
  {
    src: withBase("/screenshots/overview.png"),
    alt: "Servers overview listing multiple ARK server profiles with status, map, and recent activity",
    caption: "Servers overview — profiles, status, and recent activity in one place.",
  },
  {
    src: withBase("/screenshots/workspace-server.png"),
    alt: "Server configuration form with identity, networking ports, access passwords, and cluster fields",
    caption:
      "Server configuration — identity, ports, access, and cluster. CurseForge mods live on the Mods tab.",
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
    alt: "Per-server Backups tab with world save destination, schedule controls, and backup history",
    caption:
      "Server Backups — create, schedule, and restore world / players / INI archives per profile.",
  },
  {
    src: withBase("/screenshots/configuration-wizard.png"),
    alt: "Configuration assistant with a six-step wizard and preset server-type cards",
    caption:
      "Configuration assistant — a guided six-step wizard with presets; nothing is written until the final review.",
  },
  {
    src: withBase("/screenshots/backups.png"),
    alt: "Backups dashboard showing backup health across all servers, disk usage, volumes, and destinations",
    caption: "Backups — health, disk usage, and shared destination settings across servers.",
  },
  {
    src: withBase("/screenshots/clusters.png"),
    alt: "Clusters page showing compliance guidance for Cluster ID and shared cluster directory",
    caption:
      "Clusters — Cluster ID / shared directory compliance checks and transfer guidance.",
  },
  {
    src: withBase("/screenshots/logs.png"),
    alt: "Logs page listing recent problems and activity across servers with severity filters",
    caption:
      "Logs — problems and activity across servers, with drill-down into each server’s Logs tab.",
  },
  {
    src: withBase("/screenshots/settings.png"),
    alt: "Settings page with SteamCMD path, default base folder, and app preferences",
    caption: "Settings — SteamCMD path, default base folder, and app-wide preferences.",
  },
];
