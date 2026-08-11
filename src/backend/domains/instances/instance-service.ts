import type {
  BackupKind,
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
import { PORT_MAX, PORT_MIN } from "@shared/types";
import { applyServerProfilePatch } from "@shared/server-profile";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join, resolve } from "node:path";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import {
  normalizeWindowsPath,
  resolveServerInstallDir,
  suggestCloneInstallDir,
} from "@shared/server-install-path";
import type { BackupService } from "../backups/backup-service";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import { mapIdentityStartBlockers } from "@shared/map-identity";
import { findPortConflicts, validateProfileInput } from "./validation";
import { checkClusterCompliance } from "../cluster/compliance";
import { RconSessionManager } from "../../infra/rcon/rcon-session-manager";
import type { ListedPlayer } from "../backups/list-players";
import { parseListPlayersResponse } from "../backups/list-players";
import {
  ensureBanListFile,
  isBlankOrNaUrl,
  readBanListEntries,
  readIniServerSetting,
  removeFromBanList,
  resolveBanListId,
  type BanListEntry,
} from "./ban-list";
import {
  assertSafeInstallDirForWipe,
  installDirKey,
} from "./install-dir-safety";
import {
  invalidateInstallInspectCache,
  inspectServerInstallationAsync,
  readOfficialArkBuildCached,
  readOfficialArkVersionCached,
} from "./server-installation";
import { gameUserSettingsIniPath, syncProfileSettingsToIni } from "./sync-profile-ini";
import {
  isInstallHealthDegradation,
  isInstallationReady,
} from "@shared/installation-health";
import { assertHostPortsAvailable } from "../../infra/process/host-port-probe";
import { resolveDisplayedServerVersion } from "@shared/server-version-display";

/** Max concurrent async FS classify probes during a fleet scan. */
const FLEET_INSPECT_CONCURRENCY = 3;

/** Single-server / gate paths may use heavier version fallbacks. */
const ENRICHED_INSTALL_INSPECT = {
  bypassCache: true,
  allowExecutableVersionProbe: true,
  allowLogVersionProbe: true,
} as const;

