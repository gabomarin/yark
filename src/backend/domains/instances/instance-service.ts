import type {
  ClusterComplianceReport,
  InstallationServersMode,
  OfficialNetworkStatus,
  ServerInstallationInfo,
  ServerProfile,
  ServerProfileInput,
  ServerProfilePatch,
  ServerRuntimeInfo,
  StartServerOptions,
} from "@shared/types";
import {
  EMPTY_WIPE_STALE_MESSAGE,
} from "@shared/types";
import { applyServerProfilePatch } from "@shared/server-profile";
import { collectKnownSecrets } from "@shared/credential-redaction";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
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
  assertSafeInstallDirForWipe,
  installDirKey,
} from "./install-dir-safety";
import { assertNotInsideAsaInstall } from "./import-existing-install";
import {
  invalidateInstallInspectCache,
  inspectServerInstallationAsync,
} from "./server-installation";
import { syncProfileSettingsToIni } from "./sync-profile-ini";
import {
  isInstallationReady,
} from "@shared/installation-health";
import { assertHostPortsAvailable } from "../../infra/process/host-port-probe";
import { planUnexpectedServerCrashEvent } from "./instance-crash";
import {
  applySessionPortsToProfile,
  validateSessionPorts,
} from "./instance-profile";
import { InstanceCreate } from "./instance-create";
import { InstanceRcon } from "./instance-rcon";
import { InstanceClone, type CloneParams } from "./instance-clone";
import {
  InstanceStop,
  type StopServerOptions,
} from "./instance-stop";
import {
  ENRICHED_INSTALL_INSPECT,
  InstanceFleetInstall,
} from "./instance-fleet-install";
import {
  defaultResolveOpenNativeConsole,
  withOpenNativeConsolePref,
  type InstanceServiceOptions,
} from "./instance-start-options";

export type { StopServerOptions } from "./instance-stop";
export type { InstanceServiceOptions } from "./instance-start-options";

/**
 * Instance orchestration service: validated CRUD + lifecycle.
 */
export class InstanceService extends EventEmitter {
  /** Serializes profile row writes so Launch/Mods patches cannot clobber (#209). */
  private readonly profileWriteChains = new Map<string, Promise<unknown>>();
  /**
   * Serializes fleet-wide profile creation (create / import / clone) so uniqueness
   * checks for name, ports, and installDir cannot race across concurrent IPC (#254).
   */
  private fleetCreateChain: Promise<unknown> = Promise.resolve();
  private readonly fleetInstall: InstanceFleetInstall;
  private readonly creates: InstanceCreate;
  private readonly rcon: InstanceRcon;
  private readonly clones: InstanceClone;
  private readonly stops: InstanceStop;
  private readonly resolveOpenNativeConsole: () => boolean;

  constructor(
    private readonly repo: ServerRepository,
    private readonly processes: ProcessManager,
    private readonly backups: BackupService,
    private readonly locks: InstanceLockManager,
    options?: InstanceServiceOptions,
  ) {
    super();
    this.resolveOpenNativeConsole =
      options?.resolveOpenNativeConsole ?? defaultResolveOpenNativeConsole;
    this.fleetInstall = new InstanceFleetInstall({ repo });
    this.creates = new InstanceCreate({
      repo,
      withFleetCreateLock: (work) => this.withFleetCreateLock(work),
      ensureDefaultIniFiles: (installDir) => this.ensureDefaultIniFiles(installDir),
    });
    this.rcon = new InstanceRcon(repo, processes, (info) => {
      this.emit("rcon-status-changed", info);
    });
    this.stops = new InstanceStop({
      repo,
      processes,
      backups,
      locks,
      emitProgress: (payload) => this.emit("stop-progress", payload),
    });
    this.clones = new InstanceClone({
      repo,
      processes,
      backups,
      locks,
      withFleetCreateLock: (work) => this.withFleetCreateLock(work),
      assertValidInput: (input) => this.creates.assertValidInput(input),
      assertCreateInstallTarget: (installDir) =>
        this.creates.assertCreateInstallTarget(installDir),
      assertNoPortConflicts: (input) => this.creates.assertNoPortConflicts(input),
      assertUniqueName: (name) => this.creates.assertUniqueName(name),
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
    return this.creates.create(input);
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
    return this.creates.importExisting(input, options);
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
    this.creates.assertValidInput(input);
    this.creates.assertUniqueName(input.name, id);
    this.creates.assertNoPortConflicts(input, id);
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
    this.creates.assertUniqueInstallDir(installDir, id);
    this.creates.assertInstallDirNotNestedWithFleet(installDir, id);
    const updated = this.repo.updateInstallDir(id, installDir);
    if (updated === null) {
      throw new Error("Server does not exist");
    }
    this.fleetInstall.clearServer(id);
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
    this.creates.assertUniqueInstallDir(installDir, excludeId);
    this.creates.assertInstallDirNotNestedWithFleet(installDir, excludeId);
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
      await this.stops.withCriticalJob(id, async () => {
        const outcome = await this.stops.enqueue(id, false);
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
    this.fleetInstall.recordInstallHealth(installation);
    if (!isInstallationReady(installation)) {
      throw new Error(
        `Server files are not ready (${installation.health}): ${installation.guidance}`,
      );
    }
    const effective = this.effectiveStartProfile(profile, options);
    this.creates.assertValidInput(effective);
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
    const startOptions = withOpenNativeConsolePref(
      options,
      this.resolveOpenNativeConsole,
    );
    this.processes.start(effective, startOptions);
    const sessionNote =
      startOptions.sessionPorts != null
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
      this.fleetInstall.recordInstallHealth(installation);

      this.creates.assertNoPortConflicts(profile, id);
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
    return this.stops.stop(id, options);
  }

  isStopInProgress(serverId?: string): boolean {
    return this.stops.isInProgress(serverId);
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
    await this.stops.waitForJobs();
  }

  /**
   * Quit "Stop": wait for any still-starting servers, then graceful stop with
   * pre-stop backup and stop-progress UI for every active process.
   */
  async stopAllForAppQuit(): Promise<void> {
    await this.stops.stopAllForAppQuit();
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
    return this.fleetInstall.installationInfo(forceOfficialCheck, serversMode);
  }

  private recordUnexpectedProcessExit(payload: UnexpectedManagedExit): void {
    const profile = this.repo.get(payload.serverId);
    const name = profile?.name ?? payload.serverId;
    const planned = planUnexpectedServerCrashEvent({
      payload,
      serverName: name,
      knownSecrets: collectKnownSecrets(this.repo.list()),
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

  /** Soft map-mod warnings on save; hard-block dedicated start (#194). */
  private assertMapIdentityReadyForStart(input: ServerProfile): void {
    const blockers = mapIdentityStartBlockers(input);
    if (blockers.length > 0) {
      throw new Error(
        blockers.map((i) => `${i.field}: ${i.message}`).join(" | "),
      );
    }
  }

}
