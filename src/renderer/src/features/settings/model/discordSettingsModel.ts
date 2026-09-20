import type { DiscordMessageContext, DiscordWebhookEvent } from "@shared/settings/discord-webhook";

export interface DiscordEventOption {
  id: DiscordWebhookEvent;
  label: string;
  description: string;
  usesDetail: boolean;
}

export const DISCORD_SERVER_EVENTS: ReadonlyArray<DiscordEventOption> = [
  {
    id: "serverStarted",
    label: "Server ready",
    description: "After the dedicated server reaches ready state.",
    usesDetail: false,
  },
  {
    id: "serverStopped",
    label: "Clean stop",
    description: "After a graceful server stop completes.",
    usesDetail: false,
  },
  {
    id: "serverClosedByUser",
    label: "Closed by user",
    description: "When the server console is closed, Ctrl+C is pressed, or End task is used.",
    usesDetail: false,
  },
  {
    id: "serverCrashed",
    label: "Server crash",
    description: "When a dedicated server exits unexpectedly.",
    usesDetail: false,
  },
];

export const DISCORD_STEAMCMD_EVENTS: ReadonlyArray<DiscordEventOption> = [
  {
    id: "updateStarted",
    label: "SteamCMD started",
    description: "When an install, update, or verification job is queued.",
    usesDetail: true,
  },
  {
    id: "updateCompleted",
    label: "SteamCMD finished",
    description: "When a SteamCMD job completes successfully.",
    usesDetail: true,
  },
  {
    id: "updateFailed",
    label: "SteamCMD failed",
    description: "When a SteamCMD job fails or rolls back.",
    usesDetail: true,
  },
];

const DISCORD_PREVIEW_SERVER = "Island";
const DISCORD_PREVIEW_DETAIL = "steamcmd exited with code 7";

export function discordPreviewContext(usesDetail: boolean): DiscordMessageContext {
  return usesDetail
    ? { server: DISCORD_PREVIEW_SERVER, detail: DISCORD_PREVIEW_DETAIL }
    : { server: DISCORD_PREVIEW_SERVER };
}