async function mapPool<T, R>(
  items: ReadonlyArray<T>,
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

const RCON_HOST = "127.0.0.1";
/** Maximum time to wait for the RCON port to start accepting connections. */
const RCON_AUTO_CONNECT_TIMEOUT_MS = 15_000;
/** Delay between RCON port probes while the server is starting. */
const RCON_AUTO_CONNECT_RETRY_DELAY_MS = 1_000;

export interface StopServerOptions {
  /** When true (default), create a stable stop backup after process exit. */
  backup?: boolean;
  /** Progress reason for UI (quit shows the blocking overlay). Default `"user"`. */
  reason?: ServerStopProgressReason;
}

/** Outcome of a graceful stop job (used by restart fail-hard policy). */
export type StopJobOutcome =
  | "stopped"
  | "already_exited"
  | "killed"
  | "absent"
  | "noop";

function backupKindLabel(kind: BackupKind): string {
  if (kind === "world") return "world save";
  if (kind === "players") return "player profiles";
  return "INI files";
}

/** True when profile ids match the cached install snapshot set (order-independent). */
function sameServerIds(
  profiles: ReadonlyArray<{ id: string }>,
  cached: ReadonlyArray<ServerInstallationInfo>,
): boolean {
  // Equal length + every profile id present ⇒ same set (no extras on either side).
  if (profiles.length !== cached.length) {
    return false;
  }
  const cachedIds = new Set(cached.map((info) => info.serverId));
  return profiles.every((profile) => cachedIds.has(profile.id));
}

function backingUpPercent(index: number, total: number): number {
  if (total <= 1) return 85;
  // After the process exits, spread archive starts across 40% → 85%.
  return Math.round(40 + (index / (total - 1)) * 45);
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
  /** Persistent RCON session manager. */
  private readonly rconSessions = new RconSessionManager();
  /**
   * E2E-only: when `YARK_E2E_RCON_MOCK=1`, report servers as running and answer
   * console commands without a live ASA dedicated (see scripts/e2e-rcon.cjs).
   */
  private readonly e2eRconMock = process.env["YARK_E2E_RCON_MOCK"] === "1";

  constructor(
    private readonly repo: ServerRepository,
    private readonly processes: ProcessManager,
    private readonly backups: BackupService,
    private readonly locks: InstanceLockManager,
  ) {
    super();
    
    // Forward RCON status changes to UI
    this.rconSessions.on("status-changed", (info) => {
      this.emit("rcon-status-changed", info);
    });

    // Persistent session only while `running`; keep the socket during
    // `stopping` for SaveWorld/DoExit but never auto-reconnect.
    this.processes.on("status", (status: ServerRuntimeInfo) => {
      if (status.status === "running") {
        this.rconSessions.setAutoReconnect(status.serverId, true);
        const profile = this.repo.get(status.serverId);
        if (profile) {
          this.autoConnectRcon(profile).catch((err) => {
            console.error(`[InstanceService] Auto-connect RCON failed for ${profile.name}:`, err);
          });
        }
      } else if (status.status === "stopping") {
        this.rconSessions.setAutoReconnect(status.serverId, false);
      } else if (status.status === "stopped" || status.status === "error") {
        this.rconSessions.disconnect(status.serverId);
      }
    });
  }

  list(): ServerProfile[] {
    return this.repo.list();
  }

  create(input: ServerProfileInput): ServerProfile {
    this.assertValidInput(input);
    this.assertUniqueName(input.name);
    this.assertNoPortConflicts(input);

    const installDir = resolveServerInstallDir(input.installDir, input.name);
    const normalized: ServerProfileInput = { ...input, installDir };
    this.assertValidInput(normalized);
    this.assertUniqueInstallDir(installDir);

    // create() sync; ensureDefaultIniFiles async — mkdir root here synchronously via ensure
    const profile = this.repo.create(normalized);
    void this.ensureDefaultIniFiles(profile.installDir);
    this.repo.addEvent(
      profile.id,
      "server_created",
      "info",
      `Server "${profile.name}" created at ${profile.installDir} (map ${profile.map})`,
    );
    return profile;
  }

  /**
   * Adopt an existing ASA dedicated root as a YARK profile (#254).
   * Uses the absolute `installDir` as-is (does not nest via resolveServerInstallDir).
   * No SteamCMD sync. Requires install health `ready` (no incomplete/suspicious).
   * All discovered mods are forced into `disabledMods` until the operator enables them.
   */
  async importExisting(input: ServerProfileInput): Promise<ServerProfile> {
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

    const installation = await inspectServerInstallationAsync(
      `import:${normalized.name}`,
      installDir,
      { bypassCache: true },
    );
    if (installation.health !== "ready") {
      throw new Error(
        installation.guidance ||
          `Folder is not a ready ASA dedicated root (health: ${installation.health}). Pick the folder that contains ShooterGame.`,
      );
    }

    const profile = this.repo.create(normalized);
    await this.ensureDefaultIniFiles(profile.installDir);
    try {
      await syncProfileSettingsToIni(profile);
    } catch {
      // Existing GUS may be locked; start() syncs again before launch.
    }
    this.repo.addEvent(
      profile.id,
      "server_created",
      "info",
      `Server "${profile.name}" imported from existing install at ${profile.installDir} (map ${profile.map})`,
    );
    return profile;
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

  /** Exposed for Move installation uniqueness checks. */
  assertInstallDirAvailable(installDir: string, excludeId?: string): void {
    this.assertUniqueInstallDir(installDir, excludeId);
  }

  async delete(id: string): Promise<void> {
    if (this.processes.isActive(id)) {
      throw new Error("Cannot delete a server while it is running");
    }
    const profile = this.repo.get(id);
    if (profile === null) return;

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
  clone(id: string): ServerProfile {
    const source = this.repo.get(id);
    if (source === null) {
      throw new Error("Server to clone does not exist");
    }
    const existing = this.repo.list();
    const names = new Set(existing.map((p) => p.name.trim().toLowerCase()));
    const installDirs = new Set(
      existing.map((profile) => installDirKey(profile.installDir)),
    );
    let copyNumber = 1;
    let name: string;
    let installDir: string;
    for (;;) {
      name =
        copyNumber === 1
          ? `${source.name} (copy)`
          : `${source.name} (copy ${copyNumber})`;
      installDir = suggestCloneInstallDir(source.installDir, name);
      if (
        !names.has(name.trim().toLowerCase()) &&
        !installDirs.has(installDirKey(installDir)) &&
        !existsSync(installDir)
      ) {
        break;
      }
      copyNumber++;
    }

    let offset = 10;
    let input: ServerProfileInput;
    for (;;) {
      input = {
        name,
        map: source.map,
        mapModId: source.mapModId ?? null,
        installDir,
        sessionName: `${source.sessionName} (copy)`,
        gamePort: source.gamePort + offset,
        queryPort: source.queryPort + offset,
        rconPort: source.rconPort + offset,
        serverPassword: source.serverPassword,
        adminPassword: source.adminPassword,
        clusterId: source.clusterId,
        clusterDir: source.clusterDir,
        extraArgs: [...source.extraArgs],
        structuredLaunchArgs: { ...(source.structuredLaunchArgs ?? {}) },
        mods: [...source.mods],
        disabledMods: [...(source.disabledMods ?? [])],
        modMetadataCache: { ...(source.modMetadataCache ?? {}) },
        autoStart: source.autoStart,
      };
      if (findPortConflicts(existing, { ...input, id: undefined }).length === 0) {
        break;
      }
      offset += 10;
      if (offset > 1000) {
        throw new Error("No free ports found for the clone");
      }
    }
    this.assertValidInput(input);
    this.assertUniqueInstallDir(input.installDir);
    const profile = this.repo.create(input, source.enabled);
    void this.ensureDefaultIniFiles(profile.installDir);
    this.repo.addEvent(
      profile.id,
      "server_created",
      "info",
      `Server "${profile.name}" created at ${profile.installDir} (map ${profile.map})`,
    );
    return profile;
  }

  /** Clones a profile with custom parameters from the dialog. */
  cloneWithParams(
    id: string,
    params: {
      name: string;
      sessionName: string;
      gamePort: number;
      queryPort: number;
      rconPort: number;
      installDir: string;
    },
  ): ServerProfile {
    const source = this.repo.get(id);
    if (source === null) {
      throw new Error("Server to clone does not exist");
    }

    const installDir = normalizeWindowsPath(params.installDir);
    const input: ServerProfileInput = {
      name: params.name,
      map: source.map,
      mapModId: source.mapModId ?? null,
      installDir,
      sessionName: params.sessionName,
      gamePort: params.gamePort,
      queryPort: params.queryPort,
      rconPort: params.rconPort,
      serverPassword: source.serverPassword,
      adminPassword: source.adminPassword,
      clusterId: source.clusterId,
      clusterDir: source.clusterDir,
      extraArgs: [...source.extraArgs],
      structuredLaunchArgs: { ...(source.structuredLaunchArgs ?? {}) },
      mods: [...source.mods],
      disabledMods: [...(source.disabledMods ?? [])],
      modMetadataCache: { ...(source.modMetadataCache ?? {}) },
      autoStart: source.autoStart,
    };

    this.assertValidInput(input);
    this.assertUniqueName(input.name);
    this.assertUniqueInstallDir(input.installDir);
    this.assertNoPortConflicts(input);

    const profile = this.repo.create(input, source.enabled);
    void this.ensureDefaultIniFiles(profile.installDir);
    this.repo.addEvent(
      profile.id,
      "server_created",
      "info",
      `Server "${profile.name}" created at ${profile.installDir} (map ${profile.map})`,
    );
    return profile;
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
    this.assertValidSessionPorts(session);
    return {
      ...profile,
      gamePort: session.gamePort,
      queryPort: session.queryPort,
      rconPort: session.rconPort,
    };
  }

  private assertValidSessionPorts(ports: {
    gamePort: number;
    queryPort: number;
    rconPort: number;
  }): void {
    const entries: Array<[string, number]> = [
      ["gamePort", ports.gamePort],
      ["queryPort", ports.queryPort],
      ["rconPort", ports.rconPort],
    ];
    for (const [field, value] of entries) {
      if (
        !Number.isInteger(value) ||
        value < PORT_MIN ||
        value > PORT_MAX
      ) {
        throw new Error(
          `${field} must be an integer between ${PORT_MIN} and ${PORT_MAX}`,
        );
      }
    }
    if (
      ports.gamePort === ports.queryPort ||
      ports.gamePort === ports.rconPort ||
      ports.queryPort === ports.rconPort
    ) {
      throw new Error("Game, query, and RCON session ports must be distinct");
    }
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
    return this.isStopInProgress() || this.locks.hasPurpose("restart");
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
    await this.waitForStopJobs();
    await this.locks.waitUntilNoPurpose("restart");
    await this.stopAllForAppQuit();
  }

  private async withCriticalJob<T>(
    id: string,
    work: () => Promise<T>,
  ): Promise<T> {
    if (this.criticalJobs.has(id)) {
      throw new Error("Another server operation is already in progress");
    }
    let job!: Promise<T>;
    job = (async () => {
      try {
        return await work();
      } finally {
        if (this.criticalJobs.get(id) === job) {
          this.criticalJobs.delete(id);
        }
      }
    })();
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
    let job: Promise<StopJobOutcome>;
    job = this.runStop(id, wantBackup, reason).finally(() => {
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
    ): ServerStopProgress => ({
      serverId: id,
      reason,
      ...partial,
    });

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
        exitedExternally
          ? didBackup
            ? `Server "${profile.name}" exited externally; stop backup completed`
            : `Server "${profile.name}" exited externally during safe stop`
          : didBackup
            ? `Server "${profile.name}" stopped (save + pre-stop backup)`
            : `Server "${profile.name}" stopped (with prior save)`,
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
    if (!this.e2eRconMock) {
      return this.processes.listStatuses(ids);
    }
    const now = new Date().toISOString();
    return ids.map((serverId) => ({
      serverId,
      status: "running" as const,
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
    const serverSetChanged = !sameServerIds(profiles, this.lastInstallServers);

    const shouldInspectServers =
      forceOfficialCheck ||
      serversMode === true ||
      (serversMode === "when-official-changed" &&
        (officialChanged || serverSetChanged));

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
      const key = this.fleetInspectKey(profiles, options.bypassCache);
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
      const scanKey = this.fleetInspectKey(profilesToScan, options.bypassCache);
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

  private fleetInspectKey(
    profiles: ReadonlyArray<ServerProfile>,
    bypassCache: boolean,
  ): string {
    const ids = profiles
      .map((profile) => `${profile.id}\0${installDirKey(profile.installDir)}`)
      .sort()
      .join("\n");
    return `${bypassCache ? "1" : "0"}\n${ids}`;
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
    return this.execRcon(id, command, { recordEvent: true });
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
    if (this.e2eRconMock) {
      return this.execRconE2eMock(id, command, options);
    }

    const profile = this.processes.applyRuntimePorts(this.mustGet(id));
    const runtimeStatus = this.processes.getStatus(id).status;
    // Allow during `stopping` for SaveWorld/DoExit; never during bare `starting`
    // (readiness still uses quiet one-shot probes until `running`).
    if (runtimeStatus !== "running" && runtimeStatus !== "stopping") {
      throw new Error(
        runtimeStatus === "starting"
          ? "Server is still starting; RCON is not ready yet"
          : "Server is not running",
      );
    }

    const status = this.rconSessions.getStatus(id);
    if (status.status !== "connected") {
      console.log(`[RCON] Connecting session for ${profile.name}...`);
      await this.rconSessions.connect(
        id,
        RCON_HOST,
        profile.rconPort,
        profile.adminPassword,
      );
      // Stop / SaveWorld / DoExit may reconnect once, but must not schedule retries.
      if (runtimeStatus !== "running") {
        this.rconSessions.setAutoReconnect(id, false);
      }
    }

    console.log(
      `[RCON] Sending to ${profile.name} (${RCON_HOST}:${profile.rconPort}): "${command}"`,
    );

    const response = await this.rconSessions.send(id, command);
    console.log(`[RCON] Response: "${response}"`);

    if (options?.recordEvent !== false) {
      this.repo.addEvent(
        id,
        "rcon_command",
        "info",
        `RCON on "${profile.name}": ${command}`,
      );
    }
    return response;
  }

  /** Deterministic RCON replies for UI e2e without a live dedicated. */
  private async execRconE2eMock(
    id: string,
    command: string,
    options?: { recordEvent?: boolean },
  ): Promise<string> {
    const profile = this.mustGet(id);
    const trimmed = command.trim();
    if (options?.recordEvent !== false) {
      this.repo.addEvent(
        id,
        "rcon_command",
        "info",
        `RCON on "${profile.name}": ${trimmed}`,
      );
    }
    if (trimmed === "E2E_FAIL") {
      throw new Error("E2E mock failure");
    }
    if (trimmed === "E2E_SLOW") {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return "E2E:slow";
    }
    if (
      trimmed === "E2E_EMPTY" ||
      trimmed === "SaveWorld" ||
      trimmed === "DestroyWildDinos"
    ) {
      return "";
    }
    if (trimmed === "ListPlayers") {
      return "No Players Connected";
    }
    return `E2E:${trimmed}`;
  }

  /** Lists online players via the persistent session (silent; no history event). */
  async listPlayers(id: string): Promise<ListedPlayer[]> {
    const response = await this.execRcon(id, "ListPlayers", { recordEvent: false });
    return parseListPlayersResponse(response);
  }

  async kickPlayer(id: string, playerKey: string): Promise<string> {
    const key = playerKey.trim();
    if (key.length === 0) {
      throw new Error("Player id is required");
    }
    return this.execRcon(id, `KickPlayer ${key}`, { recordEvent: true });
  }

  async banPlayer(id: string, playerKey: string): Promise<string> {
    const key = playerKey.trim();
    if (key.length === 0) {
      throw new Error("Player id is required");
    }
    return this.execRcon(id, `BanPlayer ${key}`, { recordEvent: true });
  }

  /** Reads BanList.txt entries (id + optional name from `id,name,0` lines). */
  async listBannedPlayers(id: string): Promise<BanListEntry[]> {
    const profile = this.mustGet(id);
    return readBanListEntries(profile.installDir);
  }

  /** Absolute path to the primary BanList.txt (created empty if missing). */
  async resolveBanListFilePath(id: string): Promise<string> {
    const profile = this.mustGet(id);
    return ensureBanListFile(profile.installDir);
  }

  /**
   * Unbans via RCON `Unban <id>` when the server is active, then scrubs
   * BanList.txt on disk (ASA may keep an in-memory ban if RCON fails).
   */
  async unbanPlayer(id: string, playerKey: string): Promise<{
    banned: BanListEntry[];
    warning: string | null;
  }> {
    const key = playerKey.trim();
    if (key.length === 0) {
      throw new Error("Player id is required");
    }
    const profile = this.mustGet(id);
    const status = this.processes.getStatus(id).status;
    const matchId = await resolveBanListId(profile.installDir, key);
    let warning: string | null = null;

    if (status === "running" || status === "stopping") {
      try {
        // ASA expects `Unban <id>` (verified on dedicated; not UnbanPlayer — see #17).
        await this.execRcon(id, `Unban ${matchId}`, { recordEvent: true });
      } catch (error) {
        await removeFromBanList(profile.installDir, key);
        const message =
          error instanceof Error ? error.message : String(error);
        warning = `Removed from BanList.txt, but RCON Unban failed (${message}). Restart the server if you still cannot join.`;
        return {
          banned: await readBanListEntries(profile.installDir),
          warning,
        };
      }
    }

    await removeFromBanList(profile.installDir, key);
    const banned = await readBanListEntries(profile.installDir);

    const gusPath = gameUserSettingsIniPath(profile.installDir);
    if (existsSync(gusPath)) {
      const text = await readFile(gusPath, "utf8");
      const banListUrl = readIniServerSetting(text, "BanListURL");
      if (!isBlankOrNaUrl(banListUrl)) {
        warning = `BanListURL is set (${banListUrl?.trim()}). If that remote list still includes this ID, joins stay blocked until you remove it there.`;
      }
    }

    return { banned, warning };
  }

  /** Returns RCON connection status for a server. */
  getRconStatus(id: string) {
    if (this.e2eRconMock) {
      return { serverId: id, status: "connected" as const, lastError: null };
    }
    return this.rconSessions.getStatus(id);
  }

  /** Returns RCON connection status for all servers. */
  getAllRconStatus() {
    if (this.e2eRconMock) {
      return this.repo.list().map((profile) => ({
        serverId: profile.id,
        status: "connected" as const,
        lastError: null,
      }));
    }
    return this.rconSessions.getAllStatus();
  }

  /** Replaces the current RCON session and reconnects using the active runtime port. */
  async retryRconConnection(id: string): Promise<void> {
    if (this.e2eRconMock) {
      return;
    }
    const profile = this.processes.applyRuntimePorts(this.mustGet(id));
    // Match auto-connect: only after readiness (`running`), not during `starting`.
    if (this.processes.getStatus(id).status !== "running") {
      throw new Error("Server is not running");
    }

    this.rconSessions.disconnect(id);
    await this.rconSessions.connect(
      id,
      RCON_HOST,
      profile.rconPort,
      profile.adminPassword,
    );
  }

  /** Auto-connects RCON once the server is actually listening on the RCON port. */
  private async autoConnectRcon(profile: ServerProfile): Promise<void> {
    const runtimeProfile = this.processes.applyRuntimePorts(profile);
    if (this.processes.getStatus(profile.id).status !== "running") {
      return;
    }

    console.log(`[InstanceService] Waiting for RCON port ${runtimeProfile.rconPort} for ${profile.name}...`);
    const isReady = await this.waitForPortReady(
      RCON_HOST,
      runtimeProfile.rconPort,
      RCON_AUTO_CONNECT_TIMEOUT_MS,
    );
    if (!isReady) {
      console.log(
        `[InstanceService] RCON port ${runtimeProfile.rconPort} was not ready for ${profile.name}; skipping connection`,
      );
      return;
    }

    // Status may have left `running` while we waited for the port.
    if (this.processes.getStatus(profile.id).status !== "running") {
      console.log(
        `[InstanceService] Skipping RCON auto-connect for ${profile.name}; server is no longer running`,
      );
      return;
    }

    console.log(`[InstanceService] Auto-connecting RCON for ${profile.name}...`);

    try {
      await this.rconSessions.connect(
        profile.id,
        RCON_HOST,
        runtimeProfile.rconPort,
        runtimeProfile.adminPassword,
      );
      // A stop may have started during the async connect.
      if (this.processes.getStatus(profile.id).status !== "running") {
        this.rconSessions.setAutoReconnect(profile.id, false);
        if (this.processes.getStatus(profile.id).status !== "stopping") {
          this.rconSessions.disconnect(profile.id);
        }
        console.log(
          `[InstanceService] Dropped late RCON auto-connect for ${profile.name}; server left running`,
        );
        return;
      }
      console.log(`[InstanceService] RCON auto-connected for ${profile.name}`);
    } catch (err) {
      console.error(
        `[InstanceService] RCON auto-connect failed for ${profile.name}:`,
        err,
      );
      // Don't throw - auto-connect is best-effort
    }
  }

  private async waitForPortReady(host: string, port: number, timeoutMs = 15_000): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const isOpen = await this.probePort(host, port);
      if (isOpen) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, RCON_AUTO_CONNECT_RETRY_DELAY_MS));
    }
    return false;
  }

  private probePort(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection({ host, port });
      socket.setTimeout(500);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", () => {
        resolve(false);
      });
    });
  }

  private mustGet(id: string): ServerProfile {
    const profile = this.repo.get(id);
    if (profile === null) {
      throw new Error("Server does not exist");
    }
    return profile;
  }

  private assertValidInput(input: ServerProfileInput): void {
    const issues = validateProfileInput(input);
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
}
