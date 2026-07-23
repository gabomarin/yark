import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import parseIni from "ini";
import type {
  IniDiffEntry,
  IniPreview,
  IniValidationIssue,
  ServerIniPayload,
  ServerIniSnapshot,
} from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(",");
  return String(value);
}

function flattenIni(parsed: Record<string, unknown>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const section = value as Record<string, unknown>;
      for (const [subKey, subValue] of Object.entries(section)) {
        flat[`${key}.${subKey}`] = normalizeValue(subValue);
      }
      continue;
    }
    flat[`__root__.${key}`] = normalizeValue(value);
  }
  return flat;
}

function toDiffEntries(
  fileKey: IniDiffEntry["fileKey"],
  beforeMap: Record<string, string>,
  afterMap: Record<string, string>,
): IniDiffEntry[] {
  const keys = new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)]);
  const entries: IniDiffEntry[] = [];

  for (const fullKey of [...keys].sort()) {
    const before = beforeMap[fullKey];
    const after = afterMap[fullKey];
    if (before === after) continue;

    const dot = fullKey.indexOf(".");
    const sectionRaw = dot >= 0 ? fullKey.slice(0, dot) : "__root__";
    const key = dot >= 0 ? fullKey.slice(dot + 1) : fullKey;

    entries.push({
      fileKey,
      section: sectionRaw === "__root__" ? "(root)" : sectionRaw,
      key,
      before: before ?? null,
      after: after ?? null,
      change:
        before === undefined ? "added" : after === undefined ? "removed" : "changed",
    });
  }

  return entries;
}

export class IniService {
  constructor(
    private readonly repo: ServerRepository,
    private readonly locks: InstanceLockManager,
  ) {}

  async readServerIni(serverId: string): Promise<ServerIniSnapshot> {
    const server = this.repo.get(serverId);
    if (server === null) {
      throw new Error("El servidor no existe");
    }

    const gameUserSettingsPath = this.gameUserSettingsPath(server.installDir);
    const gameIniPath = this.gameIniPath(server.installDir);

    const [gameUserSettings, game] = await Promise.all([
      this.readTextOrEmpty(gameUserSettingsPath),
      this.readTextOrEmpty(gameIniPath),
    ]);

    return {
      serverId,
      gameUserSettingsPath,
      gameIniPath,
      payload: {
        gameUserSettings,
        game,
      },
    };
  }

  async previewServerIni(
    serverId: string,
    payload: ServerIniPayload,
  ): Promise<IniPreview> {
    const current = await this.readServerIni(serverId);
    return this.previewWithCurrent(current.payload, payload);
  }

  async saveServerIni(serverId: string, payload: ServerIniPayload): Promise<IniPreview> {
    return this.locks.withLock(serverId, "ini-save", async () => {
      const current = await this.readServerIni(serverId);
      const preview = this.previewWithCurrent(current.payload, payload);
      if (!preview.valid) {
        throw new Error(
          `INI inválido: ${preview.issues.map((i) => `${i.fileKey}: ${i.message}`).join(" | ")}`,
        );
      }

      await Promise.all([
        this.writeText(current.gameUserSettingsPath, payload.gameUserSettings),
        this.writeText(current.gameIniPath, payload.game),
      ]);

      this.repo.addEvent(
        serverId,
        "server_updated",
        "info",
        `Configuración INI actualizada (${preview.changedCount} cambios)`,
      );

      return preview;
    });
  }

  private previewWithCurrent(
    current: ServerIniPayload,
    next: ServerIniPayload,
  ): IniPreview {
    const validationIssues: IniValidationIssue[] = [];

    const currentGameUserSettingsParsed = this.safeParse(
      "gameUserSettings",
      current.gameUserSettings,
      validationIssues,
    );
    const nextGameUserSettingsParsed = this.safeParse(
      "gameUserSettings",
      next.gameUserSettings,
      validationIssues,
    );

    const currentGameParsed = this.safeParse("game", current.game, validationIssues);
    const nextGameParsed = this.safeParse("game", next.game, validationIssues);

    if (
      currentGameUserSettingsParsed === null ||
      nextGameUserSettingsParsed === null ||
      currentGameParsed === null ||
      nextGameParsed === null
    ) {
      return {
        valid: false,
        issues: validationIssues,
        diff: [],
        changedCount: 0,
      };
    }

    const diff: IniDiffEntry[] = [
      ...toDiffEntries(
        "gameUserSettings",
        flattenIni(currentGameUserSettingsParsed),
        flattenIni(nextGameUserSettingsParsed),
      ),
      ...toDiffEntries("game", flattenIni(currentGameParsed), flattenIni(nextGameParsed)),
    ];

    return {
      valid: true,
      issues: [],
      diff,
      changedCount: diff.length,
    };
  }

  private safeParse(
    fileKey: IniValidationIssue["fileKey"],
    content: string,
    issues: IniValidationIssue[],
  ): Record<string, unknown> | null {
    try {
      return parseIni.parse(content) as Record<string, unknown>;
    } catch (err) {
      issues.push({
        fileKey,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async readTextOrEmpty(path: string): Promise<string> {
    try {
      return await readFile(path, "utf8");
    } catch {
      return "";
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
