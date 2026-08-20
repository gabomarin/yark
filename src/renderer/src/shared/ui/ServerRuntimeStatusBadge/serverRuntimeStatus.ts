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

/** Mantine Badge color for a runtime status. */
export function serverRuntimeStatusColor(status: ServerStatus | string): string {
  if (status === "running") return "green";
  if (status === "error") return "red";
  if (status === "starting" || status === "stopping") return "blue";
  return "gray";
}

/**
 * Compact list-thumb tone used by workspace server switcher rows.
 * Maps onto the same semantic colors as {@link serverRuntimeStatusColor}.
 */
export function serverRuntimeStatusTone(
  status: ServerStatus | string,
): "ok" | "warn" | "bad" | "info" | "muted" {
  if (status === "running") return "ok";
  if (status === "starting" || status === "stopping") return "info";
  if (status === "error") return "bad";
  return "muted";
}
