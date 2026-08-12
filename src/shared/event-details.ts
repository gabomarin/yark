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
          "Open the Updates tab for the full SteamCMD log, check disk space and SteamCMD path, then retry. Updates require a stopped server; verify handles stop/restart when needed.",
      };
    case "update_started":
      return {
        what: "A SteamCMD files job started or was queued.",
        suggestion:
          "Watch SteamCMD progress. Updates require a stopped server; verify may stop and restart a running server. Install also requires the server to be stopped.",
      };
    case "update_completed":
      return {
        what: "A SteamCMD files job finished successfully.",
      };
    case "update_rolled_back":
      return {
        what: "The update failed and a previous backup was restored automatically.",
        suggestion:
          "Inspect the update log and restored files before retrying. Legacy recovered jobs may also have restored their prior running state.",
      };
    case "installation_health_degraded":
      return {
        what: "The saved install path no longer looks ready to launch.",
        cause:
          "The folder was moved, deleted, partially removed, or became inaccessible since the last healthy check.",
        suggestion:
          "Open the server workspace, confirm the install path, then use Install / Verify or Check Servers Health.",
      };
    case "install_move_started":
      return {
        what: "A Move installation job started.",
        suggestion:
          "Wait for copy and verification. The profile path changes only after verification succeeds; the previous folder is removed afterward.",
      };
    case "install_move_completed":
      return {
        what: "Installation was copied, verified, and the profile path was updated.",
        suggestion:
          "The previous install folder is removed after a successful move. If cleanup failed, retry deleting that folder.",
      };
    case "install_move_failed":
      return {
        what: "Move installation failed before the profile path was updated.",
        suggestion:
          "The original install path remains authoritative. Fix disk space, destination conflicts, or access errors, then retry.",
      };
    case "install_move_cancelled":
      return {
        what: "Move installation was cancelled before the profile path was updated.",
        suggestion: "The original install path remains authoritative. Retry when ready.",
      };
    case "install_move_cleanup_completed":
      return {
        what: "The previous install folder was deleted after a successful move.",
      };
    case "install_move_cleanup_failed":
      return {
        what: "Cleanup of the previous install folder failed.",
        suggestion:
          "Confirm nothing is using that folder, then retry cleanup from the server workspace.",
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
    case "auto_start_skipped":
      return {
        what: "Opt-in auto-start skipped this server at application launch.",
        suggestion:
          "Check Inactive state, install health, running/reattached process, or locks if you expected it to start.",
      };
    case "auto_start_succeeded":
      return {
        what: "Opt-in auto-start launched this server at application launch.",
      };
    case "auto_start_failed":
      return {
        what: "Opt-in auto-start tried to launch this server and failed.",
        suggestion:
          "Read the error detail, fix install/ports/locks, then start manually or fix auto-start eligibility.",
      };
    case "server_enabled":
      return {
        what: "A saved server profile was re-enabled.",
        suggestion: "Confirm the install, cluster, and ports before starting the server again.",
      };
    case "server_disabled":
      return {
        what: "A saved server profile was disabled.",
        suggestion: "The profile stays editable and can be re-enabled from the workspace.",
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
    case "logs_retention_completed":
      return {
        what: "YARK applied the operational log retention policy.",
        suggestion:
          "Removed history is not recoverable. Adjust limits under Settings → Log retention if needed.",
      };
    case "logs_retention_failed":
      return {
        what: "Operational log retention could not finish cleanly.",
        suggestion:
          "Check disk permissions on the update-logs folder, then retry Clean up now from Settings.",
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
