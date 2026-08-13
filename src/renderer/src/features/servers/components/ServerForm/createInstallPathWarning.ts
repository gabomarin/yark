import {
  findInstallDirConflict,
  installDirConflictMessage,
  type FleetInstallRef,
} from "@shared/server-install-path";
import type { ImportInstallProbe } from "@shared/types";

export function fleetCreateInstallWarning(
  candidate: string,
  fleet: readonly FleetInstallRef[],
): string | null {
  const conflict = findInstallDirConflict(candidate, fleet);
  if (conflict === null) {
    return null;
  }
  return installDirConflictMessage(conflict);
}

/** Disk probe for create: missing/empty OK; ASA/managed/non-empty must Import. */
export function diskCreateInstallWarning(probe: ImportInstallProbe): string | null {
  if (probe.alreadyManagedBy !== null) {
    return `A server already uses folder "${probe.installDir}" ("${probe.alreadyManagedBy}")`;
  }
  if (probe.nestedSubfolder) {
    return (
      probe.installation.guidance ??
      "This path is inside an ASA install. Nested servers are not supported."
    );
  }
  const health = probe.installation.health;
  if (health === "missing" || health === "empty") {
    return null;
  }
  if (health === "inaccessible") {
    return `Cannot read install folder "${probe.installDir}".`;
  }
  return `Install folder is not empty: "${probe.installDir}". Pick an empty folder, or use Import install for an existing ASA server.`;
}
