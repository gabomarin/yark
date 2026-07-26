import type { AppEvent, AppEventDetails } from "./types";

export interface ResolvedEventDetails {
  what: string;
  cause: string | null;
  location: string | null;
  suggestion: string | null;
  context: Array<{ label: string; value: string }>;
}

function catalogFor(event: AppEvent): AppEventDetails {
  switch (event.type) {
    case "update_failed":
      return {
        what: "A SteamCMD install, update, or verify job failed.",
        cause:
          "SteamCMD exited with an error, was cancelled, exhausted retries, or a related step (stop/backup/restart) failed.",
        suggestion:
          "Open the Updates tab for the full SteamCMD log, check disk space and SteamCMD path, then retry. Safe update/verify stop and restart the server when needed.",
      };
    case "update_started":
      return {
        what: "A SteamCMD files job started or was queued.",
        suggestion:
          "Watch SteamCMD progress. Safe update/verify stop the server if it was running (for a consistent backup) and restart it after success; install still needs the server stopped first.",
      };
    case "update_completed":
      return {
        what: "A SteamCMD files job finished successfully.",
      };
    case "update_rolled_back":
      return {
        what: "The update failed and a previous backup was restored automatically.",
        suggestion:
          "Inspect the update log and restored files. If the server was running before the update, the manager may have restarted it already.",
      };
    case "backup_created":
      return {
        what: "A backup archive was created or a backup job was queued.",
      };
    case "backup_deleted":
      return {
        what: "A backup archive was removed (manual delete, cleanup, or retention).",
      };
    case "backup_restored":
      return {
        what: "Server files were restored from a backup archive.",
        suggestion: "Confirm the restored kind (world / players / INI) before starting the server.",
      };
    case "server_crashed":
      return {
        what: "The dedicated server process exited unexpectedly.",
        cause: "Crash, kill, or OS-level termination while the manager expected it to stay running.",
        suggestion: "Check runtime logs and recent updates/mods, then start again if the install is healthy.",
      };
    case "server_started":
      return {
        what: "The server process was started by the manager.",
      };
    case "server_stopped":
      return {
        what: "The server process was stopped by the manager.",
      };
    case "error":
      return {
        what: "An operational error was recorded.",
        suggestion: "Expand this entry for the message details, then check related Backups or Updates tabs.",
      };
    case "rcon_command":
      return {
        what: "An RCON command was sent to the running server.",
      };
    default:
      return {
        what: "A manager operation was recorded.",
      };
  }
}

function formatContextValue(value: string | number | boolean | null): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

/** Merge stored event details with a type-based catalog for older rows. */
export function resolveEventDetails(event: AppEvent): ResolvedEventDetails {
  const catalog = catalogFor(event);
  const stored = event.details ?? {};
  const mergedContext = {
    ...(catalog.context ?? {}),
    ...(stored.context ?? {}),
  };
  const context = Object.entries(mergedContext).map(([label, value]) => ({
    label,
    value: formatContextValue(value),
  }));

  return {
    what: stored.what ?? catalog.what ?? event.message,
    cause: stored.cause ?? catalog.cause ?? null,
    location: stored.location ?? catalog.location ?? null,
    suggestion: stored.suggestion ?? catalog.suggestion ?? null,
    context,
  };
}
