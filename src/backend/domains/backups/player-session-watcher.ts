import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { EventEmitter } from "node:events";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import type { BackupService } from "./backup-service";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import { rconExec } from "../../infra/rcon/rcon-client";
import { parseListPlayersResponse, type ListedPlayer } from "./list-players";

const RCON_HOST = "127.0.0.1";
/** Fast enough to catch short join→leave sessions; still light on RCON. */
export const DEFAULT_POLL_MS = 10_000;
const PLAYER_PROFILE_RE = /\.(arkprofile)(\.bak)?$/i;
const RECENT_BACKUP_DEDUP_MS = 90_000;

/** Prefer persistent session; falls back to one-shot `rconExec`. */
export type ListPlayersExecutor = (serverId: string) => Promise<string>;

export interface PlayersUpdatedPayload {
  serverId: string;
  players: ListedPlayer[];
  timestamp: string;
  error: string | null;
}

/**
 * Polls `ListPlayers` while a server is running and creates per-player
 * profile backups on join/leave. First successful snapshot only seeds
 * the online set (no backups for players already present).
 *
 * Reliability extras:
 * - Immediate tick on process status transitions (running / leaving running)
 * - Flush disconnect backups for remaining online players when leaving `running`
 * - SavedArks `.arkprofile*` mtime scan (catches flushes RCON missed)
 *
 * Emits `players-updated` after each ListPlayers attempt (success or failure).
 */
