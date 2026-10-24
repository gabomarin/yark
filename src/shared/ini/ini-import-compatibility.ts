/**
 * Import compatibility report (PINI-011 / #682).
 *
 * Compares the Server form with the current INI. Only the identity fields
 * Start already writes can be replacements, and only when they differ.
 * Every other line is kept. This function does not write files or logs.
 */

import type { IniFileKey, ServerIniPayload } from "../types";
import { parseIniComplexEntries, type IniComplexParseStatus } from "./ini-complex-value";
import { getIniTextValueAt } from "./ini-semantic-ops";
import { parseIniTextRows } from "./ini-text";

export interface IniImportProfile {
  sessionName: string;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  adminPassword: string;
  serverPassword: string | null;
}

export type IniImportFieldId =
  "sessionName" | "gamePort" | "queryPort" | "rconPort" | "rconEnabled" | "adminPassword" | "serverPassword";

export interface IniImportIdentityField {
  id: IniImportFieldId;
  label: string;
  /** Null when that key is absent from the file. */
  fileValue: string | null;
  profileValue: string;
  sensitive: boolean;
}

interface IniImportKeptComplexLine {
  fileKey: IniFileKey;
  section: string;
  key: string;
  occurrence: number;
  status: IniComplexParseStatus;
}

export interface IniImportCompatibilityReport {
  /** Identity fields Start will change. Empty when the form already matches the file. */
  replacements: IniImportIdentityField[];
  /** Live non-identity rows that are not complex tuples. */
  keptScalarCount: number;
  keptComplex: IniImportKeptComplexLine[];
}

const IDENTITY_KEYS = new Set([
  "sessionsettings\u001fsessionname",
  "sessionsettings\u001fport",
  "sessionsettings\u001fqueryport",
  "serversettings\u001frconenabled",
  "serversettings\u001frconport",
  "serversettings\u001fserveradminpassword",
  "serversettings\u001fserverpassword",
]);

function identityKey(section: string, key: string): string {
  return `${section.trim().toLowerCase()}\u001f${key.trim().toLowerCase()}`;
}

function isIdentityKey(section: string, key: string): boolean {
  return IDENTITY_KEYS.has(identityKey(section, key));
}

function sameText(fileValue: string | null, profileValue: string): boolean {
  return fileValue !== null && fileValue.trim() === profileValue.trim();
}

function samePort(fileValue: string | null, profileValue: string): boolean {
  if (fileValue === null || !/^\d+$/.test(fileValue.trim())) return false;
  return Number(fileValue.trim()) === Number(profileValue);
}

function sameEnabled(fileValue: string | null): boolean {
  return fileValue !== null && fileValue.trim().toLowerCase() === "true";
}

function sameSecret(fileValue: string | null, profileValue: string): boolean {
  if (profileValue === "" && (fileValue === null || fileValue === "")) return true;
  return fileValue === profileValue;
}

/**
 * Value the operator sees and YARK stores.
 * Session names turn control characters into spaces. Ports drop them.
 */
function normalizeIniText(value: string | null, mode: "text" | "port"): string | null {
  if (value === null) return null;
  const cleaned =
    mode === "port"
      ? value.replace(/[\u0000-\u001F\u007F]/g, "")
      : value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/ {2,}/g, " ");
  const trimmed = cleaned.trim();
  return trimmed.length === 0 ? "" : trimmed;
}

function readIniText(text: string, section: string, key: string, mode: "text" | "port"): string | null {
  return normalizeIniText(getIniTextValueAt(text, section, key, 0), mode);
}

/**
 * Operator sentence for one replacement. Password lines name the field and
 * omit both values so a log of the visible text does not carry the secret.
 */
export function formatIniImportReplacement(field: IniImportIdentityField): string {
  if (field.sensitive) {
    return `${field.label} differs between GameUserSettings.ini and YARK. Values are hidden.`;
  }
  if (field.id === "rconEnabled") {
    return field.fileValue === null || field.fileValue.trim() === ""
      ? "RCON in GameUserSettings.ini: not set. RCON in YARK: on."
      : "RCON in GameUserSettings.ini: off. RCON in YARK: on.";
  }
  if (field.id === "sessionName") {
    const yark = `Session name in YARK: "${field.profileValue}".`;
    if (field.fileValue === null || field.fileValue.trim() === "") {
      return `Session name in GameUserSettings.ini: not set.\n${yark}`;
    }
    return `Session name in GameUserSettings.ini: "${field.fileValue}".\n${yark}`;
  }
  if (field.fileValue === null || field.fileValue.trim() === "") {
    return `${field.label} in GameUserSettings.ini: blank.\n${field.label} in YARK: ${field.profileValue}.`;
  }
  return `${field.label} in GameUserSettings.ini: ${field.fileValue}.\n${field.label} in YARK: ${field.profileValue}.`;
}

