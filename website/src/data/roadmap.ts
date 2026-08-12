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
 * Shipped in v0.11.0 (removed from this list): remove-from-YARK-only (#267).
 * Shipped in v0.10.0 (removed from this list): import existing install (#254),
 * profile-DB snapshots (#252), per-map world backups (#262), Electron fuses (#217).
 * Still omitted here (tracked in-repo): E2E/real-host validation (#12, #22), Authenticode (#142),
 * incomplete-import opt-in (#283) is shipped with Import — not listed as future work.
 */
export const roadmapItems: RoadmapItem[] = [
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
