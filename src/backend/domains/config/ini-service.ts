import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import { sanitizeServerIniPayload } from "@shared/ini-text";
import type {
  IniPreview,
  ServerIniPayload,
  ServerIniSnapshot,
} from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import { buildIniPreview } from "./ini-preview";

export class IniService {
  constructor(
    private readonly repo: ServerRepository,
    private readonly locks: InstanceLockManager,
  ) {}

  async readServerIni(serverId: string): Promise<ServerIniSnapshot> {
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

  async saveServerIni(serverId: string, payload: ServerIniPayload): Promise<IniPreview> {
    return this.locks.withLock(serverId, "ini-save", async () => {
      const current = await this.readServerIni(serverId);
      const sanitized = sanitizeServerIniPayload(payload);
      const preview = this.previewWithCurrent(current.payload, sanitized);
      if (!preview.valid) {
        throw new Error(
          `Invalid INI: ${preview.issues.map((i) => `${i.fileKey}: ${i.message}`).join(" | ")}`,
        );
      }

      await Promise.all([
        this.writeText(current.gameUserSettingsPath, sanitized.gameUserSettings),
        this.writeText(current.gameIniPath, sanitized.game),
      ]);

      this.repo.addEvent(
        serverId,
        "server_updated",
        "info",
        `INI configuration updated (${preview.changedCount} changes)`,
      );

      return preview;
    });
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
