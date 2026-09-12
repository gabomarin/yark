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
  ServerProfile,
} from "@shared/types";
import type { PendingServerIniRepository } from "../../infra/db/pending-server-ini-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import { applyProfileOwnedKeysToGameUserSettings } from "./ini-compose";
import { buildIniPreview } from "./ini-preview";

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
  /**
   * Per-server FIFO for pending/disk mutations. Instance locks are still used so
   * save conflicts with stop/start, but `isLocked` reentry must not let a
   * concurrent Server-tab sync clobber an in-flight INI save (#530).
   */
  private readonly iniMutationChains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly repo: ServerRepository,
    private readonly locks: InstanceLockManager,
    private readonly options?: IniServiceOptions,
  ) {
    super();
  }

  /** True when a durable queued draft exists for this server. */
  hasPendingServerIni(serverId: string): boolean {
    return (this.options?.pending.get(serverId) ?? null) !== null;
  }

  private withIniMutation<T>(serverId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.iniMutationChains.get(serverId) ?? Promise.resolve();
    const run = previous.then(work, work);
    this.iniMutationChains.set(
      serverId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
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
    return this.locks.withLock(serverId, "ini-save", () =>
      this.withIniMutation(serverId, async () => {
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
      }),
    );
  }

  /**
   * Apply profile-owned GUS keys through the same queue/disk gate as INI save (#530).
   * While the process is live: merge into the pending draft (create one from disk
   * if needed) — never write live install files. While idle: write disk and clear
   * pending. Optional `profile` covers Start session-port overlays.
   */
  async syncProfileOwnedKeys(
    serverId: string,
    profile?: ServerProfile,
  ): Promise<void> {
    const run = (): Promise<void> =>
      this.withIniMutation(serverId, () =>
        this.syncProfileOwnedKeysBody(serverId, profile),
      );
    // Reentrant for stop/start/restart that already hold the instance lock, but
    // still serialize with save/flush via withIniMutation.
    if (this.locks.isLocked(serverId)) {
      await run();
      return;
    }
    await this.locks.withLock(serverId, "ini-save", run);
  }

  private async syncProfileOwnedKeysBody(
    serverId: string,
    profileOverride?: ServerProfile,
  ): Promise<void> {
    const server = profileOverride ?? this.repo.get(serverId);
    if (server === null) {
      throw new Error("Server does not exist");
    }

    const disk = await this.readDiskSnapshot(serverId);
    const pending = this.options?.pending.get(serverId) ?? null;
    const base =
      pending !== null
        ? sanitizeServerIniPayload(pending.payload)
        : disk.payload;
    const next: ServerIniPayload = {
      gameUserSettings: applyProfileOwnedKeysToGameUserSettings(
        base.gameUserSettings,
        server,
      ),
      game: base.game,
    };

    const active = this.options?.isServerActive(serverId) === true;
    if (active) {
      if (this.options === undefined) {
        throw new Error("Pending INI queue is not configured");
      }
      this.options.pending.upsert(serverId, next);
      this.emitChanged(serverId, true);
      return;
    }

    await this.writePayloadToDisk(disk, next);
    this.options?.pending.delete(serverId);
    this.emitChanged(serverId, false);
  }

  /**
   * Write any queued draft to the install and clear the row.
   * Idempotent when nothing is pending. Safe to call after stop and before start.
   * Skips taking `ini-save` when the caller already holds the instance lock
   * (stop / restart / start).
   */
  async flushPendingServerIni(serverId: string): Promise<boolean> {
    const run = (): Promise<boolean> =>
      this.withIniMutation(serverId, () => this.flushPendingServerIniBody(serverId));
    if (this.locks.isLocked(serverId)) {
      return run();
    }
    return this.locks.withLock(serverId, "ini-save", run);
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
