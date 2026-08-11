export type RoadmapTag = "building" | "planned";

export type RoadmapItem = {
  tag: RoadmapTag;
  text: string;
};

/**
 * User-facing roadmap for the marketing site.
 * Prefer operator-visible product work from open issues (not CI/packaging hygiene).
 * Not a ship promise — keep wording directional. Milestones on GitHub stay authoritative.
 *
 * Intentionally omitted from this list (still tracked in-repo): Electron fuses (#217),
 * E2E/real-host validation (#12, #22), profile-DB snapshots (#252), Authenticode (#142).
 */
export const roadmapItems: RoadmapItem[] = [
  {
    tag: "planned",
    text: "Import an existing ASA install as a YARK profile (discover mods, leave them disabled)",
  },
  {
    tag: "planned",
    text: "Steam-style SteamCMD download queue with a persistent workspace footer",
  },
  {
    tag: "planned",
    text: "Admin whitelist controls on the RCON Players panel",
  },
  {
    tag: "planned",
    text: "Smarter default ports and suggestions when creating a new server",
  },
  {
    tag: "planned",
    text: "Optional AI chat assistant (bring-your-own OpenAI-compatible key) for fleet help",
  },
];
