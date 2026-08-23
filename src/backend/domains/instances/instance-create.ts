import type { ServerProfile, ServerProfileInput } from "@shared/types";
import {
  findInstallDirConflict,
  installDirConflictMessage,
  normalizeWindowsPath,
  resolveServerInstallDir,
} from "@shared/server-install-path";
import type { ServerRepository } from "../../infra/db/server-repository";
import { findPortConflicts, validateProfileInput } from "./validation";
import {
  assertInstallDirVacantForCreate,
  installDirKey,
} from "./install-dir-safety";
import { assertImportHealthAllowed, assertNotInsideAsaInstall } from "./import-existing-install";
import { inspectServerInstallationAsync } from "./server-installation";

export interface InstanceCreateHost {
  repo: ServerRepository;
  withFleetCreateLock: <T>(work: () => Promise<T> | T) => Promise<T>;
  /** Kept on InstanceService so unit tests can spy the method. */
  ensureDefaultIniFiles: (installDir: string) => Promise<void>;
}

/**
 * Profile create / import and shared uniqueness asserts for InstanceService.
 */
export class InstanceCreate {
  constructor(private readonly host: InstanceCreateHost) {}

  async create(input: ServerProfileInput): Promise<ServerProfile> {
    return this.host.withFleetCreateLock(async () => {
      this.assertValidInput(input, { create: true });
      this.assertUniqueName(input.name);
      this.assertNoPortConflicts(input);

      const installDir = resolveServerInstallDir(input.installDir, input.name);
      const normalized: ServerProfileInput = { ...input, installDir };
      this.assertValidInput(normalized, { create: true });
      await this.assertCreateInstallTarget(installDir);

      // ensureDefaultIniFiles async — mkdir root here synchronously via ensure
      const profile = this.host.repo.create(normalized);
      void this.host.ensureDefaultIniFiles(profile.installDir);
      this.host.repo.addEvent(
        profile.id,
        "server_created",
        "info",
        `Server "${profile.name}" created at ${profile.installDir} (map ${profile.map})`,
      );
      return profile;
    });
  }

  /**
   * Adopt an existing ASA dedicated root as a YARK profile (#254).
   * Uses the absolute `installDir` as-is (does not nest via resolveServerInstallDir).
   * No SteamCMD sync and **no INI writes** — Start (or later edits) sync profile-owned
   * keys. Requires install health `ready`, or `incomplete` with
   * `allowIncompleteInstall` (#283). All discovered mods are forced into
   * `disabledMods` until the operator enables them.
   */
  async importExisting(
    input: ServerProfileInput,
    options?: { allowIncompleteInstall?: boolean },
  ): Promise<ServerProfile> {
    const installDir = normalizeWindowsPath(input.installDir);
    const mods = [...(input.mods ?? [])];
    const normalized: ServerProfileInput = {
      ...input,
      installDir,
      mods,
      disabledMods: [...mods],
    };
    this.assertValidInput(normalized);
    this.assertUniqueName(normalized.name);
    this.assertNoPortConflicts(normalized);
    this.assertUniqueInstallDir(installDir);
    this.assertInstallDirNotNestedWithFleet(installDir);
    // Match probeImportInstall: nested ShooterGame paths and unmanaged ASA
    // parents never become profiles, even if IPC sends allowIncompleteInstall (#283).
    await assertNotInsideAsaInstall(installDir);

    const installation = await inspectServerInstallationAsync(
      `import:${normalized.name}`,
      installDir,
      { bypassCache: true },
    );
    assertImportHealthAllowed(
      installation.health,
      options,
      installation.guidance,
    );

    // Re-check uniqueness under the fleet create lock after the async probe so a
    // concurrent create/import cannot claim the same name, ports, or installDir.
    return this.host.withFleetCreateLock(async () => {
      this.assertUniqueName(normalized.name);
      this.assertNoPortConflicts(normalized);
      this.assertUniqueInstallDir(installDir);
      this.assertInstallDirNotNestedWithFleet(installDir);
      await assertNotInsideAsaInstall(installDir);

      const profile = this.host.repo.create(normalized);
      const incompleteNote =
        installation.health === "incomplete"
          ? " (incomplete — Install/Verify before Start)"
          : "";
      this.host.repo.addEvent(
        profile.id,
        "server_created",
        "info",
        `Server "${profile.name}" imported from existing install at ${profile.installDir} (map ${profile.map})${incompleteNote}`,
      );
      return profile;
    });
  }

  assertValidInput(
    input: ServerProfileInput,
    options?: { create?: boolean },
  ): void {
    const issues = validateProfileInput(input, options);
    if (issues.length > 0) {
      throw new Error(
        issues.map((i) => `${i.field}: ${i.message}`).join(" | "),
      );
    }
  }

  assertNoPortConflicts(
    input: ServerProfileInput,
    excludeId?: string,
  ): void {
    const others = this.host.repo
      .list()
      .filter((p) => p.id !== excludeId);
    const conflicts = findPortConflicts(others, {
      ...input,
      id: excludeId,
    });
    if (conflicts.length > 0) {
      const c = conflicts[0]!;
      throw new Error(
        `${c.kind} port conflict ${c.port} between "${c.serverA}" and "${c.serverB}"`,
      );
    }
  }

  assertUniqueName(name: string, excludeId?: string): void {
    const normalized = name.trim().toLowerCase();
    const clash = this.host.repo
      .list()
      .find(
        (profile) =>
          profile.id !== excludeId &&
          profile.name.trim().toLowerCase() === normalized,
      );
    if (clash !== undefined) {
      throw new Error(`A server named "${name}" already exists`);
    }
  }

  assertUniqueInstallDir(installDir: string, excludeId?: string): void {
    const target = installDirKey(normalizeWindowsPath(installDir));
    const clash = this.host.repo
      .list()
      .find(
        (profile) =>
          profile.id !== excludeId &&
          installDirKey(normalizeWindowsPath(profile.installDir)) === target,
      );
    if (clash !== undefined) {
      throw new Error(
        `A server already uses folder "${installDir}" ("${clash.name}")`,
      );
    }
  }

  assertInstallDirNotNestedWithFleet(
    installDir: string,
    excludeId?: string,
  ): void {
    const conflict = findInstallDirConflict(
      installDir,
      this.host.repo.list().map((profile) => ({
        id: profile.id,
        name: profile.name,
        installDir: profile.installDir,
      })),
      excludeId,
    );
    if (conflict === null || conflict.relation === "same") {
      return;
    }
    throw new Error(installDirConflictMessage(conflict));
  }

  /** Unique, not nested with the fleet or an ASA tree, and vacant on disk. */
  async assertCreateInstallTarget(installDir: string): Promise<void> {
    this.assertUniqueInstallDir(installDir);
    this.assertInstallDirNotNestedWithFleet(installDir);
    await assertNotInsideAsaInstall(installDir);
    await assertInstallDirVacantForCreate(installDir);
  }
}
