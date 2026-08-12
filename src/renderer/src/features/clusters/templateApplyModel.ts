import type { ServerProcessRuntime } from "@shared/server-process-idle";
import { clusterProcessBusyReason } from "./createClusterModel";

/** Restore / promote / seed require an idle (non-running) server. */
export function templateApplyIneligibilityReason(
  runtime: ServerProcessRuntime,
): string | null {
  return clusterProcessBusyReason(runtime);
}
