import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import { sanitizeServerIniPayload } from "@shared/ini-text";
import type { ServerIniChangedPush } from "@shared/ipc";
import type {
  IniPreview,
  ServerIniPayload,
  ServerIniSaveResult,
  ServerIniSnapshot,
} from "@shared/types";
import type { PendingServerIniRepository } from "../../infra/db/pending-server-ini-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import { applyProfileOwnedKeysToGameUserSettings } from "./ini-compose";
import { buildIniPreview } from "./ini-preview";

export type { ServerIniChangedPush } from "@shared/ipc";

export interface IniServiceOptions {
  pending: PendingServerIniRepository;
  /** True while ASA may still overwrite live install INIs (#530). */
  isServerActive: (serverId: string) => boolean;
}

/**
 * Read / preview / save GameUserSettings.ini + Game.ini under an install.
 * While the process is live, save queues a durable draft and flush writes it
 * after stop (or before the next start) (#530).
 *
 * Profile-owned GUS keys (SessionName, ports, passwords, …) are always taken
 * from the Server profile when queueing, reading a pending draft, or flushing,
 * so Server-tab edits are not clobbered by an older INI draft.
 */
export class IniService extends EventEmitter {
  constructor(
    private readonly repo: ServerRepository,
    private readonly locks: InstanceLockManager,
    private readonly options?: IniServiceOptions,
  ) {
    super();
  }

  async readServerIni(serverId: string): Promise<ServerIniSnapshot> {
    const disk = await this.readDiskSnapshot(serverId);
    const pending = this.options?.pending.get(serverId) ?? null;
    if (pending === null) {
      return {
        ...disk,
        pending: false,
        pendingUpdatedAt: null,
      };
    }
    return {
      ...disk,
      payload: this.withProfileOwnedKeys(
        serverId,
        sanitizeServerIniPayload(pending.payload),
      ),
      pending: true,
      pendingUpdatedAt: pending.updatedAt,
    };
  }

  async previewServerIni(
    serverId: string,
    payload: ServerIniPayload,
  ): Promise<IniPreview> {
    const current = await this.readServerIni(serverId);
    return this.previewWithCurrent(
      current.payload,
      sanitizeServerIniPayload(payload),
    );
  }

  async saveServerIni(
    serverId: string,
    payload: ServerIniPayload,
  ): Promise<ServerIniSaveResult> {
    return this.locks.withLock(serverId, "ini-save", async () => {
      const current = await this.readServerIni(serverId);
      const sanitized = sanitizeServerIniPayload(payload);
      const preview = this.previewWithCurrent(current.payload, sanitized);
      if (!preview.valid) {
        throw new Error(
          `Invalid INI: ${preview.issues.map((i) => `${i.fileKey}: ${i.message}`).join(" | ")}`,
        );
      }

      const active = this.options?.isServerActive(serverId) === true;
      if (active) {
        if (this.options === undefined) {
          throw new Error("Pending INI queue is not configured");
        }
        // Bake current profile identity into the draft so Server-tab values
        // stay aligned; read/flush also re-apply from the live profile (#530).
        const queued = this.withProfileOwnedKeys(serverId, sanitized);
        this.options.pending.upsert(serverId, queued);
        this.repo.addEvent(
          serverId,
          "server_updated",
          "info",
          `INI configuration queued (${preview.changedCount} changes; applies when stopped)`,
        );
        this.emitChanged(serverId, true);
        return { ...preview, pending: true };
      }

      await this.writePayloadToDisk(
        current,
        this.withProfileOwnedKeys(serverId, sanitized),
      );
      this.options?.pending.delete(serverId);
      this.repo.addEvent(
        serverId,
        "server_updated",
        "info",
        `INI configuration updated (${preview.changedCount} changes)`,
      );
      this.emitChanged(serverId, false);
      return { ...preview, pending: false };
    });
  }

  /**
   * Write any queued draft to the install and clear the row.
   * Idempotent when nothing is pending. Safe to call after stop and before start.
   * Skips taking `ini-save` when the caller already holds the instance lock
   * (stop / restart / start).
   */
  async flushPendingServerIni(serverId: string): Promise<boolean> {
    if (this.locks.isLocked(serverId)) {
      return this.flushPendingServerIniBody(serverId);
    }
    return this.locks.withLock(serverId, "ini-save", () =>
      this.flushPendingServerIniBody(serverId),
    );
  }

