import {
  flattenIniText,
  parseIniTextRows,
  splitFlatIniKey,
} from "@shared/ini-text";
import type {
  IniDiffEntry,
  IniPreview,
  IniValidationIssue,
  ServerIniPayload,
} from "@shared/types";

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

function safeParse(
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

function validateIntegerRange(
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
      message: `${key} must be a valid integer`,
    });
    return;
  }

  if (parsed < min || parsed > max) {
    issues.push({
      fileKey: "gameUserSettings",
      message: `${key} must be between ${min} and ${max}`,
    });
  }
}

function validateNumberRange(
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
      message: `${key} must be a valid number`,
    });
    return;
  }

  if (parsed < min || parsed > max) {
    issues.push({
      fileKey: "gameUserSettings",
      message: `${key} must be between ${min} and ${max}`,
    });
  }
}

function findIniSection(
  parsed: IniSectionMap,
  sectionName: string,
): Record<string, string> | undefined {
  const wanted = sectionName.toLowerCase();
  for (const [name, section] of Object.entries(parsed)) {
    if (name.toLowerCase() === wanted) {
      return section;
    }
  }
  return undefined;
}

function validateGameUserSettingsSemantics(
  parsed: IniSectionMap,
  issues: IniValidationIssue[],
): void {
  const serverSettings = findIniSection(parsed, "ServerSettings");
  if (serverSettings !== undefined) {
    validateIntegerRange("RCONPort", serverSettings["RCONPort"], 1024, 65535, issues);
    validateIntegerRange("MaxPlayers", serverSettings["MaxPlayers"], 1, 255, issues);
    validateNumberRange(
      "DifficultyOffset",
      serverSettings["DifficultyOffset"],
      0,
      1,
      issues,
    );
  }

  const sessionSettings = findIniSection(parsed, "SessionSettings");
  if (sessionSettings !== undefined) {
    validateIntegerRange("MaxPlayers", sessionSettings["MaxPlayers"], 1, 255, issues);
  }

  const gameSession = findIniSection(parsed, "/Script/Engine.GameSession");
  if (gameSession !== undefined) {
    validateIntegerRange("MaxPlayers", gameSession["MaxPlayers"], 1, 255, issues);
  }
}

/** Diff + semantic validation shared by server INI and cluster templates. */
export function buildIniPreview(
  current: ServerIniPayload,
  next: ServerIniPayload,
): IniPreview {
  const validationIssues: IniValidationIssue[] = [];

  const nextGameUserSettings = safeParse(
    "gameUserSettings",
    next.gameUserSettings,
    validationIssues,
  );
  const nextGame = safeParse("game", next.game, validationIssues);

  if (nextGameUserSettings === null || nextGame === null) {
    return {
      valid: false,
      issues: validationIssues,
      diff: [],
      changedCount: 0,
    };
  }

  validateGameUserSettingsSemantics(nextGameUserSettings, validationIssues);

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
