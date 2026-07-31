import type {
  BackupKind,
  ClusterComplianceReport,
  InstallationServersMode,
  OfficialNetworkStatus,
  ServerInstallationInfo,
  ServerProfile,
  ServerProfileInput,
  ServerRuntimeInfo,
  ServerStopProgress,
  StartServerOptions,
} from "@shared/types";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, parse as parsePath, resolve } from "node:path";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import { resolveServerInstallDir } from "@shared/server-install-path";
import type { BackupService } from "../backups/backup-service";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import { findPortConflicts, validateProfileInput } from "./validation";
import { checkClusterCompliance } from "../cluster/compliance";
import { rconExec } from "../../infra/rcon/rcon-client";
import {
  inspectServerInstallation,
  readOfficialArkBuildCached,
  readOfficialArkVersionCached,
} from "./server-installation";
import { syncProfileSettingsToIni } from "./sync-profile-ini";

const RCON_HOST = "127.0.0.1";

export interface StopServerOptions {
  /** When true (default), create a stable stop backup after process exit. */
  backup?: boolean;
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

function assertSafeInstallDirForWipe(installDir: string): string {
  const resolved = resolve(installDir);
  const root = parsePath(resolved).root;
  if (resolved.length === 0 || resolved === root || /^[a-zA-Z]:\\?$/.test(resolved)) {
    throw new Error(
      `Install path is not safe to delete from disk: "${installDir}"`,
    );
  }
  // Avoid deleting roots like C:\Users or C:\Windows by accident.
  const normalized = resolved.replace(/[/\\]+$/, "").toLowerCase();
  const forbidden = ["c:\\windows", "c:\\users", "c:\\program files", "c:\\program files (x86)"];
  if (forbidden.some((item) => normalized === item)) {
    throw new Error(
      `Install path is too generic to delete from disk: "${resolved}"`,
    );
  }
  return resolved;
}
/**
 * Instance orchestration service: validated CRUD + lifecycle.
 */
export class InstanceService extends EventEmitter {
  private readonly stopJobs = new Map<string, Promise<StopJobOutcome>>();
  /** Covers restart after stopJobs clears (pre_restart ZIP only; not start). */
  private readonly criticalJobs = new Map<string, Promise<unknown>>();
  private lastOfficialVersion: string | null | undefined = undefined;
  private lastOfficialSteamBuild: string | null | undefined = undefined;
  private lastInstallServers: ServerInstallationInfo[] = [];

  constructor(
    private readonly repo: ServerRepository,
    private readonly processes: ProcessManager,
    private readonly backups: BackupService,
    private readonly locks: InstanceLockManager,
  ) {
    super();
  }

  list(): ServerProfile[] {
    return this.repo.list();
  }

  create(input: ServerProfileInput): ServerProfile {
    this.assertValidInput(input);
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
    this.assertNoPortConflicts(input, id);
    const updated = this.repo.update(id, input);
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
    const names = new Set(existing.map((p) => p.name));
    let name = `${source.name} (copy)`;
    let suffix = 2;
    while (names.has(name)) {
      name = `${source.name} (copy ${suffix})`;
      suffix++;
    }

    let offset = 10;
    let input: ServerProfileInput;
    for (;;) {
      input = {
        name,
        map: source.map,
        installDir: source.installDir,
        sessionName: `${source.sessionName} (copy)`,
        gamePort: source.gamePort + offset,
        queryPort: source.queryPort + offset,
        rconPort: source.rconPort + offset,
        serverPassword: source.serverPassword,
        adminPassword: source.adminPassword,
        clusterId: source.clusterId,
        clusterDir: source.clusterDir,
        extraArgs: [...source.extraArgs],
        mods: [...source.mods],
        disabledMods: [...(source.disabledMods ?? [])],
        modMetadataCache: { ...(source.modMetadataCache ?? {}) },
      };
      if (findPortConflicts(existing, { ...input, id: undefined }).length === 0) {
        break;
      }
      offset += 10;
      if (offset > 1000) {
        throw new Error("No free ports found for the clone");
      }
    }
    return this.create(input);
  }

  async start(id: string, options?: StartServerOptions): Promise<void> {
    if (this.isStopInProgress(id)) {
      throw new Error("Server stop and backup are still in progress");
    }
    if (this.locks.isLocked(id)) {
      throw new Error("Another server operation is already in progress");
    }
    await this.startInternal(id, options);
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
    const running = this.repo
      .list()
      .filter((p) => p.id !== id && this.processes.isActive(p.id));
    const conflicts = findPortConflicts(running, { ...profile });
    if (conflicts.length > 0) {
      const c = conflicts[0]!;
      throw new Error(
        `Port conflict ${c.kind} ${c.port} with active server "${c.serverA === profile.name ? c.serverB : c.serverA}"`,
      );
    }
    await syncProfileSettingsToIni(profile);
    this.processes.start(profile, options);
    this.repo.addEvent(
      id,
      "server_started",
      "info",
      `Server "${profile.name}" starting (waiting for readiness)`,
    );
  }

