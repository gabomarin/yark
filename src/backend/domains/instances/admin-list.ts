import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, parse, resolve, basename } from "node:path";
import { removeIniTextValue, setIniTextValue } from "@shared/ini-text";
import {
  isBlankOrNaUrl,
  readIniServerSetting,
} from "./ban-list";
import { serverBinaryPath } from "./launch-args";
import { gameUserSettingsIniPath } from "./sync-profile-ini";

/** Wiki default for UpdateAllowedCheatersInterval (seconds). */
export const DEFAULT_UPDATE_ALLOWED_CHEATERS_INTERVAL = 600;

/** Dedicated clamps any value below this to 3.0. */
const MIN_UPDATE_ALLOWED_CHEATERS_INTERVAL = 3;

const ADMIN_LIST_FETCH_TIMEOUT_MS = 15_000;

export type AdminListMode = "local" | "remote" | "misconfigured";

export interface AdminListEntry {
  id: string;
  /** YARK-only display name from sidecar / learned Online hints (ASA does not store names). */
  name: string | null;
}

export interface AdminListState {
  mode: AdminListMode;
  /** Unwrapped URL (empty when local / blank). */
  adminListUrl: string;
  updateAllowedCheatersInterval: number;
  entries: AdminListEntry[];
  /** Read/fetch error for the id list (config may still be valid). */
  listError: string | null;
  /** Absolute path to AllowedCheaterAccountIDs.txt. */
  filePath: string;
  /** Whether the wiki local file exists on disk. */
  fileExists: boolean;
  /** Byte length of the wiki local file (0 if missing). */
  fileByteLength: number;
}

export interface AdminListConfigInput {
  adminListUrl: string;
  updateAllowedCheatersInterval: number;
}

export interface AdminListValidateResult {
  count: number;
  ids: string[];
}

/** Wiki path: ShooterGame/Saved/AllowedCheaterAccountIDs.txt */
export function adminListPath(installDir: string): string {
  return join(
    installDir,
    "ShooterGame",
    "Saved",
    "AllowedCheaterAccountIDs.txt",
  );
}

/**
 * YARK-only name sidecar (ASA never reads this).
 * Same folder as the wiki file: AllowedCheaterAccountIDs.names.json
 */
export function adminListNamesPath(installDir: string): string {
  return join(
    installDir,
    "ShooterGame",
    "Saved",
    "AllowedCheaterAccountIDs.names.json",
  );
}

/** Legacy YARK spike path — never treat as source of truth. */
export function legacyAdminListPath(installDir: string): string {
  return join(dirname(serverBinaryPath(installDir)), "AdminList.txt");
}

