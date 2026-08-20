import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseIniTextRows } from "@shared/ini-text";
import { serverBinaryPath } from "./launch-args";

/** Primary BanList path next to the dedicated binary (ASA convention). */
export function banListPath(installDir: string): string {
  return join(dirname(serverBinaryPath(installDir)), "BanList.txt");
}

/** Known alternate BanList locations (not merged into the active Win64 file). */
export function banListCandidatePaths(installDir: string): string[] {
  return [
    banListPath(installDir),
    join(installDir, "ShooterGame", "Saved", "BanList.txt"),
    join(installDir, "BanList.txt"),
  ];
}

/**
 * ASA BanList lines are often `eosId,playerName,0` (no spaces).
 * RCON `Unban` / `BanPlayer` only accept the id — strip name/flags.
 */
export function extractBanListId(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length === 0) return "";
  // Prefer comma (BanList.txt from BanPlayer), then whitespace.
  const first = trimmed.split(",")[0]?.trim() ?? "";
  return first.split(/\s+/)[0]?.trim() ?? "";
}

/** Optional display name from a BanList line (`id,name,flags`). */
function extractBanListName(token: string): string | null {
  const trimmed = token.trim();
  if (trimmed.length === 0 || !trimmed.includes(",")) return null;
  const parts = trimmed.split(",");
  const name = parts[1]?.trim() ?? "";
  return name.length > 0 ? name : null;
}

/** Flags / trailing fields after `id,name` (e.g. `0`). */
function extractBanListFlags(token: string): string | null {
  const trimmed = token.trim();
  if (trimmed.length === 0 || !trimmed.includes(",")) return null;
  const parts = trimmed.split(",");
  if (parts.length < 3) return null;
  const flags = parts.slice(2).join(",").trim();
  return flags.length > 0 ? flags : null;
}

export interface BanListEntry {
  id: string;
  name: string | null;
  /** Trailing fields after name (ASA BanPlayer lines use `id,name,0`). */
  flags: string | null;
}

/** Parses BanList text into id + optional name/flags (from ASA `id,name,0` lines). */
export function parseBanListEntries(raw: string): BanListEntry[] {
  const byKey = new Map<string, BanListEntry>();
  for (const line of raw.replace(/\r/g, "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const id = extractBanListId(trimmed);
    if (id.length === 0) continue;
    const key = id.toLowerCase();
    const name = extractBanListName(trimmed);
    const flags = extractBanListFlags(trimmed);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { id, name, flags });
      continue;
    }
    byKey.set(key, {
      id: existing.id,
      name: existing.name ?? name,
      flags: existing.flags ?? flags,
    });
  }
  return [...byKey.values()];
}

/** One player id per line; blank lines and `#` comments ignored. */
export function parseBanListText(raw: string): string[] {
  return parseBanListEntries(raw).map((entry) => entry.id);
}

export function formatBanListText(ids: string[]): string {
  if (ids.length === 0) return "";
  return `${ids.join("\n")}\n`;
}

/**
 * Writes BanList lines preserving ASA `id,name,flags` when a name is known.
 * Id-only lines stay id-only.
 */
export function formatBanListEntries(entries: BanListEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries.map((entry) => {
    const name = entry.name?.trim();
    if (name && name.length > 0) {
      const flags = entry.flags?.trim() || "0";
      return `${entry.id},${name},${flags}`;
    }
    return entry.id;
  });
  return `${lines.join("\n")}\n`;
}

async function readBanList(installDir: string): Promise<string[]> {
  return (await readBanListEntries(installDir)).map((entry) => entry.id);
}

export async function readBanListEntries(
  installDir: string,
): Promise<BanListEntry[]> {
  // Ticket #17: only the Win64 BanList next to the dedicated binary.
  const path = banListPath(installDir);
  if (!existsSync(path)) return [];
  return parseBanListEntries(await readFile(path, "utf8"));
}

/** Ensures the primary BanList.txt exists and returns its absolute path. */
export async function ensureBanListFile(installDir: string): Promise<string> {
  const path = banListPath(installDir);
  if (!existsSync(path)) {
    await writeFile(path, "", "utf8");
  }
  return path;
}

/**
 * Removes a player id from the primary Win64 BanList.txt with a single
 * rewrite that preserves remaining lines (including comments / blanks and
 * `id,name,flags` metadata). Does not merge alternate BanList locations.
 */
export async function removeFromBanList(
  installDir: string,
  playerKey: string,
): Promise<string[]> {
  const key = extractBanListId(playerKey).toLowerCase();
  if (key.length === 0) {
    return readBanList(installDir);
  }

  const path = banListPath(installDir);
  if (!existsSync(path)) {
    return [];
  }

  const raw = await readFile(path, "utf8");
  const keptLines: string[] = [];
  for (const line of raw.replace(/\r/g, "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      keptLines.push(line);
      continue;
    }
    if (extractBanListId(trimmed).toLowerCase() === key) {
      continue;
    }
    keptLines.push(line);
  }
  while (keptLines.length > 0 && keptLines[keptLines.length - 1]?.trim() === "") {
    keptLines.pop();
  }
  const body = keptLines.join("\n");
  await writeFile(path, body.length === 0 ? "" : `${body}\n`, "utf8");
  return parseBanListEntries(body).map((entry) => entry.id);
}

/** Resolve the id to send over RCON (never id,name,flags). */
export async function resolveBanListId(
  installDir: string,
  playerKey: string,
): Promise<string> {
  const extracted = extractBanListId(playerKey);
  const key = extracted.toLowerCase();
  const listed = await readBanList(installDir);
  return listed.find((id) => id.toLowerCase() === key) ?? extracted;
}

/** True for empty / blank / N/A INI URL values (BanListURL, etc.). */
export function isBlankOrNaUrl(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (/^n\/?a$/i.test(trimmed)) return true;
  return false;
}

/** Reads a key from [ServerSettings] in GameUserSettings.ini text. */
export function readIniServerSetting(
  text: string,
  key: string,
): string | null {
  const hit = parseIniTextRows(text).find(
    (row) =>
      row.section.toLowerCase() === "serversettings" &&
      row.key.toLowerCase() === key.toLowerCase(),
  );
  return hit?.value ?? null;
}
