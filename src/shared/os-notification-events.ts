import type { AppEvent } from "./types";

/**
 * Short allowlist of fleet events that may raise a Windows OS toast (#331).
 * Discord webhooks (#241) should reuse this catalog later — do not fork it.
 */

export const OS_NOTIFY_CRASH_EVENT_TYPE = "server_crashed" satisfies AppEvent["type"];

export const OS_NOTIFY_STEAMCMD_EVENT_TYPES = [
  "update_completed",
  "update_failed",
  "update_rolled_back",
] as const satisfies ReadonlyArray<AppEvent["type"]>;

export type OsNotifySteamCmdEventType =
  (typeof OS_NOTIFY_STEAMCMD_EVENT_TYPES)[number];

export type OsNotifyCategory = "crash" | "steamcmd";

/** Flap-crash: one OS toast per server within this window. */
export const OS_NOTIFY_CRASH_COOLDOWN_MS = 120_000;

/** Failed + rolled-back (or retry) on the same job: one OS toast. */
export const OS_NOTIFY_STEAMCMD_JOB_COOLDOWN_MS = 120_000;

export interface OsNotifyPreferences {
  osNotifyEnabled: boolean;
  osNotifyCrash: boolean;
  osNotifySteamCmd: boolean;
}

export interface ServerCrashedNotifyPayload {
  serverId: string;
  serverName: string;
  eventId: number;
  summary: string;
}

export interface SteamCmdJobTerminalPayload {
  type: OsNotifySteamCmdEventType;
  severity: AppEvent["severity"];
  serverId: string | null;
  serverName: string | null;
  jobId: string | null;
  eventId: number;
  message: string;
}

export function isYarkE2eUserDataEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return (env["YARK_E2E_USER_DATA"] ?? "").trim().length > 0;
}

export function shouldSkipNativeNotification(input: {
  isSupported: boolean;
  isE2e: boolean;
}): boolean {
  return input.isE2e || !input.isSupported;
}

/**
 * Retry warnings (`update_failed` + warning) are not a finished job.
 * Real failures, rollbacks, and completions are.
 */
export function shouldNotifySteamCmdJobEvent(
  type: AppEvent["type"],
  severity: AppEvent["severity"],
): type is OsNotifySteamCmdEventType {
  if (
    !(OS_NOTIFY_STEAMCMD_EVENT_TYPES as readonly AppEvent["type"][]).includes(type)
  ) {
    return false;
  }
  if (type === "update_failed") {
    return severity === "error";
  }
  return true;
}

export function shouldShowFleetOsNotification(input: {
  category: OsNotifyCategory;
  prefs: OsNotifyPreferences;
  windowFocusedVisible: boolean;
  nowMs: number;
  lastShownAtMs: number | undefined;
  cooldownMs: number;
}): boolean {
  if (!input.prefs.osNotifyEnabled) {
    return false;
  }
  if (input.category === "crash" && !input.prefs.osNotifyCrash) {
    return false;
  }
  if (input.category === "steamcmd" && !input.prefs.osNotifySteamCmd) {
    return false;
  }
  if (input.windowFocusedVisible) {
    return false;
  }
  if (
    input.lastShownAtMs !== undefined
    && input.nowMs - input.lastShownAtMs < input.cooldownMs
  ) {
    return false;
  }
  return true;
}

export function truncateToastBody(text: string, max = 180): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(1, max - 1))}…`;
}