  stop(id: string, options?: StopServerOptions): Promise<void> {
    if (this.criticalJobs.has(id)) {
      return Promise.reject(
        new Error("Cannot stop while a restart is in progress"),
      );
    }
    const existing = this.stopJobs.get(id);
    if (existing !== undefined) return existing.then(() => undefined);

    if (options?.backup === false) {
      return this.enqueueStop(id, false).then(() => undefined);
    }
    return this.locks
      .withLock(id, "stop-and-backup", () => this.enqueueStop(id, true))
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
   * App quit helper: wait for stop/pre_restart work and any restart lock
   * (covers sync → spawn), then stop leftover active processes.
   */
  async settleForAppQuit(): Promise<void> {
    await this.waitForStopJobs();
    await this.locks.waitUntilNoPurpose("restart");
    const profiles = this.repo.list();
    if (profiles.some((profile) => this.processes.isActive(profile.id))) {
      await this.processes.stopAll(profiles);
    }
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
  ): Promise<StopJobOutcome> {
    const existing = this.stopJobs.get(id);
    if (existing !== undefined) return existing;
    let job: Promise<StopJobOutcome>;
    job = this.runStop(id, wantBackup).finally(() => {
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
  ): Promise<StopJobOutcome> {
    const profile = this.mustGet(id);
    let didBackup = false;
    let exitedExternally = false;

    if (!this.processes.isActive(id)) {
      return "noop";
    }

    try {
      this.emitStopProgress({
        serverId: id,
        active: true,
        phase: "saving",
        label: "Saving world…",
        percent: 10,
      });

      const preparation = await this.processes.beginGracefulStop(profile);
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

      this.emitStopProgress({
        serverId: id,
        active: true,
        phase: "stopping",
        label: "Stopping server before backup…",
        percent: 25,
      });
      const finishResult = await this.processes.finishGracefulStop(
        profile,
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
              this.emitStopProgress({
                serverId: id,
                active: true,
                phase: "backing_up",
                label: `Backing up ${backupKindLabel(kind)}…`,
                percent: backingUpPercent(index, total),
              });
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
          this.emitStopProgress({
            serverId: id,
            active: true,
            phase: "backing_up",
            label: "Backup failed — server remains stopped",
            percent: 70,
          });
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
      this.emitStopProgress({
        serverId: id,
        active: false,
        phase: null,
        label: "",
        percent: null,
      });
    }
  }

  private emitStopProgress(payload: ServerStopProgress): void {
    this.emit("stop-progress", payload);
  }

  kill(id: string): void {
    if (this.isStopInProgress(id)) {
      throw new Error(
        "Force close is disabled while stop or restart backup is in progress",
      );
    }
    const profile = this.mustGet(id);
    this.processes.kill(id);
    this.repo.addEvent(
      id,
      "server_stopped",
      "warning",
      `Server "${profile.name}" force-killed (without save)`,
    );
  }

  statuses(): ServerRuntimeInfo[] {
    return this.processes.listStatuses(this.repo.list().map((p) => p.id));
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
      ? profiles.map((profile) =>
          inspectServerInstallation(profile.id, profile.installDir, {
            bypassCache: forceOfficialCheck,
          }),
        )
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

  checkClusters(): ClusterComplianceReport[] {
    return checkClusterCompliance(this.repo.list());
  }

  async sendRcon(id: string, command: string): Promise<string> {
    const profile = this.mustGet(id);
    if (!this.processes.isActive(id)) {
      throw new Error("Server is not running");
    }
    const response = await rconExec(
      RCON_HOST,
      profile.rconPort,
      profile.adminPassword,
      command,
    );
    this.repo.addEvent(
      id,
      "rcon_command",
      "info",
      `RCON on "${profile.name}": ${command}`,
    );
    return response;
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

  private assertUniqueInstallDir(installDir: string, excludeId?: string): void {
    const target = resolve(installDir);
    const clash = this.repo
      .list()
      .find((profile) => profile.id !== excludeId && resolve(profile.installDir) === target);
    if (clash !== undefined) {
      throw new Error(
        `A server already uses folder "${installDir}" ("${clash.name}")`,
      );
    }
  }
}
