/**
 * Staging and pending-cleanup registry I/O for MoveInstallService (#215).
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { normalizeWindowsPath } from "@shared/server-install-path";
import { installDirKey, isWindowsDriveRoot } from "./install-dir-safety";

/** Persisted absolute staging paths awaiting sweep after interrupted moves. */
const STAGING_REGISTRY_KEY = "paths";

/** Persisted prior install paths awaiting operator cleanup after a successful move (#215). */
const PENDING_CLEANUP_REGISTRY_KEY = "byServerId";

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates the destination parent when needed.
 * Never calls mkdir on a drive root (`H:\`) — Windows returns EPERM for that.
 */
export async function ensureParentDirectory(targetPath: string): Promise<void> {
  const parent = dirname(targetPath);
  if (isWindowsDriveRoot(parent)) {
    if (!(await pathExists(parent))) {
      throw new Error(
        `Drive is not available: ${parent}. Choose a folder on a mounted volume.`,
      );
    }
    return;
  }
  await mkdir(parent, { recursive: true });
}

export class MoveInstallRegistry {
  constructor(
    private readonly stagingRegistryPath: string | null,
    private readonly pendingCleanupRegistryPath: string | null,
  ) {}

  async readPendingCleanupRegistry(): Promise<Record<string, string>> {
    if (this.pendingCleanupRegistryPath === null) {
      return {};
    }
    try {
      const raw = await readFile(this.pendingCleanupRegistryPath, "utf8");
      const parsed = JSON.parse(raw) as {
        [PENDING_CLEANUP_REGISTRY_KEY]?: unknown;
      };
      const byServerId = parsed[PENDING_CLEANUP_REGISTRY_KEY];
      if (
        byServerId === null
        || typeof byServerId !== "object"
        || Array.isArray(byServerId)
      ) {
        return {};
      }
      const result: Record<string, string> = {};
      for (const [serverId, pathValue] of Object.entries(byServerId)) {
        if (typeof pathValue === "string" && pathValue.trim().length > 0) {
          result[serverId] = resolve(pathValue);
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  async writePendingCleanupRegistry(
    byServerId: Record<string, string>,
  ): Promise<void> {
    if (this.pendingCleanupRegistryPath === null) {
      return;
    }
    await ensureParentDirectory(this.pendingCleanupRegistryPath);
    await writeFile(
      this.pendingCleanupRegistryPath,
      `${JSON.stringify({ [PENDING_CLEANUP_REGISTRY_KEY]: byServerId }, null, 2)}\n`,
      "utf8",
    );
  }

  async getPendingCleanup(serverId: string): Promise<string | null> {
    const registry = await this.readPendingCleanupRegistry();
    const pathValue = registry[serverId];
    return typeof pathValue === "string" && pathValue.length > 0
      ? pathValue
      : null;
  }

  async setPendingCleanup(
    serverId: string,
    oldSourceDir: string,
  ): Promise<void> {
    if (this.pendingCleanupRegistryPath === null) {
      return;
    }
    const registry = await this.readPendingCleanupRegistry();
    registry[serverId] = resolve(normalizeWindowsPath(oldSourceDir));
    await this.writePendingCleanupRegistry(registry);
  }

  async clearPendingCleanup(serverId: string): Promise<void> {
    if (this.pendingCleanupRegistryPath === null) {
      return;
    }
    const registry = await this.readPendingCleanupRegistry();
    if (!(serverId in registry)) {
      return;
    }
    delete registry[serverId];
    await this.writePendingCleanupRegistry(registry);
  }

  async readStagingRegistry(): Promise<string[]> {
    if (this.stagingRegistryPath === null) {
      return [];
    }
    try {
      const raw = await readFile(this.stagingRegistryPath, "utf8");
      const parsed = JSON.parse(raw) as { [STAGING_REGISTRY_KEY]?: unknown };
      const paths = parsed[STAGING_REGISTRY_KEY];
      if (!Array.isArray(paths)) {
        return [];
      }
      return paths.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
    } catch {
      return [];
    }
  }

  async writeStagingRegistry(paths: string[]): Promise<void> {
    if (this.stagingRegistryPath === null) {
      return;
    }
    const unique = [...new Set(paths.map((entry) => resolve(entry)))];
    await ensureParentDirectory(this.stagingRegistryPath);
    await writeFile(
      this.stagingRegistryPath,
      `${JSON.stringify({ [STAGING_REGISTRY_KEY]: unique }, null, 2)}\n`,
      "utf8",
    );
  }

  async registerStagingPath(stagingDir: string): Promise<void> {
    const existing = await this.readStagingRegistry();
    const key = installDirKey(stagingDir);
    if (existing.some((entry) => installDirKey(entry) === key)) {
      return;
    }
    await this.writeStagingRegistry([...existing, resolve(stagingDir)]);
  }

  async unregisterStagingPath(stagingDir: string): Promise<void> {
    const existing = await this.readStagingRegistry();
    const key = installDirKey(stagingDir);
    const next = existing.filter((entry) => installDirKey(entry) !== key);
    if (next.length === existing.length) {
      return;
    }
    await this.writeStagingRegistry(next);
  }
}
