import {
  getWindowsPathError,
  isWindowsPathEqual,
  normalizeWindowsPath,
  resolveServerInstallDir,
  selfNestInstallWarning,
  serverFolderName,
  windowsPathFolderSegments,
  type FleetInstallRef,
} from "@shared/server-install-path";
import type { ImportInstallProbe } from "@shared/types";
import {
  diskMoveInstallWarning,
  fleetCreateInstallWarning,
} from "../ServerForm/createInstallPathWarning";

/** Current install folder leaf (fallback: profile name). */
export function moveDestFolderName(sourceInstallDir: string, serverName: string): string {
  const leaf = windowsPathFolderSegments(sourceInstallDir).at(-1);
  if (leaf !== undefined && leaf.length > 0) {
    return leaf;
  }
  return serverFolderName(serverName);
}

/** Exact dest, or `base\<folder>` when Create folder is on (same as create). */
export function resolveMoveDestDir(
  pickedDir: string,
  folderName: string,
  createFolder: boolean,
): string {
  const picked = pickedDir.trim();
  if (picked.length === 0) {
    return "";
  }
  if (!createFolder) {
    return normalizeWindowsPath(picked);
  }
  return resolveServerInstallDir(picked, folderName);
}

export function moveDestSameAsSourceWarning(
  sourceDir: string,
  destDir: string,
): string | null {
  if (isWindowsPathEqual(sourceDir, destDir)) {
    return "Destination must differ from the current install path";
  }
  return null;
}

/**
 * Live Move dest preview: path shape → same/self-nest → fleet → disk probe.
 * Pass `probe: null` while the async disk check is in flight.
 */
export function moveDestPreviewIssue(options: {
  sourceDir: string;
  destDir: string;
  fleet: readonly FleetInstallRef[];
  excludeId: string;
  probe: ImportInstallProbe | null;
}): string | null {
  const dest = options.destDir.trim();
  if (dest.length === 0) {
    return null;
  }
  const pathError = getWindowsPathError(dest, "Destination");
  if (pathError !== null) {
    return pathError;
  }
  if (/^[a-zA-Z]:\\?$/.test(normalizeWindowsPath(dest))) {
    return "Destination must be a folder on the drive (for example H:\\ARK\\MyServer), not the drive root itself.";
  }
  const same = moveDestSameAsSourceWarning(options.sourceDir, dest);
  if (same !== null) {
    return same;
  }
  const selfNest = selfNestInstallWarning(options.sourceDir, dest);
  if (selfNest !== null) {
    return selfNest;
  }
  const fleet = fleetCreateInstallWarning(dest, options.fleet, options.excludeId);
  if (fleet !== null) {
    return fleet;
  }
  if (options.probe === null) {
    return null;
  }
  return diskMoveInstallWarning(options.probe);
}