export function buildIniImportCompatibilityReport(
  profile: IniImportProfile,
  ini: ServerIniPayload,
): IniImportCompatibilityReport {
  const gus = ini.gameUserSettings;
  const joinPassword = profile.serverPassword ?? "";
  const sessionName = readIniText(gus, "SessionSettings", "SessionName", "text");
  const gamePort = readIniText(gus, "SessionSettings", "Port", "port");
  const queryPort = readIniText(gus, "SessionSettings", "QueryPort", "port");
  const rconPort = readIniText(gus, "ServerSettings", "RCONPort", "port");
  const rconEnabled = getIniTextValueAt(gus, "ServerSettings", "RCONEnabled", 0);
  const adminPassword = getIniTextValueAt(gus, "ServerSettings", "ServerAdminPassword", 0);
  const serverPassword = getIniTextValueAt(gus, "ServerSettings", "ServerPassword", 0);
  const candidates: Array<IniImportIdentityField & { matches: boolean }> = [
    {
      id: "sessionName",
      label: "Session name",
      fileValue: sessionName,
      profileValue: profile.sessionName,
      sensitive: false,
      matches: sameText(sessionName, profile.sessionName),
    },
    {
      id: "gamePort",
      label: "Game port",
      fileValue: gamePort,
      profileValue: String(profile.gamePort),
      sensitive: false,
      matches: samePort(gamePort, String(profile.gamePort)),
    },
    {
      id: "queryPort",
      label: "Query port",
      fileValue: queryPort,
      profileValue: String(profile.queryPort),
      sensitive: false,
      matches: samePort(queryPort, String(profile.queryPort)),
    },
    {
      id: "rconPort",
      label: "RCON port",
      fileValue: rconPort,
      profileValue: String(profile.rconPort),
      sensitive: false,
      matches: samePort(rconPort, String(profile.rconPort)),
    },
    {
      id: "rconEnabled",
      label: "RCON",
      fileValue: rconEnabled,
      profileValue: "True",
      sensitive: false,
      matches: sameEnabled(rconEnabled),
    },
    {
      id: "adminPassword",
      label: "Admin password",
      fileValue: adminPassword,
      profileValue: profile.adminPassword,
      sensitive: true,
      matches: sameSecret(adminPassword, profile.adminPassword),
    },
    {
      id: "serverPassword",
      label: "Server password",
      fileValue: serverPassword,
      profileValue: joinPassword,
      sensitive: true,
      matches: sameSecret(serverPassword, joinPassword),
    },
  ];

  const keptComplex = (["gameUserSettings", "game"] as const).flatMap((fileKey) => {
    const text = fileKey === "gameUserSettings" ? ini.gameUserSettings : ini.game;
    return parseIniComplexEntries(text, fileKey)
      .filter((entry) => !isIdentityKey(entry.section, entry.key))
      .map((entry) => ({
        fileKey,
        section: entry.section,
        key: entry.key,
        occurrence: entry.occurrence,
        status: entry.status,
      }));
  });

  const complexIds = new Set(
    keptComplex.map((line) => `${line.fileKey}\u001f${identityKey(line.section, line.key)}\u001f${line.occurrence}`),
  );
  let keptScalarCount = 0;
  for (const fileKey of ["gameUserSettings", "game"] as const) {
    const text = fileKey === "gameUserSettings" ? ini.gameUserSettings : ini.game;
    const seen = new Map<string, number>();
    for (const row of parseIniTextRows(text)) {
      if (isIdentityKey(row.section, row.key)) continue;
      const group = identityKey(row.section, row.key);
      const occurrence = seen.get(group) ?? 0;
      seen.set(group, occurrence + 1);
      if (complexIds.has(`${fileKey}\u001f${group}\u001f${occurrence}`)) continue;
      keptScalarCount += 1;
    }
  }

  return {
    replacements: candidates.filter((field) => !field.matches).map(({ matches: _matches, ...field }) => field),
    keptScalarCount,
    keptComplex,
  };
}

/** One sentence for complex lines. Null when the file has none. */
export function formatIniImportKeptSummary(report: IniImportCompatibilityReport): string | null {
  if (report.keptComplex.length === 0) return null;
  const unread = report.keptComplex.filter((line) => line.status !== "supported").length;
  if (unread === 0) {
    return report.keptComplex.length === 1
      ? "One spawn, stack, or crafting line in the file stays as it is."
      : `${report.keptComplex.length} spawn, stack, or crafting lines in the file stay as they are.`;
  }
  if (unread === report.keptComplex.length) {
    return unread === 1
      ? "One line in the file stays word for word. YARK doesn't read it."
      : `${unread} lines in the file stay word for word. YARK doesn't read them.`;
  }
  const readable = report.keptComplex.length - unread;
  return `${readable} ${readable === 1 ? "line stays" : "lines stay"} as ${readable === 1 ? "it is" : "they are"}. ${unread} ${unread === 1 ? "stays" : "stay"} word for word.`;
}
