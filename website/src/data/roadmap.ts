export type RoadmapTag = "building" | "planned";

export type RoadmapItem = {
  tag: RoadmapTag;
  text: string;
};

/**
 * User-facing roadmap for the marketing site.
 * Sourced from GitHub milestones v0.5 / v0.6 (+ nearby type:feature work).
 * Not a ship promise — keep wording directional.
 */
export const roadmapItems: RoadmapItem[] = [
  {
    tag: "building",
    text: "Crash recovery so interrupted updates and critical backups can resume safely",
  },
  {
    tag: "building",
    text: "Clear install health — know whether server files look good before you hit Start",
  },
  {
    tag: "building",
    text: "Disable a profile without deleting its configuration",
  },
  {
    tag: "building",
    text: "Warn when game / query / RCON ports are already in use before spawn",
  },
  {
    tag: "building",
    text: "Smarter quit behavior and reattach to servers that kept running",
  },
  {
    tag: "planned",
    text: "Windows tray + start-with-Windows so YARK can stay out of the way",
  },
  {
    tag: "planned",
    text: "Per-server auto-start when you open the app",
  },
  {
    tag: "planned",
    text: "Full per-server RCON console with command history",
  },
  {
    tag: "planned",
    text: "Portable backup export / import and clearer restore history",
  },
  {
    tag: "planned",
    text: "Copy selected configuration between server profiles",
  },
  {
    tag: "planned",
    text: "Structured launch options with a live command preview",
  },
];
