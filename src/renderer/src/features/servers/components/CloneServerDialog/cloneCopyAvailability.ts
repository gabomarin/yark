import type { InstallationHealthStatus } from "@shared/types";

const DEFAULT_COPY_DESCRIPTION =
  "Game.ini and GameUserSettings.ini already come with the clone. This also duplicates binaries, Saved, and world data. The source server must be stopped. Large installs can take a while.";

/** Healths where a folder copy cannot succeed (nothing readable to duplicate). */
export function isCloneCopyUnavailable(
  health: InstallationHealthStatus | null | undefined,
): boolean {
  return (
    health === "missing"
    || health === "empty"
    || health === "inaccessible"
    || health === "unknown"
  );
}

export function cloneCopyCheckboxDescription(
  health: InstallationHealthStatus | null | undefined,
): string {
  if (health === "missing" || health === "empty") {
    return "This server has no install files yet. Clone uses default INIs plus this form. Use Install on the new server.";
  }
  if (health === "inaccessible" || health === "unknown") {
    return "YARK cannot read this install folder, so it cannot copy it. Clone the profile only.";
  }
  return DEFAULT_COPY_DESCRIPTION;
}

export function cloneCopyWarning(
  health: InstallationHealthStatus | null | undefined,
): string | null {
  if (health === "incomplete") {
    return "This install is incomplete. The copy includes whatever is already on disk; you may still need Install/Verify on the clone.";
  }
  if (health === "suspicious") {
    return "This folder does not look like a ready ASA install. The copy includes whatever is on disk.";
  }
  return null;
}