  private async flushPendingServerIniBody(serverId: string): Promise<boolean> {
    const pending = this.options?.pending.get(serverId) ?? null;
    if (pending === null) {
      return false;
    }
    if (this.options?.isServerActive(serverId) === true) {
      throw new Error("Cannot flush pending INI while the server process is still active");
    }

    const disk = await this.readDiskSnapshot(serverId);
    const sanitized = this.withProfileOwnedKeys(
      serverId,
      sanitizeServerIniPayload(pending.payload),
    );
    const preview = this.previewWithCurrent(disk.payload, sanitized);
    if (!preview.valid) {
      throw new Error(
        `Invalid pending INI: ${preview.issues.map((i) => `${i.fileKey}: ${i.message}`).join(" | ")}`,
      );
    }

    await this.writePayloadToDisk(disk, sanitized);
    this.options?.pending.delete(serverId);
    this.repo.addEvent(
      serverId,
      "server_updated",
      "info",
      `Pending INI applied to disk (${preview.changedCount} changes)`,
    );
    this.emitChanged(serverId, false);
    return true;
  }

  /** Drop a queued draft without writing (e.g. after another path rewrote disk). */
  clearPendingServerIni(serverId: string): boolean {
    const cleared = this.options?.pending.delete(serverId) === true;
    if (cleared) {
      this.emitChanged(serverId, false);
    }
    return cleared;
  }

  private withProfileOwnedKeys(
    serverId: string,
    payload: ServerIniPayload,
  ): ServerIniPayload {
    const server = this.repo.get(serverId);
    if (server === null) {
      return payload;
    }
    return {
      gameUserSettings: applyProfileOwnedKeysToGameUserSettings(
        payload.gameUserSettings,
        server,
      ),
      game: payload.game,
    };
  }

  private emitChanged(serverId: string, pending: boolean): void {
    const payload: ServerIniChangedPush = { serverId, pending };
    this.emit("changed", payload);
  }

  private async readDiskSnapshot(serverId: string): Promise<
    Omit<ServerIniSnapshot, "pending" | "pendingUpdatedAt">
  > {
    const server = this.repo.get(serverId);
    if (server === null) {
      throw new Error("Server does not exist");
    }

    const gameUserSettingsPath = this.gameUserSettingsPath(server.installDir);
    const gameIniPath = this.gameIniPath(server.installDir);
    const gameUserSettingsExisted = existsSync(gameUserSettingsPath);
    const gameIniExisted = existsSync(gameIniPath);

    const [gameUserSettings, game] = await Promise.all([
      this.readTextOrDefault(gameUserSettingsPath, defaultGameUserSettingsIni),
      this.readTextOrDefault(gameIniPath, defaultGameIni),
    ]);

    return {
      serverId,
      gameUserSettingsPath,
      gameIniPath,
      gameUserSettingsExisted,
      gameIniExisted,
      payload: sanitizeServerIniPayload({
        gameUserSettings,
        game,
      }),
    };
  }

  private async writePayloadToDisk(
    current: Pick<ServerIniSnapshot, "gameUserSettingsPath" | "gameIniPath">,
    sanitized: ServerIniPayload,
  ): Promise<void> {
    await Promise.all([
      this.writeText(current.gameUserSettingsPath, sanitized.gameUserSettings),
      this.writeText(current.gameIniPath, sanitized.game),
    ]);
  }

  private previewWithCurrent(
    current: ServerIniPayload,
    next: ServerIniPayload,
  ): IniPreview {
    return buildIniPreview(current, next);
  }

  private async readTextOrDefault(path: string, defaultText: string): Promise<string> {
    try {
      return await readFile(path, "utf8");
    } catch {
      const normalized = defaultText.endsWith("\n") ? defaultText : `${defaultText}\n`;
      await this.writeText(path, normalized);
      return normalized;
    }
  }

  private async writeText(path: string, text: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
  }

  private gameUserSettingsPath(installDir: string): string {
    return join(
      installDir,
      "ShooterGame",
      "Saved",
      "Config",
      "WindowsServer",
      "GameUserSettings.ini",
    );
  }

  private gameIniPath(installDir: string): string {
    return join(
      installDir,
      "ShooterGame",
      "Saved",
      "Config",
      "WindowsServer",
      "Game.ini",
    );
  }
}
