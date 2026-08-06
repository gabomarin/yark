import type { ServerStatus } from "@shared/types";

/** Restore / promote / seed require a stopped server. */
export function templateApplyIneligibilityReason(
  status: ServerStatus,
): string | null {
  if (status !== "stopped") {
    return "Server must be stopped";
  }
  return null;
}
