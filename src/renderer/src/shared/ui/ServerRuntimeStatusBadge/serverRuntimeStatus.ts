import type { ServerStatus } from "@shared/types";

/** Human-readable labels for server process lifecycle. */
const SERVER_RUNTIME_STATUS_LABEL: Record<ServerStatus, string> = {
  stopped: "Stopped",
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  error: "Error",
};

export function serverRuntimeStatusLabel(status: ServerStatus | string): string {
  if (status in SERVER_RUNTIME_STATUS_LABEL) {
    return SERVER_RUNTIME_STATUS_LABEL[status as ServerStatus];
  }
  return status;
}

/** Compact list-thumb tone for runtime status (word + dot). */
export function serverRuntimeStatusTone(
  status: ServerStatus | string,
): "ok" | "warn" | "bad" | "info" | "muted" {
  if (status === "running") return "ok";
  if (status === "starting" || status === "stopping") return "info";
  if (status === "error") return "bad";
  return "muted";
}