/** Strip surrounding double quotes from an INI URL value. */
export function unwrapIniUrl(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  let trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * True for YARK loopback admin-list HTTP (treated as Local mode in the UI).
 * ASA fetches these the same way as a remote gist.
 */
export function isLoopbackAdminListUrl(value: string | null | undefined): boolean {
  const url = unwrapIniUrl(value);
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * Classifies AdminListURL for ASA / YARK:
 * - blank / N/A → local (legacy; YARK rewrites to file:// or loopback on save)
 * - file:// → local
 * - http(s) on loopback → local (YARK gateway)
 * - other http(s) → remote
 * - anything else → misconfigured
 */
export function classifyAdminListUrl(
  value: string | null | undefined,
): AdminListMode {
  const url = unwrapIniUrl(value);
  if (isBlankOrNaUrl(url)) return "local";
  if (/^file:\/\//i.test(url)) return "local";
  if (isLoopbackAdminListUrl(url)) return "local";
  if (/^https?:\/\//i.test(url)) return "remote";
  return "misconfigured";
}

/** Stable 16-hex hash for an install dir (mirror filename stem). */
export function adminListInstallHash(installDir: string): string {
  return createHash("sha256")
    .update(normalize(resolve(installDir)).toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

/**
 * Absolute path ASA should load via AdminListURL file:// (fallback).
 * Wiki Saved path when it has no whitespace; otherwise a mirror under
 * `asaMirrorRoot` (YARK userData `admin-lists/`). Falls back to
 * `<drive>:\yark-admin-lists` only if no mirror root is configured.
 */
export function adminListAsaPointerPath(
  installDir: string,
  asaMirrorRoot?: string | null,
): string {
  const wiki = adminListPath(installDir);
  if (!/\s/.test(wiki)) return wiki;

  const hash = adminListInstallHash(installDir);
  const configured = asaMirrorRoot?.trim() ?? "";
  if (configured.length > 0) {
    return join(resolve(configured), `${hash}.txt`);
  }
  return join(parse(resolve(installDir)).root, "yark-admin-lists", `${hash}.txt`);
}

/** UserData (or configured) mirror path used for loopback HTTP + space-free file://. */
export function adminListMirrorFilePath(
  installDir: string,
  asaMirrorRoot?: string | null,
): string | null {
  const configured = asaMirrorRoot?.trim() ?? "";
  if (configured.length === 0) return null;
  return join(resolve(configured), `${adminListInstallHash(installDir)}.txt`);
}

export interface LocalAdminListUrlOptions {
  asaMirrorRoot?: string | null;
  /** Optional loopback base (`http://127.0.0.1:<port>`); preferred over file://. */
  loopbackBaseUrl?: string | null;
}

/**
 * ASA-facing local AdminListURL.
 * Prefer loopback http (same fetch path as a gist). Fallback: `file:///C:/…`
 * with forward slashes (community-confirmed form).
 */
export function formatLocalAdminListFileUrlForIni(
  installDir: string,
  asaMirrorRootOrOptions?: string | null | LocalAdminListUrlOptions,
): string {
  const options: LocalAdminListUrlOptions =
    asaMirrorRootOrOptions != null &&
    typeof asaMirrorRootOrOptions === "object" &&
    !Array.isArray(asaMirrorRootOrOptions)
      ? asaMirrorRootOrOptions
      : { asaMirrorRoot: asaMirrorRootOrOptions as string | null | undefined };

  const mirror = adminListMirrorFilePath(installDir, options.asaMirrorRoot);
  const base = options.loopbackBaseUrl?.trim().replace(/\/$/, "") ?? "";
  if (base.length > 0 && mirror) {
    return `"${base}/${basename(mirror)}"`;
  }

  const absolute = adminListAsaPointerPath(installDir, options.asaMirrorRoot);
  const asUriPath = absolute.replace(/\\/g, "/");
  return `"file:///${asUriPath}"`;
}

/** UTF-8 body, no BOM, LF line endings only (ASA-safe plain text). */
export function formatAdminListIdsBody(ids: string[]): string {
  return ids.length === 0 ? "" : `${ids.join("\n")}\n`;
}

/** Write whitelist body as raw UTF-8 bytes (never injects a UTF-8 BOM). */
export async function writeAdminListBodyFile(
  filePath: string,
  ids: string[],
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const body = formatAdminListIdsBody(ids);
  await writeFile(filePath, Buffer.from(body, "utf8"));
}

/**
 * Parse wiki body to unique ids and rewrite the file when whitespace / blank
 * lines / comments would leave junk for ASA (or for the space-free mirror).
 */
export async function sanitizeAdminListWikiFile(
  installDir: string,
): Promise<string[]> {
  await ensureAdminListFile(installDir);
  const wiki = adminListPath(installDir);
  const raw = existsSync(wiki) ? await readFile(wiki, "utf8") : "";
  const ids = parseAdminListIds(raw);
  const body = formatAdminListIdsBody(ids);
  const normalizedRaw = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (normalizedRaw !== body) {
    await writeAdminListBodyFile(wiki, ids);
  }
  return ids;
}

/**
 * Sanitize wiki AllowedCheaterAccountIDs.txt, refresh userData mirror (HTTP),
 * and copy cleaned ids → ASA file:// pointer when that path differs.
 */
export async function syncAdminListAsaPointer(
  installDir: string,
  asaMirrorRoot?: string | null,
): Promise<string> {
  const ids = await sanitizeAdminListWikiFile(installDir);
  const wiki = adminListPath(installDir);
  const pointer = adminListAsaPointerPath(installDir, asaMirrorRoot);
  const mirror = adminListMirrorFilePath(installDir, asaMirrorRoot);
  const targets = new Set<string>();
  if (mirror) targets.add(normalize(mirror));
  if (normalize(pointer).toLowerCase() !== normalize(wiki).toLowerCase()) {
    targets.add(normalize(pointer));
  }
  for (const target of targets) {
    await writeAdminListBodyFile(target, ids);
  }
  return mirror ?? pointer;
}

/**
 * Before dedicated spawn: re-read local whitelist + refresh mirror / AdminListURL
 * so out-of-band edits to AllowedCheaterAccountIDs.txt are not stale.
 * Best-effort — never blocks start.
 */
export async function refreshAdminListBeforeStart(
  installDir: string,
  asaMirrorRoot?: string | null,
  loopbackBaseUrl?: string | null,
): Promise<void> {
  try {
    await ensureLocalAdminListFileUrlPointer(
      installDir,
      asaMirrorRoot,
      loopbackBaseUrl,
    );
  } catch {
    // Start must not fail on whitelist hygiene.
  }
}

/** Clamp interval per wiki (values below 3 → 3). Non-finite → default 600. */
export function clampUpdateAllowedCheatersInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_UPDATE_ALLOWED_CHEATERS_INTERVAL;
  }
  return Math.max(MIN_UPDATE_ALLOWED_CHEATERS_INTERVAL, value);
}

/** Parse one-EOS-id-per-line list (skip blanks and `#` comments). */
export function parseAdminListIds(raw: string): string[] {
  const byKey = new Map<string, string>();
  const text = raw.replace(/^\uFEFF/, "").replace(/\r/g, "");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    // Take first token only (ignore accidental trailing junk).
    const id = trimmed.split(/[\s,]+/)[0]?.trim() ?? "";
    if (id.length === 0) continue;
    const key = id.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, id);
    }
  }
  return [...byKey.values()];
}

/** Parse YARK names sidecar JSON (`{ [eosId]: name }`). */
export function parseAdminListNamesJson(raw: string): Map<string, string> {
  const byKey = new Map<string, string>();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return byKey;
    }
    for (const [id, name] of Object.entries(parsed as Record<string, unknown>)) {
      const key = id.trim().toLowerCase();
      const label = typeof name === "string" ? name.trim() : "";
      if (key.length === 0 || label.length === 0) continue;
      byKey.set(key, label);
    }
  } catch {
    return byKey;
  }
  return byKey;
}

