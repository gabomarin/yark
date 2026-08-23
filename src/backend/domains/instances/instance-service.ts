import type {
  ClusterComplianceReport,
  InstallationHealthStatus,
  InstallationServersMode,
  OfficialNetworkStatus,
  ServerInstallationInfo,
  ServerProfile,
  ServerProfileInput,
  ServerProfilePatch,
  ServerRuntimeInfo,
  ServerStopProgress,
  ServerStopProgressReason,
  StartServerOptions,
} from "@shared/types";
import {
  EMPTY_WIPE_STALE_MESSAGE,
} from "@shared/types";
import { applyServerProfilePatch } from "@shared/server-profile";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import {
  findInstallDirConflict,
  installDirConflictMessage,
  normalizeWindowsPath,
  resolveServerInstallDir,
} from "@shared/server-install-path";
import type { BackupService } from "../backups/backup-service";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager, UnexpectedManagedExit } from "../../infra/process/process-manager";
import type { RconSessionManager } from "../../infra/rcon/rcon-session-manager";
import { mapIdentityStartBlockers } from "@shared/map-identity";
import { findPortConflicts, validateProfileInput } from "./validation";
import { checkClusterCompliance } from "../cluster/compliance";
import type { ListedPlayer } from "../backups/list-players";
import type { BanListEntry } from "./ban-list";
import {
  assertInstallDirVacantForCreate,
  assertSafeInstallDirForWipe,
  installDirKey,
} from "./install-dir-safety";
import { assertImportHealthAllowed, assertNotInsideAsaInstall } from "./import-existing-install";
import {
  invalidateInstallInspectCache,
  inspectServerInstallationAsync,
  readOfficialArkBuildCached,
  readOfficialArkVersionCached,
} from "./server-installation";
import { syncProfileSettingsToIni } from "./sync-profile-ini";
import {
  isInstallHealthDegradation,
  isInstallationReady,
} from "@shared/installation-health";
import { assertHostPortsAvailable } from "../../infra/process/host-port-probe";
import { resolveDisplayedServerVersion } from "@shared/server-version-display";
import { planUnexpectedServerCrashEvent } from "./instance-crash";
import {
  FLEET_INSPECT_CONCURRENCY,
  backupKindLabel,
  backingUpPercent,
  buildServerStopProgress,
  buildServerStoppedEventMessage,
  mapPool,
  type StopJobOutcome,
} from "./instance-lifecycle";
import {
  applySessionPortsToProfile,
  buildFleetInspectKey,
  fleetServerSetChanged,
  shouldInspectFleetInstallations,
  validateSessionPorts,
} from "./instance-profile";
import { InstanceRcon } from "./instance-rcon";
import { InstanceClone, type CloneParams } from "./instance-clone";

export type { StopJobOutcome };

/** Single-server / gate paths may use heavier version fallbacks. */
const ENRICHED_INSTALL_INSPECT = {
  bypassCache: true,
  allowExecutableVersionProbe: true,
  allowLogVersionProbe: true,
} as const;

export interface StopServerOptions {
  /** When true (default), create a stable stop backup after process exit. */
  backup?: boolean;
  /** Progress reason for UI (quit shows the blocking overlay). Default `"user"`. */
  reason?: ServerStopProgressReason;
}

/**
 * Instance orchestration service: validated CRUD + lifecycle.
 */
export class InstanceService extends EventEmitter {
  private readonly stopJobs = new Map<string, Promise<StopJobOutcome>>();
  /** Covers restart after stopJobs clears (pre_restart ZIP only; not start). */
  private readonly criticalJobs = new Map<string, Promise<unknown>>();
  /** Serializes profile row writes so Launch/Mods patches cannot clobber (#209). */
  private readonly profileWriteChains = new Map<string, Promise<unknown>>();
  /**
   * Serializes fleet-wide profile creation (create / import / clone) so uniqueness
   * checks for name, ports, and installDir cannot race across concurrent IPC (#254).
   */
  private fleetCreateChain: Promise<unknown> = Promise.resolve();
  private lastOfficialVersion: string | null | undefined = undefined;
  private lastOfficialSteamBuild: string | null | undefined = undefined;
  private lastInstallServers: ServerInstallationInfo[] = [];
  /** Last classified health per server — used for degradation-only events (#57). */
  private readonly lastKnownInstallHealth = new Map<string, InstallationHealthStatus>();
  /** Coalesce concurrent full-fleet installation inspects for the same profile set + cache mode. */
  private fleetInspectInFlight: {
    key: string;
    promise: Promise<ServerInstallationInfo[]>;
  } | null = null;
  private readonly rcon: InstanceRcon;
  private readonly clones: InstanceClone;

