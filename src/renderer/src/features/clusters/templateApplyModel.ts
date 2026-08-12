import type { ServerStatus } from "@shared/types";
import { clusterProcessBusyReason } from "./createClusterModel";

/** Restore / promote / seed require an idle (non-running) server. */
export function templateApplyIneligibilityReason(
  status: ServerStatus,
): string | null {
  return clusterProcessBusyReason(status);
}
