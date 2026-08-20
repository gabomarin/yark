import type { ServerStatus } from "./types";

export interface ServerProcessRuntime {
  status: ServerStatus;
  processLive: boolean;
}

/**
 * True when YARK still tracks an ASA child that has not exited.
 * `error` with a live PID counts as busy (stop may have timed out).
 */
export function isServerProcessLive(runtime: ServerProcessRuntime): boolean {
  if (runtime.processLive) return true;
  return (
    runtime.status === "starting"
    || runtime.status === "running"
    || runtime.status === "stopping"
  );
}

/** Block cluster membership / INI template writes while ASA may still be running. */
function isServerProcessBusyForClusterOps(
  runtime: ServerProcessRuntime,
): boolean {
  return isServerProcessLive(runtime);
}

export function clusterProcessBusyReason(
  runtime: ServerProcessRuntime,
): string | null {
  if (isServerProcessBusyForClusterOps(runtime)) {
    return "Server must not be running";
  }
  return null;
}
