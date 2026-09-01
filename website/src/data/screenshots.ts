import { withBase } from "./site";

export type Screenshot = {
  src: string;
  alt: string;
  caption: string;
};

/** Basename without extension (`overview.png` → `overview`) for `/media/{slug}-*.webp`. */
export function screenshotSlug(shot: Screenshot): string {
  const file = shot.src.split("/").pop() ?? "";
  return file.replace(/\.png$/i, "");
}

export const screenshots: Screenshot[] = [
  {
    src: withBase("/screenshots/overview.png"),
    alt: "YARK Windows overview listing ARK Survival Ascended server profiles with map artwork, status, fleet metric strip, survivors, RAM/CPU, sort controls, and Update All",
    caption:
      "Servers overview — fleet metric strip, survivors and process RAM/CPU, sort/view controls, Update All, and queue status that opens Downloads.",
  },
  {
    src: withBase("/screenshots/downloads.png"),
    alt: "YARK Downloads queue with an active SteamCMD verify job, queued servers, and the live console panel on Windows",
    caption:
      "Downloads — SteamCMD install, update, and verify jobs in one queue, with Pause/Resume and a live console.",
  },
  {
    src: withBase("/screenshots/setup-assistant.png"),
    alt: "YARK first-run setup assistant showing SteamCMD and the default server-folder controls",
    caption:
      "Setup assistant — configure shared paths and Windows behavior, then create or import the first server.",
  },
  {
    src: withBase("/screenshots/workspace-server.png"),
    alt: "ASA dedicated server configuration in YARK with visual Map picker, identity, Max players, Move installation, networking, cluster, and Auto-start",
    caption:
      "Server configuration — visual Map picker (Official / Map mods / Search Maps…), identity, ports, access, cluster, and Auto-start.",
  },
  {
    src: withBase("/screenshots/workspace-launch.png"),
    alt: "YARK Launch tab filtering curated ASA command-line flags with search while showing Extra arguments and the command preview",
    caption:
      "Launch tab — search curated ASA flags by token, description, or group; Extra arguments and the command preview stay visible.",
  },
  {
    src: withBase("/screenshots/workspace-mods.png"),
    alt: "YARK Mods tab with Discover CurseForge browse, load-order table, enable toggles, and detail screenshots",
    caption:
      "Mods — Discover browse with categories and pagination, dense load-order table, and detail screenshots/description on inspect.",
  },
  {
    src: withBase("/screenshots/workspace-ini.png"),
    alt: "Visual INI editor in YARK showing GameUserSettings.ini options with toggles, values, and descriptions",
    caption:
      "Visual INI editor — edit GameUserSettings.ini with searchable, described controls.",
  },
  {
    src: withBase("/screenshots/workspace-backups.png"),
    alt: "Per-server Backups tab in YARK with shared destination, Backup now, schedule, Import, and history for an ASA world",
    caption:
      "Server Backups — shared destination, Backup now in the history toolbar, world schedule, and restore for world / players / INI.",
  },
  {
    src: withBase("/screenshots/workspace-maintenance.png"),
    alt: "YARK Maintenance tab with Up next, restart schedule, wild dino wipe, and auto-update controls for an ASA dedicated server",
    caption:
      "Maintenance — schedule restarts, optional wild dino wipe, and opt-in auto-update with in-game chat warnings while YARK is open.",
  },
  {
    src: withBase("/screenshots/configuration-wizard.png"),
    alt: "YARK configuration assistant with experience-profile cards and a six-step wizard",
    caption:
      "Configuration assistant — experience cards and a guided six-step wizard; nothing is written until the final review.",
  },
  {
    src: withBase("/screenshots/backups.png"),
    alt: "YARK backups dashboard with fleet health badges, disk usage, volumes, and per-server destinations on Windows",
    caption:
      "Backups — fleet health badges, disk usage, destinations, and alerts across servers.",
  },
  {
    src: withBase("/screenshots/clusters.png"),
    alt: "YARK Clusters page for ARK Ascended transfers with create/membership, INI templates, and Cluster ID compliance",
    caption:
      "Clusters — create and membership, INI templates, and Cluster ID / shared directory compliance.",
  },
  {
    src: withBase("/screenshots/logs.png"),
    alt: "YARK Logs page listing recent ASA server problems and activity with severity filters",
    caption:
      "Logs — problems and activity across servers, with drill-down into each server’s Logs tab.",
  },
  {
    src: withBase("/screenshots/settings.png"),
    alt: "YARK Settings on Windows with category navigation and the setup assistant entry point",
    caption:
      "Settings — app-wide preferences by category, including Desktop alerts and the setup assistant.",
  },
];
