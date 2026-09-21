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
 * Shipped in v0.22.0 (removed from this list): Settings -> Appearance (theme, display size,
 * server panels) with a light theme, Windows High Contrast support, a boot canvas that follows
 * the saved theme, and Hosted Resources as an experimental feature.
 * Shipped in v0.20.0 (removed from this list): experimental Ark Server API workspace
 * tab (#243), Settings → About Community GitHub/Discord links, Discord #releases
 * notify after Windows release assets upload.
 * Shipped in v0.19.0 (removed from this list): INI Other section subgroups (#516),
 * sidebar Quit YARK (#532), pending INI queue while running (#530), softer
 * self-update feed errors (#521), unpackaged skip single-instance lock (#528).
 * Shipped in v0.18.0 (removed from this list): Maintenance tab — scheduled restart,
 * wild wipe, opt-in auto-update (#486–#489); keyboard P0/P1 (#476/#477); canvas shells /
 * status words / surface tokens (#468–#470); What's new brief (#466); danger confirms
 * (#235); credential redaction in diagnostics (#144); Cleanup per-map retain (#492/#497).
 * Shipped in v0.17.0 (removed from this list): RCON remote AdminListURL (#153),
 * create/clone next-free ports (#55), visual Map picker (#460), Search Maps… (#295),
 * Mods drawer screenshots/description (#342), workspace Backups/Logs polish (#231/#225).
 * Shipped in v0.16.0 (not previously listed here): Overview fleet metric strip
 * (#314), survivor counts (#301), dedicated-process RAM/CPU (#302), Overview
 * search persistence (#438), third-party notices / About link (#446).
 * Shipped in v0.15.0 (not previously listed here): Discover mods browse (#297),
 * desktop alerts / Windows toasts (#331), flat content panels (#346), quiet icon
 * actions (#397), destructive/filled lifecycle buttons (#344), Start/Restart
 * immediate feedback (#390), ScrollArea dual-scrollbar fix (#395).
 * Shipped in v0.14.0 (not previously listed here): Downloads queue page (#201),
 * Overview Update All (#378), server list sort/view (#351), Launch tab search (#352),
 * quieter operator chrome, packaged DevTools hardening.
 * Shipped on the Downloads queue branch (#201, not previously listed here): Steam-style
 * SteamCMD queue page, workspace footer teaser, Pause/Resume, Verify replace.
 * Shipped in v0.13.1 (not previously listed here): sharper getyark.com screenshot WebP,
 * fossil sidebar YARK-update cue.
 * Shipped in v0.13.0 (not previously listed here): Max players, clone folder copy (#160),
 * first-run setup (#298), Mods drawer/chrome (#227/#238/#226), Configuration wizard (#230/#224),
 * Settings category sidebar, junction hardening (#322).
 * Shipped in v0.12.0 (not previously listed here): splash (#317), What's new (#290),
 * ServerForm / leave-guards, crash Runtime logs (#326), cluster live-transfer docs (#22).
 * Shipped in v0.11.0 (removed from this list): remove-from-YARK-only (#267).
 * Shipped in v0.10.0 (removed from this list): import existing install (#254),
 * profile-DB snapshots (#252), per-map world backups (#262), Electron fuses (#217).
 *
 * Still omitted here (tracked in-repo): E2E/real-host validation (#12), Authenticode (#142),
 * incomplete-import opt-in (#283) is shipped with Import - not listed as future work.
 */
export const roadmapItems: RoadmapItem[] = [
  {
    tag: "building",
    text: "Hosted Resources (experimental): serve text, INI or JSON from this PC at a URL, for ASA settings that take one — admin whitelist, dynamic config",
  },
  {
    tag: "planned",
    text: "Admin whitelist editor: manage ASA administrator IDs in YARK and publish the list through Hosted Resources without maintaining a separate Gist",
  },
  {
    tag: "planned",
    text: "Delete a server from the workspace Quick actions, with confirmation",
  },
  {
    tag: "planned",
    text: "Pinned INI settings: keep frequently adjusted server settings together for faster review and editing",
  },
];
