/**
 * Clear / list local ASA mod folders for a server install (#702).
 */

import { existsSync } from "node:fs";
import type { ServerProfile } from "@shared/types";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import {
  deleteLocalModFolders,
  listLocalModFolders,
  listLocalModPresence,
  STOP_SERVER_BEFORE_DELETE_MOD_FILES,
  type DeleteLocalModFoldersResult,
} from "../mods/asa-mod-local-files";
import { installDirKey } from "./install-dir-safety";

export type ModLocalFilesHost = {
  mustGet(id: string): ServerProfile;
  installDirFor(id: string): string;
  repo: { list(): ServerProfile[] };
  processes: { isActive(id: string): boolean };
  locks: InstanceLockManager;
};

/** Profiles that share this install folder (including `profile`). */
function profilesOnSharedInstall(host: ModLocalFilesHost, profile: ServerProfile): ServerProfile[] {
  const key = installDirKey(profile.installDir);
  return host.repo.list().filter((other) => installDirKey(other.installDir) === key);
}

function assertInstallIdleForModFileDelete(host: ModLocalFilesHost, profile: ServerProfile): void {
  for (const entry of profilesOnSharedInstall(host, profile)) {
    if (host.processes.isActive(entry.id)) {
      throw new Error(STOP_SERVER_BEFORE_DELETE_MOD_FILES);
    }
  }
}

/**
 * Nest per-server locks in sorted id order so Start/Restart cannot begin on any
 * shared-install profile while mod folders are being deleted (#702).
 */
async function withSharedInstallLocks<T>(
  host: ModLocalFilesHost,
  profile: ServerProfile,
  purpose: string,
  work: () => Promise<T>,
): Promise<T> {
  const ids = profilesOnSharedInstall(host, profile)
    .map((entry) => entry.id)
    .sort((a, b) => a.localeCompare(b));
  const run = async (index: number): Promise<T> => {
    if (index >= ids.length) return work();
    const id = ids[index]!;
    return host.locks.withLock(id, purpose, () => run(index + 1));
  };
  return run(0);
}

/** Delete local `{projectId}_{fileId}` folders so the next Start redownloads. */
export async function redownloadLocalModFiles(
  host: ModLocalFilesHost,
  serverId: string,
  projectId: string,
): Promise<DeleteLocalModFoldersResult> {
  const profile = host.mustGet(serverId);
  return withSharedInstallLocks(host, profile, "clear-mod-files", async () => {
    assertInstallIdleForModFileDelete(host, profile);
    if (!existsSync(profile.installDir)) {
      throw new Error(`Server folder does not exist: ${profile.installDir}`);
    }
    return deleteLocalModFolders(profile.installDir, projectId);
  });
}

export async function listServerLocalModFolders(
  host: ModLocalFilesHost,
  serverId: string,
  projectId: string,
): Promise<string[]> {
  return listLocalModFolders(host.installDirFor(serverId), projectId);
}

export async function listServerLocalModPresence(
  host: ModLocalFilesHost,
  serverId: string,
  projectIds: readonly string[],
): Promise<Record<string, boolean>> {
  return listLocalModPresence(host.installDirFor(serverId), projectIds);
}