export function formatAdminListNamesJson(names: Map<string, string>): string {
  const obj: Record<string, string> = {};
  const sorted = [...names.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, name] of sorted) {
    obj[key] = name;
  }
  return `${JSON.stringify(obj, null, 2)}\n`;
}

async function readAdminListNames(
  installDir: string,
): Promise<Map<string, string>> {
  const path = adminListNamesPath(installDir);
  if (!existsSync(path)) return new Map();
  try {
    return parseAdminListNamesJson(await readFile(path, "utf8"));
  } catch {
    return new Map();
  }
}

/**
 * Merge learned EOS id → display name into the YARK sidecar.
 * Returns how many entries were newly written or updated.
 */
export async function learnAdminListNames(
  installDir: string,
  hints: Array<{ id: string; name: string }>,
): Promise<{ updated: number; namesPath: string }> {
  const names = await readAdminListNames(installDir);
  let updated = 0;
  for (const hint of hints) {
    const id = hint.id.trim();
    const name = hint.name.trim();
    if (id.length === 0 || name.length === 0) continue;
    const key = id.toLowerCase();
    if (names.get(key) === name) continue;
    names.set(key, name);
    updated += 1;
  }
  const namesPath = adminListNamesPath(installDir);
  if (updated > 0) {
    await mkdir(dirname(namesPath), { recursive: true });
    await writeFile(namesPath, formatAdminListNamesJson(names), "utf8");
  }
  return { updated, namesPath };
}

function entriesWithNames(
  ids: string[],
  names: Map<string, string>,
): AdminListEntry[] {
  return ids.map((id) => ({
    id,
    name: names.get(id.toLowerCase()) ?? null,
  }));
}

/** Format URL for GameUserSettings: quoted http(s); empty means local pointer. */
export function formatAdminListUrlForIni(url: string): string {
  const unwrapped = unwrapIniUrl(url);
  if (isBlankOrNaUrl(unwrapped)) return "";
  if (/^https?:\/\//i.test(unwrapped)) {
    return `"${unwrapped}"`;
  }
  if (/^file:\/\//i.test(unwrapped)) {
    const absolute = windowsPathFromAdminListFileUrl(unwrapped);
    const asUriPath = absolute.replace(/\\/g, "/");
    return `"file:///${asUriPath}"`;
  }
  return unwrapped;
}

