import type {
  ClusterComplianceReport,
  ServerInstallationInfo,
  ServerProfile,
  ServerProfileInput,
  ServerRuntimeInfo,
  StartServerOptions,
} from "@shared/types";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, parse as parsePath, resolve } from "node:path";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import { resolveServerInstallDir } from "@shared/server-install-path";
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
export class InstanceService {
  constructor(
    private readonly repo: ServerRepository,
    private readonly processes: ProcessManager,
  ) {}

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

  async stop(id: string): Promise<void> {
    const profile = this.mustGet(id);
    await this.processes.stop(profile);
    this.repo.addEvent(
      id,
      "server_stopped",
      "info",
      `Server "${profile.name}" stopped (with prior save)`,
    );
  }

  kill(id: string): void {
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

  async installationInfo(forceOfficialCheck = false): Promise<{
    officialVersion: string | null;
    officialSteamBuild: string | null;
    servers: ServerInstallationInfo[];
  }> {
    const [officialVersion, officialSteamBuild] = await Promise.all([
      readOfficialArkVersionCached(forceOfficialCheck),
      readOfficialArkBuildCached(forceOfficialCheck),
    ]);
    return {
      officialVersion,
      officialSteamBuild,
      servers: this.repo
        .list()
        .map((profile) => inspectServerInstallation(profile.id, profile.installDir)),
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
