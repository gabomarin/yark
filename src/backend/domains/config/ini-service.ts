import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import {
  flattenIniText,
  parseIniTextRows,
  sanitizeServerIniPayload,
  splitFlatIniKey,
} from "@shared/ini-text";
import type {
  IniDiffEntry,
  IniPreview,
  IniValidationIssue,
  ServerIniPayload,
  ServerIniSnapshot,
} from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";

type IniSectionMap = Record<string, Record<string, string>>;

function toSectionMap(text: string): IniSectionMap {
  const map: IniSectionMap = {};
  for (const row of parseIniTextRows(text)) {
    const section = map[row.section] ?? {};
    section[row.key] = row.value;
    map[row.section] = section;
  }
  return map;
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

    const { section, key } = splitFlatIniKey(fullKey);

    entries.push({
      fileKey,
      section,
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
          `INI inválido: ${preview.issues.map((i) => `${i.fileKey}: ${i.message}`).join(" | ")}`,
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

    const nextGameUserSettings = this.safeParse(
      "gameUserSettings",
      next.gameUserSettings,
      validationIssues,
    );
    const nextGame = this.safeParse("game", next.game, validationIssues);

    if (nextGameUserSettings === null || nextGame === null) {
      return {
        valid: false,
        issues: validationIssues,
        diff: [],
        changedCount: 0,
      };
    }

    this.validateGameUserSettingsSemantics(nextGameUserSettings, validationIssues);

    const diff: IniDiffEntry[] = [
      ...toDiffEntries(
        "gameUserSettings",
        flattenIniText(current.gameUserSettings),
        flattenIniText(next.gameUserSettings),
      ),
      ...toDiffEntries("game", flattenIniText(current.game), flattenIniText(next.game)),
    ];

    return {
      valid: validationIssues.length === 0,
      issues: validationIssues,
      diff,
      changedCount: diff.length,
    };
  }

  private validateGameUserSettingsSemantics(
    parsed: IniSectionMap,
    issues: IniValidationIssue[],
  ): void {
    const section = parsed["ServerSettings"];
    if (section === undefined) {
      return;
    }

    this.validateIntegerRange("RCONPort", section["RCONPort"], 1024, 65535, issues);
    this.validateIntegerRange("MaxPlayers", section["MaxPlayers"], 1, 255, issues);
    this.validateNumberRange("DifficultyOffset", section["DifficultyOffset"], 0, 1, issues);
  }

  private validateIntegerRange(
    key: string,
    value: unknown,
    min: number,
    max: number,
    issues: IniValidationIssue[],
  ): void {
    if (value === null || value === undefined) {
      return;
    }
    const text = String(value).trim();
    if (text.length === 0) {
      return;
    }
    const parsed = Number.parseInt(text, 10);
    if (!Number.isFinite(parsed) || !/^[-+]?\d+$/.test(text)) {
      issues.push({
        fileKey: "gameUserSettings",
        message: `${key} debe ser un entero válido`,
      });
      return;
    }

    if (parsed < min || parsed > max) {
      issues.push({
        fileKey: "gameUserSettings",
        message: `${key} debe estar entre ${min} y ${max}`,
      });
    }
  }

  private validateNumberRange(
    key: string,
    value: unknown,
    min: number,
    max: number,
    issues: IniValidationIssue[],
  ): void {
    if (value === null || value === undefined) {
      return;
    }
    const text = String(value).trim();
    if (text.length === 0) {
      return;
    }

    const parsed = Number.parseFloat(text);
    if (!Number.isFinite(parsed)) {
      issues.push({
        fileKey: "gameUserSettings",
        message: `${key} debe ser un número válido`,
      });
      return;
    }

    if (parsed < min || parsed > max) {
      issues.push({
        fileKey: "gameUserSettings",
        message: `${key} debe estar entre ${min} y ${max}`,
      });
    }
  }

  private safeParse(
    fileKey: IniValidationIssue["fileKey"],
    content: string,
    issues: IniValidationIssue[],
  ): IniSectionMap | null {
    try {
      return toSectionMap(content);
    } catch (err) {
      issues.push({
        fileKey,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
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
