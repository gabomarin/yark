import type { CriticalJobOperation, SteamCmdStatus } from "@shared/types";

export const FILES_QUEUE_OPERATIONS = new Set<CriticalJobOperation>([
  "install-files",
  "update",
  "verify-files",
]);

const OPERATION_TITLE: Record<
  NonNullable<SteamCmdStatus["operation"]> | CriticalJobOperation,
  string
> = {
  "install-steamcmd": "Installing SteamCMD",
  "install-files": "Installing files",
  update: "Updating server",
  "sync-files": "Copying files to the server",
  "verify-files": "Verifying integrity",
  "pre-update-backup": "Creating pre-update backup",
  restore: "Restoring backup",
};

export function operationTitle(
  operation: NonNullable<SteamCmdStatus["operation"]> | CriticalJobOperation,
): string {
  return OPERATION_TITLE[operation];
}

/** Internal backup sub-step of safe update — never a separate Downloads row. */
export function isOperatorVisibleCriticalJob(job: {
  operation: CriticalJobOperation;
}): boolean {
  return job.operation !== "pre-update-backup";
}