function parseUpdateAllowedCheatersInterval(
  raw: string | null | undefined,
): number {
  if (raw === null || raw === undefined) {
    return DEFAULT_UPDATE_ALLOWED_CHEATERS_INTERVAL;
  }
  const n = Number.parseFloat(raw.trim());
  return clampUpdateAllowedCheatersInterval(n);
}

/** Ensures the wiki file exists (empty OK) and clears legacy Win64 AdminList.txt. */
export async function ensureAdminListFile(installDir: string): Promise<string> {
  const path = adminListPath(installDir);
  await mkdir(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    await writeFile(path, "", "utf8");
  }
  await clearLegacyAdminListFile(installDir);
  return path;
}

async function clearLegacyAdminListFile(
  installDir: string,
): Promise<void> {
  const legacy = legacyAdminListPath(installDir);
  if (!existsSync(legacy)) return;
  try {
    await unlink(legacy);
  } catch {
    // Best-effort; wiki file remains authoritative.
  }
}

async function readAdminListIdsFromFile(
  installDir: string,
): Promise<string[]> {
  const path = adminListPath(installDir);
  if (!existsSync(path)) return [];
  return parseAdminListIds(await readFile(path, "utf8"));
}

function localFileStats(installDir: string): {
  filePath: string;
  fileExists: boolean;
  fileByteLength: number;
} {
  const filePath = adminListPath(installDir);
  if (!existsSync(filePath)) {
    return { filePath, fileExists: false, fileByteLength: 0 };
  }
  try {
    return {
      filePath,
      fileExists: true,
      fileByteLength: statSync(filePath).size,
    };
  } catch {
    return { filePath, fileExists: true, fileByteLength: 0 };
  }
}

/** Write one-id-per-line wiki file (creates parent dirs). */
export async function writeAdminListIdsFile(
  installDir: string,
  ids: string[],
  asaMirrorRoot?: string | null,
): Promise<string> {
  const path = adminListPath(installDir);
  const unique = parseAdminListIds(ids.join("\n"));
  await writeAdminListBodyFile(path, unique);
  await clearLegacyAdminListFile(installDir);
  await syncAdminListAsaPointer(installDir, asaMirrorRoot);
  return path;
}

/** Append a single EOS id to the local wiki file (local mode helper). */
export async function appendAdminListId(
  installDir: string,
  rawId: string,
  asaMirrorRoot?: string | null,
  loopbackBaseUrl?: string | null,
): Promise<AdminListState> {
  const id = rawId.trim().split(/[\s,]+/)[0]?.trim() ?? "";
  if (id.length === 0) {
    throw new Error("EOS id is required");
  }
  const { mode } = await readGusIntervalAndUrl(installDir);
  if (mode !== "local") {
    throw new Error(
      "Switch to Local file and save that mode before adding ids to the local whitelist file.",
    );
  }
  const existing = await readAdminListIdsFromFile(installDir);
  const key = id.toLowerCase();
  if (!existing.some((entry) => entry.toLowerCase() === key)) {
    existing.push(id);
    await writeAdminListIdsFile(installDir, existing, asaMirrorRoot);
  }
  return getAdminListState(installDir, asaMirrorRoot, loopbackBaseUrl);
}

/** Remove every AdminListURL assignment under [ServerSettings]. */
function clearAllAdminListUrlKeys(text: string): string {
  let next = text;
  for (let i = 0; i < 32; i += 1) {
    if (readIniServerSetting(next, "AdminListURL") === null) break;
    next = removeIniTextValue(next, "ServerSettings", "AdminListURL", 0);
  }
  return next;
}

