/**
 * Best-effort probe helpers for importing an existing ASA dedicated install (#254).
 * Creates no profiles — callers persist via InstanceService.importExisting.
 */

import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { flattenIniText, INI_FLAT_SEP } from "@shared/ini-text";
import { isOfficialMap, normalizeMapToken } from "@shared/map-identity";
import {
  normalizeWindowsPath,
  serverFolderName,
} from "@shared/server-install-path";
import { KNOWN_MAPS, type ImportInstallProbe, type ImportInstallSuggestions, type ServerInstallationInfo } from "@shared/types";
import { resolveMemberIdentity } from "../config/ini-compose";
import { installDirKey } from "./install-dir-safety";
import { gameUserSettingsIniPath } from "./sync-profile-ini";
import {
  inspectServerInstallationAsync,
} from "./server-installation";
import {
  isRegularFileDirent,
  isTraversableDirectoryDirent,
} from "../../infra/fs/reparse-points";

/** Profile folder already tracked by YARK (for import probe uniqueness). */
export type ManagedInstallRef = {
  name: string;
  installDir: string;
};

/** Child dir under Mods/83374: `{projectId}_{fileId}`. */
const MOD_DIR_RE = /^(\d+)_(\d+)$/;

/** Optional `-mods=a,b,c` leftovers in INI / launch text. */
const MODS_ARG_RE = /(?:^|[\s"'])-mods=([0-9,]+)/i;

export type { ImportInstallProbe, ImportInstallSuggestions };

const DEFAULT_IDENTITY = {
  maxPlayers: 70,
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  /** Empty when GUS has no admin password — wizard requires ≥4 chars before import. */
  adminPassword: "",
  serverPassword: null as string | null,
} as const;

function flatLookup(
  flat: Record<string, string>,
  section: string,
  key: string,
): string | undefined {
  const exact = flat[`${section}${INI_FLAT_SEP}${key}`];
  if (exact !== undefined) {
    return exact;
  }
  const sectionLower = section.toLowerCase();
  const keyLower = key.toLowerCase();
  for (const [flatKey, value] of Object.entries(flat)) {
    const sep = flatKey.indexOf(INI_FLAT_SEP);
    if (sep < 0) continue;
    if (
      flatKey.slice(0, sep).toLowerCase() === sectionLower &&
      flatKey.slice(sep + INI_FLAT_SEP.length).toLowerCase() === keyLower
    ) {
      return value;
    }
  }
  return undefined;
}

function leafFolderName(installDir: string): string {
  const normalized = normalizeWindowsPath(installDir);
  const parts = normalized.split("\\").filter((p) => p.length > 0);
  return parts[parts.length - 1] ?? "Server";
}

/**
 * If `selected` is under a `ShooterGame` path segment, return the dedicated root
 * (the folder that should contain `ShooterGame` as a child).
 *
 * Examples:
 * - `D:\Servers\LostColony\ShooterGame\Binaries\Win64` → `D:\Servers\LostColony`
 * - `D:\Servers\LostColony\ShooterGame` → `D:\Servers\LostColony`
 * - `D:\Servers\LostColony` → not nested
 */
export function resolveNestedAsaInstallRoot(selected: string): {
  nestedSubfolder: boolean;
  suggestedInstallDir: string | null;
} {
  const normalized = normalizeWindowsPath(selected);
  if (normalized.length === 0) {
    return { nestedSubfolder: false, suggestedInstallDir: null };
  }

  const unc = normalized.startsWith("\\\\");
  const parts = unc
    ? normalized.slice(2).split("\\").filter((p) => p.length > 0)
    : normalized.split("\\").filter((p) => p.length > 0);

  const shooterIdx = parts.findIndex(
    (part) => part.toLowerCase() === "shootergame",
  );
  if (shooterIdx < 0) {
    return { nestedSubfolder: false, suggestedInstallDir: null };
  }
  if (shooterIdx === 0) {
    return { nestedSubfolder: true, suggestedInstallDir: null };
  }

  const rootParts = parts.slice(0, shooterIdx);
  let suggested: string;
  if (unc) {
    suggested = `\\\\${rootParts.join("\\")}`;
  } else if (/^[a-zA-Z]:$/.test(rootParts[0] ?? "")) {
    const rest = rootParts.slice(1).join("\\");
    suggested = rest.length > 0 ? `${rootParts[0]}\\${rest}` : `${rootParts[0]}\\`;
  } else {
    suggested = rootParts.join("\\");
  }

  const suggestedNorm = normalizeWindowsPath(suggested);
  if (suggestedNorm.toLowerCase() === normalized.toLowerCase()) {
    return { nestedSubfolder: false, suggestedInstallDir: null };
  }
  return { nestedSubfolder: true, suggestedInstallDir: suggestedNorm };
}

function asaNestedGuidance(suggestedInstallDir: string | null): string {
  return suggestedInstallDir !== null
    ? `This is inside an ASA install. Select ${suggestedInstallDir} (the folder that contains ShooterGame).`
    : "This is inside an ASA install. Select the folder that contains ShooterGame.";
}

function shouldStopAncestorWalk(dir: string): boolean {
  const trimmed = dir.replace(/[/\\]+$/, "");
  if (trimmed.length === 0 || trimmed === "/" || /^[a-zA-Z]:$/i.test(trimmed)) {
    return true;
  }
  return dirname(dir) === dir;
}

function isUncShareRoot(dir: string): boolean {
  const win = normalizeWindowsPath(dir);
  if (!win.startsWith("\\\\")) {
    return false;
  }
  const parts = win.slice(2).split("\\").filter((part) => part.length > 0);
  return parts.length === 2;
}

async function hasShooterGameChild(dir: string): Promise<boolean> {
  try {
    const st = await stat(join(dir, "ShooterGame"));
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walk parents on disk looking for an unmanaged ASA dedicated root
 * (folder that contains a `ShooterGame` directory). Does not use path
 * segments — covers `C:\ExistingASA\NewServer` when NewServer does not exist yet.
 * Stops at drive roots; still checks a UNC share root (`\\nas\ark`).
 */
export async function findAsaInstallAncestorOnDisk(
  installDir: string,
): Promise<string | null> {
  const start = installDir.trim();
  if (start.length === 0) {
    return null;
  }
  let current = start;
  const seen = new Set<string>();
  while (true) {
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    const key = parent.toLowerCase();
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);
    if (shouldStopAncestorWalk(parent)) {
      return null;
    }
    if (await hasShooterGameChild(parent)) {
      return parent;
    }
    if (isUncShareRoot(parent)) {
      return null;
    }
    current = parent;
  }
}

/** Reject nested paths under ShooterGame for importExisting (do not trust the renderer). */
export function assertImportNotNested(installDir: string): void {
  const nested = resolveNestedAsaInstallRoot(installDir);
  if (!nested.nestedSubfolder) return;
  throw new Error(asaNestedGuidance(nested.suggestedInstallDir));
}

/**
 * Segment check plus on-disk ancestor walk. Use for create/clone/move/import
 * so unmanaged ASA parents are rejected without blocking the event loop.
 */
export async function assertNotInsideAsaInstall(installDir: string): Promise<void> {
  assertImportNotNested(installDir);
  const ancestor = await findAsaInstallAncestorOnDisk(installDir);
  if (ancestor === null) {
    return;
  }
  throw new Error(asaNestedGuidance(ancestor));
}

function emptySuggestions(installDir: string): ImportInstallSuggestions {
  return {
    name: leafFolderName(installDir),
    sessionName: leafFolderName(installDir),
    map: KNOWN_MAPS[0],
    mapModId: null,
    maxPlayers: DEFAULT_IDENTITY.maxPlayers,
    gamePort: DEFAULT_IDENTITY.gamePort,
    queryPort: DEFAULT_IDENTITY.queryPort,
    rconPort: DEFAULT_IDENTITY.rconPort,
    adminPassword: DEFAULT_IDENTITY.adminPassword,
    serverPassword: null,
    mods: [],
  };
}

function suggestProfileName(installDir: string, sessionName: string): string {
  const leaf = leafFolderName(installDir);
  if (serverFolderName(leaf).length > 0) {
    return leaf;
  }
  const fromSession = sessionName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return fromSession.length > 0 ? fromSession.slice(0, 64) : "ImportedServer";
}

/** Collect unique Project IDs from an ASA Mods/83374 tree. */
export async function collectModProjectIdsFromTree(
  mods83374Dir: string,
): Promise<string[]> {
  if (!existsSync(mods83374Dir)) {
    return [];
  }
  let entries: string[];
  try {
    entries = await readdir(mods83374Dir);
  } catch {
    return [];
  }
  const ids = new Set<string>();
  for (const entry of entries) {
    const match = MOD_DIR_RE.exec(entry);
    if (match !== null) {
      ids.add(match[1]!);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Primary: `{installDir}/ShooterGame/Binaries/Win64/ShooterGame/Mods/83374/`
 * Secondary: `{installDir}/ShooterGame/Mods/83374/`
 */
export async function discoverAsaModProjectIds(
  installDir: string,
): Promise<string[]> {
  const root = normalizeWindowsPath(installDir);
  const primary = join(
    root,
    "ShooterGame",
    "Binaries",
    "Win64",
    "ShooterGame",
    "Mods",
    "83374",
  );
  const secondary = join(root, "ShooterGame", "Mods", "83374");
  const fromPrimary = await collectModProjectIdsFromTree(primary);
  const fromSecondary = await collectModProjectIdsFromTree(secondary);
  const merged = new Set([...fromPrimary, ...fromSecondary]);
  return [...merged].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

export function extractModIdsFromText(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(new RegExp(MODS_ARG_RE.source, "gi"))) {
    const list = match[1] ?? "";
    for (const part of list.split(",")) {
      const id = part.trim();
      if (/^\d+$/.test(id)) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

function suggestMapFromText(text: string): string | null {
  const tokens = new Set<string>(KNOWN_MAPS);
  // Prefer longer / more specific tokens first.
  const sorted = [...tokens].sort((a, b) => b.length - a.length);
  for (const token of sorted) {
    if (text.includes(token)) {
      return token;
    }
  }
  // Custom *_WP tokens in filenames / leftovers.
  const custom = text.match(/\b([A-Za-z][A-Za-z0-9]*_WP)\b/);
  if (custom !== null) {
    return normalizeMapToken(custom[1]!);
  }
  return null;
}

/**
 * Map launch token from a world `.ark` filename
 * (`TheIsland_WP.ark` or timestamped `TheIsland_WP_24.07.2025_21.51.53.ark`).
 */
export function mapTokenFromWorldSaveName(fileName: string): string | null {
  const baseName = basename(fileName);
  if (!/\.ark$/i.test(baseName)) {
    return null;
  }
  const lower = baseName.toLowerCase();
  if (
    lower.endsWith(".arktribe") ||
    lower.endsWith(".arkprofile") ||
    lower.endsWith(".arkprofile.bak") ||
    lower.endsWith(".arkrbf")
  ) {
    return null;
  }
  const stem = baseName.replace(/\.ark$/i, "");
  const known = [...KNOWN_MAPS].sort((a, b) => b.length - a.length);
  for (const token of known) {
    if (stem === token || stem.startsWith(`${token}_`)) {
      return token;
    }
  }
  const custom = stem.match(/^([A-Za-z][A-Za-z0-9]*_WP)(?:_|$)/);
  if (custom !== null) {
    return normalizeMapToken(custom[1]!);
  }
  return null;
}

type WorldSaveCandidate = {
  map: string;
  mtimeMs: number;
};

async function collectWorldSaveCandidates(
  dir: string,
): Promise<WorldSaveCandidate[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: WorldSaveCandidate[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (isRegularFileDirent(entry)) {
      const map = mapTokenFromWorldSaveName(entry.name);
      if (map === null) continue;
      try {
        const info = await stat(full);
        out.push({ map, mtimeMs: info.mtimeMs });
      } catch {
        // skip unreadable
      }
      continue;
    }
    if (isTraversableDirectoryDirent(entry)) {
      // Scan one level of nest (SavedArks/<folder>/*.ark). Mod maps often use
      // short folder names (e.g. Svartalfheim/) that are not themselves MapTokens.
      let nested;
      try {
        nested = await readdir(full, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const child of nested) {
        if (!isRegularFileDirent(child)) continue;
        const map = mapTokenFromWorldSaveName(child.name);
        if (map === null) continue;
        try {
          const info = await stat(join(full, child.name));
          out.push({ map, mtimeMs: info.mtimeMs });
        } catch {
          // skip
        }
      }
    }
  }
  return out;
}

/**
 * Prefer the map of the newest world `.ark` under SavedArks (mtime).
 * Falls back to any map token found in filenames when stats fail.
 */
export async function suggestMapFromSavedArks(
  installDir: string,
): Promise<string | null> {
  const savedArks = join(
    normalizeWindowsPath(installDir),
    "ShooterGame",
    "Saved",
    "SavedArks",
  );
  if (!existsSync(savedArks)) {
    return null;
  }
  const candidates = await collectWorldSaveCandidates(savedArks);
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]!.map;
}

export async function buildImportSuggestions(
  installDir: string,
): Promise<ImportInstallSuggestions> {
  const normalized = normalizeWindowsPath(installDir);
  const gusPath = gameUserSettingsIniPath(normalized);
  let gusText = "";
  if (existsSync(gusPath)) {
    try {
      gusText = await readFile(gusPath, "utf8");
    } catch {
      gusText = "";
    }
  }

  const identity = resolveMemberIdentity(
    {
      sessionName: leafFolderName(normalized),
      maxPlayers: DEFAULT_IDENTITY.maxPlayers,
      gamePort: DEFAULT_IDENTITY.gamePort,
      queryPort: DEFAULT_IDENTITY.queryPort,
      rconPort: DEFAULT_IDENTITY.rconPort,
      adminPassword: DEFAULT_IDENTITY.adminPassword,
      serverPassword: DEFAULT_IDENTITY.serverPassword,
    },
    gusText.length > 0 ? gusText : undefined,
  );

  const flat = gusText.length > 0 ? flattenIniText(gusText) : {};
  const sessionFromIni = flatLookup(flat, "SessionSettings", "SessionName");
  const sessionName =
    (sessionFromIni !== undefined && sessionFromIni.trim().length > 0
      ? sessionFromIni.trim()
      : identity.sessionName) || leafFolderName(normalized);

  const fromTree = await discoverAsaModProjectIds(normalized);
  const fromText = extractModIdsFromText(gusText);
  const mods = [...new Set([...fromTree, ...fromText])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  const mapFromSaved = await suggestMapFromSavedArks(normalized);
  const mapFromIni = suggestMapFromText(gusText);
  const mapRaw = mapFromSaved ?? mapFromIni ?? KNOWN_MAPS[0];
  const map = isOfficialMap(mapRaw) ? mapRaw : normalizeMapToken(mapRaw);

  return {
    name: suggestProfileName(normalized, sessionName),
    sessionName,
    map,
    mapModId: null,
    maxPlayers: identity.maxPlayers,
    gamePort: identity.gamePort,
    queryPort: identity.queryPort,
    rconPort: identity.rconPort,
    adminPassword: identity.adminPassword,
    serverPassword:
      identity.serverPassword !== null && identity.serverPassword.length > 0
        ? identity.serverPassword
        : null,
    mods,
  };
}

export function classifyImportContinue(
  health: ServerInstallationInfo["health"],
): { canContinue: boolean } {
  return { canContinue: health === "ready" };
}

/** Incomplete ASA trees may be imported only with an explicit opt-in (#283). */
export function isImportIncompleteEligible(
  health: ServerInstallationInfo["health"],
): boolean {
  return health === "incomplete";
}

/**
 * Whether probe suggestions should be built for this health.
 * Ready and incomplete both carry GUS/mods/SavedArks hints for the wizard (#283).
 */
export function shouldBuildImportSuggestions(
  health: ServerInstallationInfo["health"],
): boolean {
  return health === "ready" || health === "incomplete";
}

/**
 * Enforce import health gate for `importExisting` (do not trust the renderer).
 * Ready always allowed; incomplete only with `allowIncompleteInstall`.
 */
export function assertImportHealthAllowed(
  health: ServerInstallationInfo["health"],
  options?: { allowIncompleteInstall?: boolean },
  guidance?: string | null,
): void {
  if (health === "ready") return;
  if (
    health === "incomplete" &&
    options?.allowIncompleteInstall === true
  ) {
    return;
  }
  throw new Error(
    guidance ||
      (health === "incomplete"
        ? "Folder is an incomplete ASA install. Check “Import anyway” to adopt it and finish with Install/Verify, or pick a ready folder."
        : `Folder is not a ready ASA dedicated root (health: ${health}). Pick the folder that contains ShooterGame.`),
  );
}

/** Exact install-folder match against existing YARK profiles (case-insensitive). */
export function findManagedInstallClash(
  installDir: string,
  managed: readonly ManagedInstallRef[],
): ManagedInstallRef | null {
  const target = installDirKey(normalizeWindowsPath(installDir));
  if (target.length === 0) {
    return null;
  }
  for (const profile of managed) {
    if (installDirKey(normalizeWindowsPath(profile.installDir)) === target) {
      return profile;
    }
  }
  return null;
}

function managedImportProbe(
  normalized: string,
  clash: ManagedInstallRef,
  installation: ServerInstallationInfo,
): ImportInstallProbe {
  return {
    installDir: normalized,
    installation: {
      ...installation,
      health: "suspicious",
      installed: true,
      reasonCodes: ["foreign_contents"],
      guidance: `This folder is already managed by YARK as "${clash.name}". Open that server or choose a different install.`,
    },
    suggestions: emptySuggestions(normalized),
    canContinue: false,
    nestedSubfolder: false,
    suggestedInstallDir: null,
    alreadyManagedBy: clash.name,
  };
}

export async function probeImportInstall(
  installDir: string,
  managed: readonly ManagedInstallRef[] = [],
): Promise<ImportInstallProbe> {
  const normalized = normalizeWindowsPath(installDir);
  if (normalized.length === 0) {
    throw new Error("Install folder required");
  }

  const clash = findManagedInstallClash(normalized, managed);
  if (clash !== null) {
    const installation = await inspectServerInstallationAsync(
      `import:${basename(normalized)}`,
      normalized,
      { bypassCache: true },
    );
    return managedImportProbe(normalized, clash, installation);
  }

  const nested = resolveNestedAsaInstallRoot(normalized);
  const ancestor =
    nested.nestedSubfolder
      ? null
      : await findAsaInstallAncestorOnDisk(normalized);
  const suggested =
    nested.nestedSubfolder
      ? nested.suggestedInstallDir
      : ancestor;
  if (nested.nestedSubfolder || ancestor !== null) {
    const guidance = asaNestedGuidance(suggested);
    const installation = await inspectServerInstallationAsync(
      `import:${basename(normalized)}`,
      normalized,
      { bypassCache: true },
    );
    return {
      installDir: normalized,
      installation: {
        ...installation,
        health: "suspicious",
        installed: false,
        reasonCodes: ["foreign_contents"],
        guidance,
      },
      suggestions: emptySuggestions(normalized),
      canContinue: false,
      nestedSubfolder: true,
      suggestedInstallDir: suggested,
      alreadyManagedBy: null,
    };
  }

  const installation = await inspectServerInstallationAsync(
    `import:${basename(normalized)}`,
    normalized,
    { bypassCache: true },
  );
  const gate = classifyImportContinue(installation.health);
  const suggestions = shouldBuildImportSuggestions(installation.health)
    ? await buildImportSuggestions(normalized)
    : emptySuggestions(normalized);
  return {
    installDir: normalized,
    installation,
    suggestions,
    canContinue: gate.canContinue,
    nestedSubfolder: false,
    suggestedInstallDir: null,
    alreadyManagedBy: null,
  };
}
