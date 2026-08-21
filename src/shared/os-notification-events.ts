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
  /**
   * True when the renderer awaited this job (Install / Update / Verify) and will
   * show an in-app toast — skip the OS banner while YARK is focused.
   */
  operatorAwaited: boolean;
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
 * Callers still suppress mid-update `update_failed` that precede a rollback.
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

/**
 * Crash always skips when focused. SteamCMD skips when focused only if the
 * operator awaited the job (in-app toast is enough).
 */
export function shouldSkipOsToastForFocus(input: {
  category: OsNotifyCategory;
  windowFocusedVisible: boolean;
  operatorAwaited: boolean;
}): boolean {
  if (!input.windowFocusedVisible) {
    return false;
  }
  if (input.category === "crash") {
    return true;
  }
  return input.operatorAwaited;
}

export function shouldShowFleetOsNotification(input: {
  category: OsNotifyCategory;
  prefs: OsNotifyPreferences;
  windowFocusedVisible: boolean;
  operatorAwaited?: boolean;
  nowMs: number;
  lastShownAtMs: number | undefined;
  cooldownMs: number;
  /** SteamCMD: jobId already toasted this session — never toast again. */
  alreadyNotifiedForJob?: boolean;
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
  if (input.alreadyNotifiedForJob === true) {
    return false;
  }
  if (
    shouldSkipOsToastForFocus({
      category: input.category,
      windowFocusedVisible: input.windowFocusedVisible,
      operatorAwaited: input.operatorAwaited === true,
    })
  ) {
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

/** Action Center copy — no install paths, log paths, or crash excerpts (#331). */
export function formatCrashOsToastBody(serverName: string): string {
  const name = serverName.trim().length > 0 ? serverName.trim() : "Server";
  return `"${name}" exited unexpectedly.`;
}

export function formatSteamCmdOsToastBody(
  type: OsNotifySteamCmdEventType,
  serverName: string | null,
): string {
  const name =
    serverName !== null && serverName.trim().length > 0
      ? serverName.trim()
      : "Server";
  if (type === "update_completed") {
    return `"${name}" SteamCMD job finished.`;
  }
  if (type === "update_rolled_back") {
    return `"${name}" update was rolled back.`;
  }
  return `"${name}" SteamCMD job failed.`;
}

export function steamCmdOsToastSilent(type: OsNotifySteamCmdEventType): boolean {
  return type === "update_completed";
}

export function truncateToastBody(text: string, max = 180): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(1, max - 1))}…`;
}