/** Fetch remote admin list text; throws on non-OK HTTP or network failure. */
async function fetchAdminListUrlText(url: string): Promise<string> {
  const unwrapped = unwrapIniUrl(url);
  if (!/^https?:\/\//i.test(unwrapped)) {
    throw new Error("Admin list URL must be http or https");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADMIN_LIST_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(unwrapped, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/plain,*/*" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching admin list`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out fetching admin list URL");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function validateAdminListUrl(
  url: string,
): Promise<AdminListValidateResult> {
  const text = await fetchAdminListUrlText(url);
  const ids = parseAdminListIds(text);
  return { count: ids.length, ids };
}

async function readGusIntervalAndUrl(installDir: string): Promise<{
  adminListUrl: string;
  updateAllowedCheatersInterval: number;
  mode: AdminListMode;
}> {
  const gusPath = gameUserSettingsIniPath(installDir);
  let rawUrl: string | null = null;
  let rawInterval: string | null = null;
  if (existsSync(gusPath)) {
    const text = await readFile(gusPath, "utf8");
    rawUrl = readIniServerSetting(text, "AdminListURL");
    rawInterval = readIniServerSetting(text, "UpdateAllowedCheatersInterval");
  }
  const mode = classifyAdminListUrl(rawUrl);
  const unwrapped = unwrapIniUrl(rawUrl);
  return {
    // UI only shows http(s) for Remote; local uses file:// under the hood.
    adminListUrl:
      mode === "remote" && !isBlankOrNaUrl(unwrapped) ? unwrapped : "",
    updateAllowedCheatersInterval: parseUpdateAllowedCheatersInterval(rawInterval),
    mode,
  };
}

/** Strip file:// and INI-doubled backslashes to a Windows path. */
export function windowsPathFromAdminListFileUrl(fileUrl: string): string {
  let body = unwrapIniUrl(fileUrl).replace(/^file:\/\//i, "");
  // file:///C:\… → leading slash after stripping file://
  if (/^\/[A-Za-z]:/.test(body)) {
    body = body.slice(1);
  }
  // INI stores C:\\foo → body may still contain \\ pairs
  while (body.includes("\\\\")) {
    body = body.replace(/\\\\/g, "\\");
  }
  return normalize(body);
}

/**
 * Legacy blank/N/A, file://, or stale loopback port → rewrite Local AdminListURL.
 * Syncs wiki → mirror, then points at loopback http when available.
 */
async function ensureLocalAdminListFileUrlPointer(
  installDir: string,
  asaMirrorRoot?: string | null,
  loopbackBaseUrl?: string | null,
): Promise<void> {
  const gusPath = gameUserSettingsIniPath(installDir);
  if (!existsSync(gusPath)) return;
  let text = await readFile(gusPath, "utf8");
  const rawUrl = readIniServerSetting(text, "AdminListURL");
  if (classifyAdminListUrl(rawUrl) !== "local") return;

  await syncAdminListAsaPointer(installDir, asaMirrorRoot);
  const expected = formatLocalAdminListFileUrlForIni(installDir, {
    asaMirrorRoot,
    loopbackBaseUrl,
  });
  const currentNorm = unwrapIniUrl(rawUrl).replace(/\\/g, "/").toLowerCase();
  const expectedNorm = unwrapIniUrl(expected).replace(/\\/g, "/").toLowerCase();
  if (currentNorm === expectedNorm) {
    return;
  }

  text = clearAllAdminListUrlKeys(text);
  text = setIniTextValue(text, "ServerSettings", "AdminListURL", expected);
  await writeFile(gusPath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
}

/** When the wiki list is empty, seed ids from the YARK names sidecar keys. */
async function seedLocalIdsFromNamesSidecar(
  installDir: string,
  asaMirrorRoot?: string | null,
): Promise<boolean> {
  const existing = await readAdminListIdsFromFile(installDir);
  if (existing.length > 0) return false;
  const names = await readAdminListNames(installDir);
  if (names.size === 0) return false;
  await writeAdminListIdsFile(installDir, [...names.keys()], asaMirrorRoot);
  return true;
}

/** Snapshot of admin whitelist config + current id list for the UI. */
export async function getAdminListState(
  installDir: string,
  asaMirrorRoot?: string | null,
  _loopbackBaseUrl?: string | null,
): Promise<AdminListState> {
  // Do not rewrite GUS on read — product UI is remote-URL-only for now.
  await seedLocalIdsFromNamesSidecar(installDir, asaMirrorRoot);

  const { adminListUrl, updateAllowedCheatersInterval, mode } =
    await readGusIntervalAndUrl(installDir);
  const names = await readAdminListNames(installDir);

  let ids: string[] = [];
  let listError: string | null = null;

  if (mode === "remote") {
    try {
      const text = await fetchAdminListUrlText(adminListUrl);
      ids = parseAdminListIds(text);
    } catch (error) {
      listError =
        error instanceof Error ? error.message : "Could not fetch admin list";
    }
  } else if (mode === "local") {
    try {
      ids = await readAdminListIdsFromFile(installDir);
      // Empty local file is fine when AdminListURL is blank (no remote list).
      if (
        ids.length === 0 &&
        adminListUrl.length > 0 &&
        /^file:\/\//i.test(adminListUrl)
      ) {
        listError =
          "Whitelist file is empty – add at least one EOS id, then restart.";
      }
    } catch (error) {
      listError =
        error instanceof Error ? error.message : "Could not read admin list";
    }
  } else {
    listError =
      "AdminListURL must be blank/file:// for local mode or an http(s) URL for remote.";
  }

  return {
    mode,
    adminListUrl,
    updateAllowedCheatersInterval,
    entries: entriesWithNames(ids, names),
    listError,
    ...localFileStats(installDir),
  };
}

/**
 * Writes AdminListURL + UpdateAllowedCheatersInterval to GUS.
 * Remote → quoted http(s). Blank → clears AdminListURL (optional; no local
 * file:// product path). Explicit file:// / loopback still supported for
 * Hosted Resources experiments.
 */
export async function setAdminListConfig(
  installDir: string,
  input: AdminListConfigInput,
  asaMirrorRoot?: string | null,
  loopbackBaseUrl?: string | null,
): Promise<AdminListState> {
  const mode = classifyAdminListUrl(input.adminListUrl);
  if (mode === "misconfigured") {
    throw new Error(
      "AdminListURL must be empty (local file) or an http(s) URL.",
    );
  }

  const previous = await readGusIntervalAndUrl(installDir);
  const interval = clampUpdateAllowedCheatersInterval(
    input.updateAllowedCheatersInterval,
  );
  const gusPath = gameUserSettingsIniPath(installDir);
  await mkdir(dirname(gusPath), { recursive: true });

  let text = existsSync(gusPath) ? await readFile(gusPath, "utf8") : "";
  if (text.trim().length === 0) {
    text = "[ServerSettings]\n";
  }

  // Drop every AdminListURL row so a leftover duplicate cannot keep remote mode.
  text = clearAllAdminListUrlKeys(text);
  if (mode === "local") {
    const unwrapped = unwrapIniUrl(input.adminListUrl);
    if (isBlankOrNaUrl(unwrapped)) {
      // Cleared — leave AdminListURL absent (optional; server runs without it).
    } else if (/^file:\/\//i.test(unwrapped) || isLoopbackAdminListUrl(unwrapped)) {
      await syncAdminListAsaPointer(installDir, asaMirrorRoot);
      text = setIniTextValue(
        text,
        "ServerSettings",
        "AdminListURL",
        formatLocalAdminListFileUrlForIni(installDir, {
          asaMirrorRoot,
          loopbackBaseUrl,
        }),
      );
    }
  } else {
    text = setIniTextValue(
      text,
      "ServerSettings",
      "AdminListURL",
      formatAdminListUrlForIni(input.adminListUrl),
    );
  }
  text = setIniTextValue(
    text,
    "ServerSettings",
    "UpdateAllowedCheatersInterval",
    String(interval),
  );
  await writeFile(gusPath, text.endsWith("\n") ? text : `${text}\n`, "utf8");

  if (
    mode === "local" &&
    !isBlankOrNaUrl(unwrapIniUrl(input.adminListUrl)) &&
    (/^file:\/\//i.test(unwrapIniUrl(input.adminListUrl)) ||
      isLoopbackAdminListUrl(input.adminListUrl))
  ) {
    let existing = await readAdminListIdsFromFile(installDir);
    if (
      existing.length === 0 &&
      previous.mode === "remote" &&
      previous.adminListUrl.length > 0
    ) {
      try {
        const remoteText = await fetchAdminListUrlText(previous.adminListUrl);
        const remoteIds = parseAdminListIds(remoteText);
        if (remoteIds.length > 0) {
          await writeAdminListIdsFile(installDir, remoteIds, asaMirrorRoot);
          existing = remoteIds;
        }
      } catch {
        // Seeding is best-effort; operator can still edit the local file.
      }
    }
    if (existing.length === 0) {
      await seedLocalIdsFromNamesSidecar(installDir, asaMirrorRoot);
    }
    await syncAdminListAsaPointer(installDir, asaMirrorRoot);
  }

  return getAdminListState(installDir, asaMirrorRoot, loopbackBaseUrl);
}