  constructor(
    private readonly repo: ServerRepository,
    private readonly processes: ProcessManager,
    private readonly backups: BackupService,
    private readonly locks: InstanceLockManager,
  ) {
    super();
    this.rcon = new InstanceRcon(repo, processes, (info) => {
      this.emit("rcon-status-changed", info);
    });
    this.clones = new InstanceClone({
      repo,
      processes,
      backups,
      locks,
      withFleetCreateLock: (work) => this.withFleetCreateLock(work),
      assertValidInput: (input) => this.assertValidInput(input),
      assertCreateInstallTarget: (installDir) =>
        this.assertCreateInstallTarget(installDir),
      assertNoPortConflicts: (input) => this.assertNoPortConflicts(input),
      assertUniqueName: (name) => this.assertUniqueName(name),
      deleteProfile: (id, options) => this.delete(id, options),
      isStopInProgress: (id) => this.isStopInProgress(id),
      emitProgress: (payload) => this.emit("clone-progress", payload),
    });
    this.processes.on("unexpected-exit", (payload: UnexpectedManagedExit) => {
      this.recordUnexpectedProcessExit(payload);
    });
  }

  list(): ServerProfile[] {
    return this.repo.list();
  }

  /**
   * Queue create/import/clone so overlapping uniqueness checks see a consistent fleet.
   */
  private async withFleetCreateLock<T>(work: () => Promise<T> | T): Promise<T> {
    const run = this.fleetCreateChain.then(() => work(), () => work());
    this.fleetCreateChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async create(input: ServerProfileInput): Promise<ServerProfile> {
    return this.withFleetCreateLock(async () => {
      this.assertValidInput(input, { create: true });
      this.assertUniqueName(input.name);
      this.assertNoPortConflicts(input);

      const installDir = resolveServerInstallDir(input.installDir, input.name);
      const normalized: ServerProfileInput = { ...input, installDir };
      this.assertValidInput(normalized, { create: true });
      await this.assertCreateInstallTarget(installDir);

      // ensureDefaultIniFiles async — mkdir root here synchronously via ensure
      const profile = this.repo.create(normalized);
      void this.ensureDefaultIniFiles(profile.installDir);
      this.repo.addEvent(
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
    return this.withFleetCreateLock(async () => {
      this.assertUniqueName(normalized.name);
      this.assertNoPortConflicts(normalized);
      this.assertUniqueInstallDir(installDir);
      this.assertInstallDirNotNestedWithFleet(installDir);
      await assertNotInsideAsaInstall(installDir);

      const profile = this.repo.create(normalized);
      const incompleteNote =
        installation.health === "incomplete"
          ? " (incomplete — Install/Verify before Start)"
          : "";
      this.repo.addEvent(
        profile.id,
        "server_created",
        "info",
        `Server "${profile.name}" imported from existing install at ${profile.installDir} (map ${profile.map})${incompleteNote}`,
      );
      return profile;
    });
  }

  private async ensureDefaultIniFiles(installDir: string): Promise<void> {
    const configDir = join(
      installDir,
      "ShooterGame",
      "Saved",
      "Config",
      "WindowsServer",
    );
    await mkdir(configDir, { recursive: true });
    const gameUserSettingsPath = join(configDir, "GameUserSettings.ini");
    const gameIniPath = join(configDir, "Game.ini");
    if (!existsSync(gameUserSettingsPath)) {
      await writeFile(gameUserSettingsPath, defaultGameUserSettingsIni, "utf8");
    }
    if (!existsSync(gameIniPath)) {
      await writeFile(gameIniPath, defaultGameIni, "utf8");
    }
  }

  update(id: string, input: ServerProfileInput): ServerProfile {
    // Allowed while hot: ports/map/etc. apply when the process restarts.
    this.assertValidInput(input);
    this.assertUniqueName(input.name, id);
    this.assertNoPortConflicts(input, id);
    const existing = this.repo.get(id);
    if (existing === null) {
      throw new Error("Server does not exist");
    }
    if (installDirKey(input.installDir) !== installDirKey(existing.installDir)) {
      throw new Error(
        "Install directory cannot be changed here. Use Move installation to copy, verify, and commit a new path.",
      );
    }
    const updated = this.repo.update(id, {
      ...input,
      installDir: existing.installDir,
    });
    if (updated === null) {
      throw new Error("Server does not exist");
    }
    void syncProfileSettingsToIni(updated).catch(() => {
      // INI may be missing until install; start() syncs again before launch.
    });
    this.repo.addEvent(
      id,
      "server_updated",
      "info",
      `Server "${updated.name}" updated`,
    );
    return updated;
  }

  /**
   * Apply a Launch/Mods field-group patch against the latest row (#209).
   * Serialized per server so concurrent panel persists cannot last-write-wins.
   */
  async updatePatch(
    id: string,
    patch: ServerProfilePatch,
    prepare: (merged: ServerProfileInput, existing: ServerProfile) => Promise<ServerProfileInput> | ServerProfileInput = (merged) => merged,
  ): Promise<ServerProfile> {
    return this.withProfileWrite(id, async () => {
      const existing = this.repo.get(id);
      if (existing === null) {
        throw new Error("Server does not exist");
      }
      const merged = await prepare(applyServerProfilePatch(existing, patch), existing);
      return this.update(id, merged);
    });
  }

  /** Queue profile mutations so overlapping IPC updates run one-at-a-time per server. */
  async withProfileWrite<T>(id: string, work: () => Promise<T> | T): Promise<T> {
    const previous = this.profileWriteChains.get(id) ?? Promise.resolve();
    const run = previous.then(() => work(), () => work());
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.profileWriteChains.set(id, settled);
    void settled.finally(() => {
      if (this.profileWriteChains.get(id) === settled) {
        this.profileWriteChains.delete(id);
      }
    });
    return run;
  }

  /**
   * Commits a verified install path after Move installation.
   * Only {@link MoveInstallService} should call this after copy+verify succeed.
   */
  commitInstallDir(id: string, installDir: string): ServerProfile {
    const existing = this.repo.get(id);
    if (existing === null) {
      throw new Error("Server does not exist");
    }
    this.assertUniqueInstallDir(installDir, id);
    this.assertInstallDirNotNestedWithFleet(installDir, id);
    const updated = this.repo.updateInstallDir(id, installDir);
    if (updated === null) {
      throw new Error("Server does not exist");
    }
    this.lastInstallServers = this.lastInstallServers.filter(
      (info) => info.serverId !== id,
    );
    this.lastKnownInstallHealth.delete(id);
    invalidateInstallInspectCache(id);
    this.repo.addEvent(
      id,
      "server_updated",
      "info",
      `Server "${updated.name}" install path committed to ${updated.installDir}`,
    );
    return updated;
  }

  /** Exposed for Move installation uniqueness and nesting checks. */
  async assertInstallDirAvailable(
    installDir: string,
    excludeId?: string,
  ): Promise<void> {
    this.assertUniqueInstallDir(installDir, excludeId);
    this.assertInstallDirNotNestedWithFleet(installDir, excludeId);
    await assertNotInsideAsaInstall(installDir);
  }

  async delete(
    id: string,
    options: { deleteInstallFiles: boolean; requireEmptyInstall?: boolean },
  ): Promise<void> {
    if (this.processes.isActive(id)) {
      throw new Error("Cannot delete a server while it is running");
    }
    const profile = this.repo.get(id);
    if (profile === null) return;

    if (!options.deleteInstallFiles) {
      this.repo.delete(id);
      this.repo.addEvent(
        null,
        "server_deleted",
        "info",
        `Server "${profile.name}" removed from YARK (files kept at ${profile.installDir})`,
      );
      return;
    }

    if (options.requireEmptyInstall === true) {
      const installation = await inspectServerInstallationAsync(
        id,
        profile.installDir,
        { bypassCache: true },
      );
      if (installation.health !== "empty") {
        throw new Error(EMPTY_WIPE_STALE_MESSAGE);
      }
    }

    const installDir = assertSafeInstallDirForWipe(profile.installDir);
    const shared = this.repo
      .list()
      .filter((item) => item.id !== id && resolve(item.installDir) === installDir);
    if (shared.length > 0) {
      const names = shared.map((item) => item.name).join(", ");
      throw new Error(
        `Cannot delete "${installDir}" from disk: also used by: ${names}. Remove or change those profiles first.`,
      );
    }

    if (existsSync(installDir)) {
      await rm(installDir, { recursive: true, force: true });
    }

    this.repo.delete(id);
    this.repo.addEvent(
      null,
      "server_deleted",
      "info",
      `Server "${profile.name}" deleted (profile + files at ${installDir})`,
    );
  }

  /** Clones a profile with a derived name and ports shifted +10. */
  async clone(id: string): Promise<ServerProfile> {
    return this.clones.clone(id);
  }

  /** Clones a profile with custom parameters from the dialog. */
  async cloneWithParams(id: string, params: CloneParams): Promise<ServerProfile> {
    return this.clones.cloneWithParams(id, params);
  }

  /** Cancels an in-flight clone folder copy. Returns false when none is active. */
  cancelCloneCopy(): boolean {
    return this.clones.cancelCopy();
  }

  async start(id: string, options?: StartServerOptions): Promise<void> {
    if (this.isStopInProgress(id)) {
      throw new Error("Server stop and backup are still in progress");
    }
    await this.locks.withLock(id, "start", () => this.startInternal(id, options));
  }

  /**
   * Atomic restart: stop (no pre_stop) → fail-hard `pre_restart` backup → start.
   * Holds the instance lock for the whole sequence (#13).
   * Registers a critical job through stop + pre_restart only so quit can wait
   * for the recovery ZIP while the server is still stopped, then run stopAll
   * if start has already begun.
   */
  async restart(id: string, options?: StartServerOptions): Promise<void> {
    this.mustGet(id);
    if (!this.processes.isActive(id)) {
      throw new Error("Server is not running");
    }
    if (this.isStopInProgress(id)) {
      throw new Error("Server stop and backup are still in progress");
    }
    return this.locks.withLock(id, "restart", async () => {
      await this.withCriticalJob(id, async () => {
        const outcome = await this.enqueueStop(id, false);
        if (outcome === "killed") {
          throw new Error(
            "Restart aborted: SaveWorld failed and the process was force-killed",
          );
        }
        if (outcome === "absent" || outcome === "noop") {
          throw new Error("Restart aborted: server is not running");
        }
        await this.backups.createPreRestartBackup(id, { skipFlush: true });
      });
      // Start is outside the critical job so a quit that only waited for
      // stop/backup would see a stopped server. App quit also waits for the
      // restart lock (see settleForAppQuit) to cover sync → spawn, then stopAll.
      await this.startForMaintenance(id, options);
    });
  }

  /** Start from a job that already owns the per-server operational lock. */
  async startForMaintenance(
    id: string,
    options?: StartServerOptions,
  ): Promise<void> {
    await this.startInternal(id, options);
  }

  private async startInternal(
    id: string,
    options?: StartServerOptions,
  ): Promise<void> {
    const profile = this.mustGet(id);
    if (!profile.enabled) {
      throw new Error(`Server "${profile.name}" is disabled`);
    }
    const installation = await inspectServerInstallationAsync(
      profile.id,
      profile.installDir,
      ENRICHED_INSTALL_INSPECT,
    );
    this.recordInstallHealth(installation);
    if (!isInstallationReady(installation)) {
      throw new Error(
        `Server files are not ready (${installation.health}): ${installation.guidance}`,
      );
    }
    const effective = this.effectiveStartProfile(profile, options);
    this.assertValidInput(effective);
    this.assertMapIdentityReadyForStart(effective);
    const running = this.repo
      .list()
      .filter((p) => p.id !== id && this.processes.isActive(p.id))
      .map((p) => this.processes.applyRuntimePorts(p));
    const conflicts = findPortConflicts(running, { ...effective });
    if (conflicts.length > 0) {
      const c = conflicts[0]!;
      throw new Error(
        `Port conflict ${c.kind} ${c.port} with active server "${c.serverA === profile.name ? c.serverB : c.serverA}"`,
      );
    }
    const others = this.repo.list().filter((p) => p.id !== id);
    await assertHostPortsAvailable(effective, others, {
      allowInconclusive: options?.skipPortValidation === true,
    });
    await syncProfileSettingsToIni(effective);
    this.processes.start(effective, options);
    const sessionNote =
      options?.sessionPorts != null
        ? ` (session ports game ${effective.gamePort} / query ${effective.queryPort} / RCON ${effective.rconPort}; saved profile unchanged)`
        : "";
    this.repo.addEvent(
      id,
      "server_started",
      "info",
      `Server "${profile.name}" starting (waiting for readiness)${sessionNote}`,
    );
  }

  /** Applies session-only port overrides without mutating the saved profile. */
  private effectiveStartProfile(
    profile: ServerProfile,
    options?: StartServerOptions,
  ): ServerProfile {
    const session = options?.sessionPorts;
    if (session == null) {
      return profile;
    }
    return applySessionPortsToProfile(profile, session);
  }

  private assertValidSessionPorts(ports: {
    gamePort: number;
    queryPort: number;
    rconPort: number;
  }): void {
    validateSessionPorts(ports);
  }

  async setServerEnabled(id: string, enabled: boolean): Promise<ServerProfile> {
    return this.locks.withLock(id, "enable-disable", async () => {
      const profile = this.mustGet(id);
      if (profile.enabled === enabled) {
        return profile;
      }

      if (!enabled) {
        if (this.processes.isActive(id)) {
          throw new Error("Cannot disable a server while it is running");
        }
        if (this.isStopInProgress(id)) {
          throw new Error("Server stop and backup are still in progress");
        }
        if (this.backups.hasServerWork(id)) {
          throw new Error("A backup or restore job is still in progress");
        }
        const updated = this.repo.setEnabled(id, false);
        if (updated === null) {
          throw new Error("Server does not exist");
        }
        this.repo.addEvent(
          id,
          "server_disabled",
          "info",
          `Server "${updated.name}" disabled`,
        );
        return updated;
      }

      const issues = validateProfileInput(profile);
      if (issues.length > 0) {
        throw new Error(
          issues.map((issue) => `${issue.field}: ${issue.message}`).join(" | "),
        );
      }

      // Refresh install health for UI, but do not block Enable — Start/spawn
      // still require ready files (#132).
      const installation = await inspectServerInstallationAsync(
        profile.id,
        profile.installDir,
        ENRICHED_INSTALL_INSPECT,
      );
      this.recordInstallHealth(installation);

      this.assertNoPortConflicts(profile, id);
      const reports = checkClusterCompliance(this.repo.list());
      if (profile.clusterId !== null) {
        const clusterReport = reports.find((report) => report.clusterId === profile.clusterId);
        const firstError = clusterReport?.issues.find((issue) => issue.severity === "error");
        if (firstError !== undefined) {
          throw new Error(firstError.message);
        }
      }

      const updated = this.repo.setEnabled(id, true);
      if (updated === null) {
        throw new Error("Server does not exist");
      }
      this.repo.addEvent(
        id,
        "server_enabled",
        "info",
        `Server "${updated.name}" enabled`,
      );
      return updated;
    });
  }

  stop(id: string, options?: StopServerOptions): Promise<void> {
    if (this.criticalJobs.has(id)) {
      return Promise.reject(
        new Error("Cannot stop while a restart is in progress"),
      );
    }
    const existing = this.stopJobs.get(id);
    if (existing !== undefined) return existing.then(() => undefined);
    const reason = options?.reason ?? "user";

    if (options?.backup === false) {
      return this.enqueueStop(id, false, reason).then(() => undefined);
    }
    return this.locks
      .withLock(id, "stop-and-backup", () => this.enqueueStop(id, true, reason))
      .then(() => undefined);
  }

  isStopInProgress(serverId?: string): boolean {
    if (serverId === undefined) {
      return this.stopJobs.size > 0 || this.criticalJobs.size > 0;
    }
    return this.stopJobs.has(serverId) || this.criticalJobs.has(serverId);
  }

  /**
   * True while quit must defer: stop/pre_restart critical work, or a restart
   * lock still held across the post-backup → start window.
   */
  shouldBlockAppQuit(): boolean {
    return (
      this.isStopInProgress()
      || this.locks.hasPurpose("restart")
      || this.clones.isCopyBusy()
    );
  }

  async waitForStopJobs(): Promise<void> {
    const failures: unknown[] = [];
    while (this.stopJobs.size > 0 || this.criticalJobs.size > 0) {
      const results = await Promise.allSettled([
        ...this.stopJobs.values(),
        ...this.criticalJobs.values(),
      ]);
      for (const result of results) {
        if (result.status === "rejected") failures.push(result.reason);
      }
    }
    if (failures.length > 0) {
      throw failures[0];
    }
  }

  /**
   * Quit "Stop": wait for any still-starting servers, then graceful stop with
   * pre-stop backup and stop-progress UI for every active process.
   */
  async stopAllForAppQuit(): Promise<void> {
    const activeIds: string[] = [];
    for (const profile of this.repo.list()) {
      if (this.processes.isActive(profile.id)) {
        activeIds.push(profile.id);
      }
    }
    if (activeIds.length === 0) {
      return;
    }
    const results = await Promise.allSettled(
      activeIds.map((id) => this.stop(id, { reason: "quit" })),
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    const firstFailure = failures[0];
    if (firstFailure !== undefined) {
      throw firstFailure.reason;
    }
  }

  /**
   * App quit helper: wait for stop/pre_restart work and any restart lock
   * (covers sync → spawn), then graceful-stop leftover active processes.
   */
  async settleForAppQuit(): Promise<void> {
    if (this.clones.isCopyBusy()) {
      this.cancelCloneCopy();
      await this.waitForCloneCopyIdle();
    }
    await this.waitForStopJobs();
    await this.locks.waitUntilNoPurpose("restart");
    await this.stopAllForAppQuit();
  }

  private async waitForCloneCopyIdle(): Promise<void> {
    while (this.clones.isCopyBusy()) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
    }
  }

  private async withCriticalJob<T>(
    id: string,
    work: () => Promise<T>,
  ): Promise<T> {
    if (this.criticalJobs.has(id)) {
      throw new Error("Another server operation is already in progress");
    }
    const job = Promise.resolve()
      .then(() => work())
      .finally(() => {
        if (this.criticalJobs.get(id) === job) {
          this.criticalJobs.delete(id);
        }
      });
    this.criticalJobs.set(id, job);
    return job;
  }

  private enqueueStop(
    id: string,
    wantBackup: boolean,
    reason: ServerStopProgressReason = "user",
  ): Promise<StopJobOutcome> {
    const existing = this.stopJobs.get(id);
    if (existing !== undefined) return existing;
    const job = this.runStop(id, wantBackup, reason).finally(() => {
      if (this.stopJobs.get(id) === job) {
        this.stopJobs.delete(id);
      }
    });
    this.stopJobs.set(id, job);
    return job;
  }

  private async runStop(
    id: string,
    wantBackup: boolean,
    reason: ServerStopProgressReason = "user",
  ): Promise<StopJobOutcome> {
    const profile = this.mustGet(id);
    let didBackup = false;
    let exitedExternally = false;

    if (!this.processes.isActive(id)) {
      return "noop";
    }

    const progress = (
      partial: Omit<ServerStopProgress, "serverId" | "reason">,
    ): ServerStopProgress => buildServerStopProgress(id, reason, partial);

    try {
      if (this.processes.getStatus(id).status === "starting") {
        this.emitStopProgress(
          progress({
            active: true,
            phase: "waiting",
            label: "Waiting for server to finish starting…",
            percent: 5,
          }),
        );
        await this.processes.waitWhileStarting(id);
        if (!this.processes.isActive(id)) {
          return "absent";
        }
      }

      this.emitStopProgress(
        progress({
          active: true,
          phase: "saving",
          label: "Saving world…",
          percent: 10,
        }),
      );

      const runtimeProfile = this.processes.applyRuntimePorts(profile);
      const preparation = await this.processes.beginGracefulStop(runtimeProfile);
      if (preparation.phase === "absent") {
        return "absent";
      }

      if (preparation.phase === "killed") {
        this.repo.addEvent(
          id,
          "server_stopped",
          "warning",
          `Server "${profile.name}" force-killed because RCON SaveWorld failed`,
        );
        return "killed";
      }

      this.emitStopProgress(
        progress({
          active: true,
          phase: "stopping",
          label: "Stopping server before backup…",
          percent: 25,
        }),
      );
      const finishResult = await this.processes.finishGracefulStop(
        runtimeProfile,
        preparation.handle,
      );
      if (finishResult === "replaced") {
        throw new Error(
          "The original process was replaced during stop; the new process was left running",
        );
      }
      exitedExternally = finishResult === "already_exited";

      if (wantBackup) {
        try {
          await this.backups.createPreStopBackup(id, {
            skipFlush: true,
            onKindProgress: (kind, index, total) => {
              this.emitStopProgress(
                progress({
                  active: true,
                  phase: "backing_up",
                  label: `Backing up ${backupKindLabel(kind)}…`,
                  percent: backingUpPercent(index, total),
                }),
              );
            },
          });
          didBackup = true;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.repo.addEvent(
            id,
            "error",
            "warning",
            `Pre-stop backup failed for "${profile.name}": ${message}`,
          );
          this.emitStopProgress(
            progress({
              active: true,
              phase: "backing_up",
              label: "Backup failed — server remains stopped",
              percent: 70,
            }),
          );
        }
      }

      this.repo.addEvent(
        id,
        "server_stopped",
        exitedExternally ? "warning" : "info",
        buildServerStoppedEventMessage({
          serverName: profile.name,
          exitedExternally,
          didBackup,
        }),
      );
      return exitedExternally ? "already_exited" : "stopped";
    } finally {
      this.emitStopProgress(
        progress({
          active: false,
          phase: null,
          label: "",
          percent: null,
        }),
      );
    }
  }

  private emitStopProgress(payload: ServerStopProgress): void {
    this.emit("stop-progress", payload);
  }

  async kill(id: string): Promise<void> {
    if (this.isStopInProgress(id)) {
      throw new Error(
        "Force close is disabled while stop or restart backup is in progress",
      );
    }
    const profile = this.mustGet(id);
    await this.processes.kill(id);
    this.repo.addEvent(
      id,
      "server_stopped",
      "warning",
      `Server "${profile.name}" force-killed (without save)`,
    );
  }

  statuses(): ServerRuntimeInfo[] {
    const ids = this.repo.list().map((p) => p.id);
    if (!this.rcon.isE2eMock()) {
      return this.processes.listStatuses(ids);
    }
    const now = new Date().toISOString();
    return ids.map((serverId) => ({
      serverId,
      status: "running" as const,
      processLive: true,
      pid: 4242,
      startedAt: now,
      lastError: null,
    }));
  }

  installDirFor(id: string): string {
    const profile = this.mustGet(id);
    if (!existsSync(profile.installDir)) {
      throw new Error(`Server folder does not exist: ${profile.installDir}`);
    }
    return profile.installDir;
  }

  async installationInfo(
    forceOfficialCheck = false,
    serversMode: InstallationServersMode = true,
  ): Promise<{
    officialVersion: string | null;
    officialNetworkStatus: OfficialNetworkStatus;
    officialSteamBuild: string | null;
    servers: ServerInstallationInfo[];
  }> {
    const [officialProbe, officialSteamBuild] = await Promise.all([
      readOfficialArkVersionCached(forceOfficialCheck),
      readOfficialArkBuildCached(forceOfficialCheck),
    ]);
    const officialVersion = officialProbe.version;
    const officialNetworkStatus = officialProbe.networkStatus;

    const profiles = this.repo.list();
    const officialChanged =
      this.lastOfficialVersion !== officialVersion ||
      this.lastOfficialSteamBuild !== officialSteamBuild;
    const serverSetChanged = fleetServerSetChanged(profiles, this.lastInstallServers);

    const shouldInspectServers = shouldInspectFleetInstallations({
      forceOfficialCheck,
      serversMode,
      officialChanged,
      serverSetChanged,
    });

    const servers = shouldInspectServers
      ? await this.inspectFleetInstallations({
          bypassCache: forceOfficialCheck,
        })
      : this.lastInstallServers;

    this.lastOfficialVersion = officialVersion;
    this.lastOfficialSteamBuild = officialSteamBuild;
    if (shouldInspectServers) {
      this.lastInstallServers = servers;
    }

    return {
      officialVersion,
      officialNetworkStatus,
      officialSteamBuild,
      servers,
    };
  }

  /**
   * Bounded, async fleet inspect so many profiles (and slow UNC paths) do not
   * freeze the Electron main process. Concurrent callers share one in-flight
   * promise when the profile-set key and cache mode match; after waiting for a
   * different key they re-check before starting another scan.
   */
  private async inspectFleetInstallations(options: {
    bypassCache: boolean;
  }): Promise<ServerInstallationInfo[]> {
    for (;;) {
      const profiles = this.repo.list();
      const key = buildFleetInspectKey(profiles, options.bypassCache);
      const existing = this.fleetInspectInFlight;
      if (existing !== null && existing.key === key) {
        return existing.promise;
      }
      if (existing !== null) {
        // Different fleet snapshot or cache mode — wait, then re-evaluate.
        await existing.promise.catch(() => undefined);
        continue;
      }

      // No in-flight work. Capture the latest list and start (sync section — safe).
      const profilesToScan = this.repo.list();
      const scanKey = buildFleetInspectKey(profilesToScan, options.bypassCache);
      const promise = this.runFleetInstallScan(profilesToScan, options.bypassCache).finally(
        () => {
          if (this.fleetInspectInFlight?.promise === promise) {
            this.fleetInspectInFlight = null;
          }
        },
      );
      this.fleetInspectInFlight = { key: scanKey, promise };
      return promise;
    }
  }

  private async runFleetInstallScan(
    profilesToScan: ReadonlyArray<ServerProfile>,
    bypassCache: boolean,
  ): Promise<ServerInstallationInfo[]> {
    return mapPool(profilesToScan, FLEET_INSPECT_CONCURRENCY, async (profile) => {
      // Fleet starts FS/manifest-only; only no-display-version installs get a
      // follow-up log probe (and optional exe probe on forced refresh).
      let info = await inspectServerInstallationAsync(profile.id, profile.installDir, {
        bypassCache,
      });
      // When the cheap pass has no ARK-style display version, enrich with log
      // (and optionally exe) probes. Do not treat Steam buildids as display versions.
      if (
        info.health === "ready" &&
        resolveDisplayedServerVersion(info) == null
      ) {
        info = await inspectServerInstallationAsync(profile.id, profile.installDir, {
          bypassCache: true,
          allowLogVersionProbe: true,
          allowExecutableVersionProbe: bypassCache,
        });
      }
      this.recordInstallHealth(info);
      return info;
    });
  }

  private recordUnexpectedProcessExit(payload: UnexpectedManagedExit): void {
    const profile = this.repo.get(payload.serverId);
    const name = profile?.name ?? payload.serverId;
    const planned = planUnexpectedServerCrashEvent({
      payload,
      serverName: name,
    });
    const eventId = this.repo.addEvent(
      payload.serverId,
      planned.eventType,
      planned.severity,
      planned.summary,
      planned.details,
    );
    this.emit("server-crashed", {
      ...planned.notify,
      eventId,
    });
  }

  /** Update health memory and emit degradation-only events. */
  private recordInstallHealth(info: ServerInstallationInfo): void {
    const previous = this.lastKnownInstallHealth.get(info.serverId) ?? null;
    this.lastKnownInstallHealth.set(info.serverId, info.health);
    if (!isInstallHealthDegradation(previous, info.health)) {
      return;
    }
    const profile = this.repo.get(info.serverId);
    const name = profile?.name ?? info.serverId;
    this.repo.addEvent(
      info.serverId,
      "installation_health_degraded",
      info.health === "inaccessible" || info.health === "suspicious"
        ? "error"
        : "warning",
      `Install health for "${name}" is ${info.health}`,
      {
        what: `Installation health changed to ${info.health}.`,
        cause: info.reasonCodes.length > 0 ? info.reasonCodes.join(", ") : undefined,
        location: profile?.installDir ?? info.binaryPath,
        suggestion: info.guidance,
        context: {
          health: info.health,
          reasonCodes: info.reasonCodes.join(","),
          previousHealth: previous,
        },
      },
    );
  }

  checkClusters(): ClusterComplianceReport[] {
    return checkClusterCompliance(this.repo.list());
  }

  async sendRcon(id: string, command: string): Promise<string> {
    return this.rcon.send(id, command);
  }

  /**
   * Sends an RCON command through the persistent session.
   * When `recordEvent` is false (polling / stop / backups), skips the audit event.
   */
  async execRcon(
    id: string,
    command: string,
    options?: { recordEvent?: boolean },
  ): Promise<string> {
    return this.rcon.exec(id, command, options);
  }

  /** Lists online players via the persistent session (silent; no history event). */
  async listPlayers(id: string): Promise<ListedPlayer[]> {
    return this.rcon.listPlayers(id);
  }

  async kickPlayer(id: string, playerKey: string): Promise<string> {
    return this.rcon.kickPlayer(id, playerKey);
  }

  async banPlayer(id: string, playerKey: string): Promise<string> {
    return this.rcon.banPlayer(id, playerKey);
  }

  /** Reads BanList.txt entries (id + optional name from `id,name,0` lines). */
  async listBannedPlayers(id: string): Promise<BanListEntry[]> {
    return this.rcon.listBannedPlayers(id);
  }

  /** Absolute path to the primary BanList.txt (created empty if missing). */
  async resolveBanListFilePath(id: string): Promise<string> {
    return this.rcon.resolveBanListFilePath(id);
  }

  /**
   * Unbans via RCON `Unban <id>` when the server is active, then scrubs
   * BanList.txt on disk (ASA may keep an in-memory ban if RCON fails).
   */
  async unbanPlayer(id: string, playerKey: string): Promise<{
    banned: BanListEntry[];
    warning: string | null;
  }> {
    return this.rcon.unbanPlayer(id, playerKey);
  }

  /** Returns RCON connection status for a server. */
  getRconStatus(id: string) {
    return this.rcon.getStatus(id);
  }

  /** Returns RCON connection status for all servers. */
  getAllRconStatus() {
    return this.rcon.getAllStatus();
  }

  /** Replaces the current RCON session and reconnects using the active runtime port. */
  async retryRconConnection(id: string): Promise<void> {
    return this.rcon.retryConnection(id);
  }

  /** Retained as a compatibility seam for focused RCON tests. */
  private set rconSessions(sessions: RconSessionManager) {
    this.rcon.replaceSessionManager(sessions);
  }

  private autoConnectRcon(profile: ServerProfile): Promise<void> {
    return this.rcon.autoConnect(
      profile,
      (host, port, timeoutMs) => this.waitForPortReady(host, port, timeoutMs),
    );
  }

  private waitForPortReady(
    host: string,
    port: number,
    timeoutMs?: number,
  ): Promise<boolean> {
    return this.rcon.waitForPortReady(host, port, timeoutMs);
  }

  private mustGet(id: string): ServerProfile {
    const profile = this.repo.get(id);
    if (profile === null) {
      throw new Error("Server does not exist");
    }
    return profile;
  }

  private assertValidInput(
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

  /** Soft map-mod warnings on save; hard-block dedicated start (#194). */
  private assertMapIdentityReadyForStart(input: ServerProfile): void {
    const blockers = mapIdentityStartBlockers(input);
    if (blockers.length > 0) {
      throw new Error(
        blockers.map((i) => `${i.field}: ${i.message}`).join(" | "),
      );
    }
  }

  private assertNoPortConflicts(
    input: ServerProfileInput,
    excludeId?: string,
  ): void {
    const others = this.repo
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

  private assertUniqueName(name: string, excludeId?: string): void {
    const normalized = name.trim().toLowerCase();
    const clash = this.repo
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

  private assertUniqueInstallDir(installDir: string, excludeId?: string): void {
    const target = installDirKey(normalizeWindowsPath(installDir));
    const clash = this.repo
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

  private assertInstallDirNotNestedWithFleet(
    installDir: string,
    excludeId?: string,
  ): void {
    const conflict = findInstallDirConflict(
      installDir,
      this.repo.list().map((profile) => ({
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
  private async assertCreateInstallTarget(installDir: string): Promise<void> {
    this.assertUniqueInstallDir(installDir);
    this.assertInstallDirNotNestedWithFleet(installDir);
    await assertNotInsideAsaInstall(installDir);
    await assertInstallDirVacantForCreate(installDir);
  }

}
