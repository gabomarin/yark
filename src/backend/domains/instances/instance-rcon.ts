import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
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
import { gameUserSettingsIniPath } from "./sync-profile-ini";

const RCON_HOST = "127.0.0.1";
const RCON_AUTO_CONNECT_TIMEOUT_MS = 15_000;
const RCON_AUTO_CONNECT_RETRY_DELAY_MS = 1_000;

export class InstanceRcon {
  private sessions = new RconSessionManager();
  private readonly e2eMock = process.env["YARK_E2E_RCON_MOCK"] === "1";

  constructor(
    private readonly repo: ServerRepository,
    private readonly processes: ProcessManager,
    emitStatusChanged: (info: unknown) => void,
  ) {
    this.sessions.on("status-changed", emitStatusChanged);
    this.processes.on("status", (status: ServerRuntimeInfo) => {
      if (status.status === "running") {
        this.sessions.setAutoReconnect(status.serverId, true);
        const profile = this.repo.get(status.serverId);
        if (profile) {
          this.autoConnect(profile).catch((error) => {
            console.error(
              `[InstanceService] Auto-connect RCON failed for ${profile.name}:`,
              error,
            );
          });
        }
      } else if (status.status === "stopping") {
        this.sessions.setAutoReconnect(status.serverId, false);
      } else if (status.status === "stopped" || status.status === "error") {
        this.sessions.disconnect(status.serverId);
      }
    });
  }

  isE2eMock(): boolean {
    return this.e2eMock;
  }

  replaceSessionManager(sessions: RconSessionManager): void {
    this.sessions = sessions;
  }

  send(id: string, command: string): Promise<string> {
    return this.exec(id, command, { recordEvent: true });
  }

  async exec(
    id: string,
    command: string,
    options?: { recordEvent?: boolean },
  ): Promise<string> {
    if (this.e2eMock) {
      return this.execE2eMock(id, command, options);
    }

    const profile = this.processes.applyRuntimePorts(this.mustGet(id));
    const runtimeStatus = this.processes.getStatus(id).status;
    if (runtimeStatus !== "running" && runtimeStatus !== "stopping") {
      throw new Error(
        runtimeStatus === "starting"
          ? "Server is still starting; RCON is not ready yet"
          : "Server is not running",
      );
    }

    const status = this.sessions.getStatus(id);
    if (status.status !== "connected") {
      console.log(`[RCON] Connecting session for ${profile.name}...`);
      await this.sessions.connect(
        id,
        RCON_HOST,
        profile.rconPort,
        profile.adminPassword,
      );
      if (runtimeStatus !== "running") {
        this.sessions.setAutoReconnect(id, false);
      }
    }

    console.log(
      `[RCON] Sending to ${profile.name} (${RCON_HOST}:${profile.rconPort}): "${command}"`,
    );
    const response = await this.sessions.send(id, command);
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

  private async execE2eMock(
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
      trimmed === "E2E_EMPTY"
      || trimmed === "SaveWorld"
      || trimmed === "DestroyWildDinos"
    ) {
      return "";
    }
    if (trimmed === "ListPlayers") {
      return "No Players Connected";
    }
    return `E2E:${trimmed}`;
  }

  async listPlayers(id: string): Promise<ListedPlayer[]> {
    const response = await this.exec(id, "ListPlayers", { recordEvent: false });
    return parseListPlayersResponse(response);
  }

  kickPlayer(id: string, playerKey: string): Promise<string> {
    return this.execPlayerCommand(id, playerKey, "KickPlayer");
  }

  banPlayer(id: string, playerKey: string): Promise<string> {
    return this.execPlayerCommand(id, playerKey, "BanPlayer");
  }

  private execPlayerCommand(
    id: string,
    playerKey: string,
    command: "KickPlayer" | "BanPlayer",
  ): Promise<string> {
    const key = playerKey.trim();
    if (key.length === 0) {
      throw new Error("Player id is required");
    }
    return this.exec(id, `${command} ${key}`, { recordEvent: true });
  }

  listBannedPlayers(id: string): Promise<BanListEntry[]> {
    return readBanListEntries(this.mustGet(id).installDir);
  }

  resolveBanListFilePath(id: string): Promise<string> {
    return ensureBanListFile(this.mustGet(id).installDir);
  }

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
        await this.exec(id, `Unban ${matchId}`, { recordEvent: true });
      } catch (error) {
        await removeFromBanList(profile.installDir, key);
        const message = error instanceof Error ? error.message : String(error);
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

  getStatus(id: string) {
    if (this.e2eMock) {
      return { serverId: id, status: "connected" as const, lastError: null };
    }
    return this.sessions.getStatus(id);
  }

  getAllStatus() {
    if (this.e2eMock) {
      return this.repo.list().map((profile) => ({
        serverId: profile.id,
        status: "connected" as const,
        lastError: null,
      }));
    }
    return this.sessions.getAllStatus();
  }

  async retryConnection(id: string): Promise<void> {
    if (this.e2eMock) {
      return;
    }
    const profile = this.processes.applyRuntimePorts(this.mustGet(id));
    if (this.processes.getStatus(id).status !== "running") {
      throw new Error("Server is not running");
    }
    this.sessions.disconnect(id);
    await this.sessions.connect(
      id,
      RCON_HOST,
      profile.rconPort,
      profile.adminPassword,
    );
  }

  async autoConnect(
    profile: ServerProfile,
    waitForPortReady: (
      host: string,
      port: number,
      timeoutMs?: number,
    ) => Promise<boolean> = (host, port, timeoutMs) =>
      this.waitForPortReady(host, port, timeoutMs),
  ): Promise<void> {
    const runtimeProfile = this.processes.applyRuntimePorts(profile);
    if (this.processes.getStatus(profile.id).status !== "running") {
      return;
    }

    console.log(
      `[InstanceService] Waiting for RCON port ${runtimeProfile.rconPort} for ${profile.name}...`,
    );
    const isReady = await waitForPortReady(
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
    if (this.processes.getStatus(profile.id).status !== "running") {
      console.log(
        `[InstanceService] Skipping RCON auto-connect for ${profile.name}; server is no longer running`,
      );
      return;
    }

    console.log(`[InstanceService] Auto-connecting RCON for ${profile.name}...`);
    try {
      await this.sessions.connect(
        profile.id,
        RCON_HOST,
        runtimeProfile.rconPort,
        runtimeProfile.adminPassword,
      );
      if (this.processes.getStatus(profile.id).status !== "running") {
        this.sessions.setAutoReconnect(profile.id, false);
        if (this.processes.getStatus(profile.id).status !== "stopping") {
          this.sessions.disconnect(profile.id);
        }
        console.log(
          `[InstanceService] Dropped late RCON auto-connect for ${profile.name}; server left running`,
        );
        return;
      }
      console.log(`[InstanceService] RCON auto-connected for ${profile.name}`);
    } catch (error) {
      console.error(
        `[InstanceService] RCON auto-connect failed for ${profile.name}:`,
        error,
      );
    }
  }

  async waitForPortReady(
    host: string,
    port: number,
    timeoutMs = 15_000,
  ): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await this.probePort(host, port)) {
        return true;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, RCON_AUTO_CONNECT_RETRY_DELAY_MS),
      );
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
      socket.once("error", () => resolve(false));
    });
  }

  private mustGet(id: string): ServerProfile {
    const profile = this.repo.get(id);
    if (profile === null) {
      throw new Error("Server does not exist");
    }
    return profile;
  }
}