export class PlayerSessionWatcher extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private pendingRetick = false;
  private readonly onlineByServer = new Map<string, Map<string, ListedPlayer>>();
  private readonly profileMtimes = new Map<string, Map<string, number>>();
  private readonly profileScanSeeded = new Set<string>();
  private readonly recentSessionBackupAt = new Map<string, number>();
  private readonly rconFailStreak = new Map<string, number>();
  private listPlayersExecutor: ListPlayersExecutor | null = null;

  constructor(
    private readonly backups: BackupService,
    private readonly servers: ServerRepository,
    private readonly processes: ProcessManager,
    private readonly pollMs = DEFAULT_POLL_MS,
  ) {
    super();
  }

  /**
   * Prefer the persistent RCON session (InstanceService.execRcon).
   * When unset, falls back to one-shot `rconExec`.
   */
  setListPlayersExecutor(executor: ListPlayersExecutor | null): void {
    this.listPlayersExecutor = executor;
  }

  getOnlinePlayers(serverId: string): ListedPlayer[] {
    const online = this.onlineByServer.get(serverId);
    if (online === undefined) return [];
    return Array.from(online.values());
  }

  /** Force an immediate ListPlayers for one server (manual UI refresh). */
  async refreshServer(serverId: string): Promise<ListedPlayer[]> {
    const server = this.servers.get(serverId);
    if (server === null) {
      return [];
    }
    await this.tickServer(server);
    return this.getOnlinePlayers(serverId);
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollMs);
    this.timer.unref();
    this.processes.on("status", this.onProcessStatus);
    void this.tick();
  }

  stop(): void {
    this.processes.off("status", this.onProcessStatus);
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.onlineByServer.clear();
    this.profileMtimes.clear();
    this.profileScanSeeded.clear();
    this.recentSessionBackupAt.clear();
    this.rconFailStreak.clear();
  }

  private readonly onProcessStatus = (info: ServerRuntimeInfo): void => {
    if (
      info.status === "running"
      || info.status === "stopping"
      || info.status === "stopped"
      || info.status === "error"
    ) {
      void this.tick();
    }
  };

  /** Exposed for unit tests. */
  async tick(): Promise<void> {
    if (this.ticking) {
      this.pendingRetick = true;
      return;
    }
    this.ticking = true;
    try {
      do {
        this.pendingRetick = false;
        for (const server of this.servers.list()) {
          await this.tickServer(server);
        }
      } while (this.pendingRetick);
    } finally {
      this.ticking = false;
    }
  }

  private emitPlayersUpdated(
    serverId: string,
    players: ListedPlayer[],
    error: string | null,
  ): void {
    const payload: PlayersUpdatedPayload = {
      serverId,
      players,
      timestamp: new Date().toISOString(),
      error,
    };
    this.emit("players-updated", payload);
  }

  private async fetchListPlayers(server: ServerProfile): Promise<string> {
    if (this.listPlayersExecutor !== null) {
      return this.listPlayersExecutor(server.id);
    }
    const runtime = this.processes.applyRuntimePorts(server);
    return rconExec(
      RCON_HOST,
      runtime.rconPort,
      runtime.adminPassword,
      "ListPlayers",
    );
  }

  private async tickServer(server: ServerProfile): Promise<void> {
    const status = this.processes.getStatus(server.id).status;
    if (status !== "running") {
      await this.flushOnlineAsDisconnect(server.id);
      this.onlineByServer.delete(server.id);
      this.profileMtimes.delete(server.id);
      this.profileScanSeeded.delete(server.id);
      this.rconFailStreak.delete(server.id);
      this.emitPlayersUpdated(server.id, [], null);
      return;
    }

    let listed: ListedPlayer[] | null = null;
    try {
      const response = await this.fetchListPlayers(server);
      listed = parseListPlayersResponse(response);
      this.rconFailStreak.set(server.id, 0);
      this.emitPlayersUpdated(server.id, listed, null);
    } catch (error) {
      const streak = (this.rconFailStreak.get(server.id) ?? 0) + 1;
      this.rconFailStreak.set(server.id, streak);
      const message =
        error instanceof Error ? error.message : String(error);
      // Keep previous online set; log occasionally so silent RCON death is visible.
      if (streak === 1 || streak % 6 === 0) {
        this.servers.addEvent(
          server.id,
          "error",
          "warning",
          `ListPlayers RCON failed (${streak}x); player session backups may lag: ${message}`,
        );
      }
      this.emitPlayersUpdated(
        server.id,
        this.getOnlinePlayers(server.id),
        message,
      );
    }

    if (listed !== null) {
      const next = new Map(listed.map((player) => [player.key, player]));
      const previous = this.onlineByServer.get(server.id);
      this.onlineByServer.set(server.id, next);

      if (previous !== undefined) {
        for (const [key, player] of next) {
          if (!previous.has(key)) {
            await this.safePlayerBackup(server.id, "connect", player);
          }
        }
        for (const [key, player] of previous) {
          if (!next.has(key)) {
            await this.safePlayerBackup(server.id, "disconnect", player);
          }
        }
      }
    }

    await this.scanProfileFiles(server);
  }

  private async flushOnlineAsDisconnect(serverId: string): Promise<void> {
    const previous = this.onlineByServer.get(serverId);
    if (previous === undefined || previous.size === 0) return;
    for (const player of previous.values()) {
      await this.safePlayerBackup(serverId, "disconnect", player);
    }
  }

  /**
   * Safety net when ListPlayers misses a short session: new/changed
   * `.arkprofile*` files while the player is not currently online.
   */
  private async scanProfileFiles(server: ServerProfile): Promise<void> {
    const online = this.onlineByServer.get(server.id) ?? new Map();
    const previousMtimes = this.profileMtimes.get(server.id) ?? new Map();
    const nextMtimes = new Map<string, number>();
    const seeded = this.profileScanSeeded.has(server.id);
    const discovered: Array<{ key: string; path: string; mtimeMs: number }> = [];

    for (const root of playerSearchRoots(server)) {
      if (!existsSync(root)) continue;
      const files = await listFilesRecursive(root);
      for (const file of files) {
        const name = basename(file);
        if (!isPlayerProfileFile(name)) continue;
        try {
          const mtimeMs = (await stat(file)).mtimeMs;
          nextMtimes.set(file, mtimeMs);
          const stem = profileStem(name);
          const key = normalizePlayerKey(stem);
          if (key.length === 0) continue;
          discovered.push({ key, path: file, mtimeMs });
        } catch {
          // File may disappear mid-scan.
        }
      }
    }

    this.profileMtimes.set(server.id, nextMtimes);

    if (!seeded) {
      this.profileScanSeeded.add(server.id);
      return;
    }

    for (const entry of discovered) {
      if (online.has(entry.key)) continue;
      const prev = previousMtimes.get(entry.path);
      const isNew = prev === undefined;
      const changed = prev !== undefined && entry.mtimeMs > prev + 1;
      if (!isNew && !changed) continue;
      await this.safePlayerBackup(server.id, "disconnect", {
        key: entry.key,
        name: null,
      });
    }
  }

  private async safePlayerBackup(
    serverId: string,
    event: "connect" | "disconnect",
    player: ListedPlayer,
  ): Promise<void> {
    const dedupeKey = `${serverId}:${event}:${player.key}`;
    const last = this.recentSessionBackupAt.get(dedupeKey) ?? 0;
    if (Date.now() - last < RECENT_BACKUP_DEDUP_MS) {
      return;
    }
    this.recentSessionBackupAt.set(dedupeKey, Date.now());

    try {
      const record = await this.backups.createPlayerSessionBackup(
        serverId,
        event,
        player.key,
        player.name,
      );
      // Empty (no profile on disk) — allow a later retry once the file appears.
      if (record === null) {
        this.recentSessionBackupAt.delete(dedupeKey);
      }
    } catch (error) {
      // Allow a later retry if packaging failed.
      this.recentSessionBackupAt.delete(dedupeKey);
      this.servers.addEvent(
        serverId,
        "error",
        "warning",
        `Player ${event} backup failed for ${player.name ?? player.key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function normalizePlayerKey(value: string): string {
  return value.trim().toLowerCase().replace(/^eos:/i, "");
}

function isPlayerProfileFile(name: string): boolean {
  return PLAYER_PROFILE_RE.test(name) || name.toLowerCase().endsWith(".profilebak");
}

function profileStem(name: string): string {
  return name.replace(/\.(arkprofile)(\.bak)?$/i, "").replace(/\.profilebak$/i, "");
}

function playerSearchRoots(server: ServerProfile): string[] {
  const savedRoot = join(server.installDir, "ShooterGame", "Saved");
  return [join(savedRoot, "SavedArks"), join(savedRoot, "SaveGames")];
}

async function listFilesRecursive(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}
