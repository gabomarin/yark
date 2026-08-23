import { existsSync } from "node:fs";
import { cp, mkdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isSafeMapToken } from "@shared/map-identity";
import type { BackupKind, ServerProfile } from "@shared/types";
import { listFilesRecursiveSafe } from "../../infra/fs/reparse-points";
import {
  collectWorldBackupCandidates,
  copySavedArksFiles,
  isPrimaryWorldSaveName,
  missingEssentialWorldRels,
  resolveWorldMapSaveDir,
  selectWorldBackupSourceFiles,
} from "./world-snapshot";

const PLAYER_PROFILE_RE = /\.(arkprofile)(\.bak)?$/i;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function savedRootDir(server: ServerProfile): string {
  return join(server.installDir, "ShooterGame", "Saved");
}

function savedArksDir(server: ServerProfile): string {
  return join(savedRootDir(server), "SavedArks");
}

function configDir(server: ServerProfile): string {
  return join(savedRootDir(server), "Config", "WindowsServer");
}

export function isPlayerProfileFile(name: string): boolean {
  return PLAYER_PROFILE_RE.test(name) || name.toLowerCase().endsWith(".profilebak");
}

export function normalizePlayerKey(value: string): string {
  return value.trim().toLowerCase().replace(/^eos:/i, "");
}

export async function listFilesRecursive(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  return listFilesRecursiveSafe(root);
}

export async function copyFileTo(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest, { force: true });
}

export async function packageKind(
  server: ServerProfile,
  kind: BackupKind,
  targetDir: string,
): Promise<{ meta: Record<string, unknown> }> {
  if (kind === "world") {
    return packageWorld(server, targetDir);
  }
  if (kind === "players") {
    return packagePlayers(server, targetDir);
  }
  return packageIni(server, targetDir);
}

async function packageWorld(
  server: ServerProfile,
  targetDir: string,
): Promise<{ meta: Record<string, unknown> }> {
  const mapToken = server.map.trim();
  if (!isSafeMapToken(mapToken)) {
    throw new Error("Server map token must be a single safe folder name");
  }

  const savedArks = savedArksDir(server);
  const resolved = await resolveWorldMapSaveDir(
    savedArks,
    mapToken,
    server.mapSaveFolder,
  );
  const dest = join(targetDir, "SavedArks", mapToken);

  if (resolved === null) {
    await mkdir(dest, { recursive: true });
    return {
      meta: {
        empty: true,
        fileCount: 0,
        savedArksPresent: existsSync(savedArks),
        mapToken,
      },
    };
  }

  const mapSourceDir = resolved.dir;

  // File-by-file copy so live Ark save rotation (e.g. .arkrbf) can be skipped
  // without failing the whole archive, while essential saves still fail loudly.
  const enumerated = await listFilesRecursive(mapSourceDir);
  if (enumerated.length === 0) {
    return {
      meta: {
        empty: true,
        fileCount: 0,
        savedArksPresent: true,
        mapToken,
        mapFolderName: resolved.folderName,
      },
    };
  }
  const candidates = await collectWorldBackupCandidates(enumerated, stat);
  const selection = selectWorldBackupSourceFiles(candidates, { mapToken });
  const sourceFiles = selection.selected.map((candidate) => candidate.path);
  const hasPrimary = sourceFiles.some((file) => isPrimaryWorldSaveName(basename(file)));
  if (!hasPrimary) {
    throw new Error(
      `No primary world save found for map ${mapToken} (${mapToken}.ark in ${resolved.folderName})`,
    );
  }

  const copyResult = await copySavedArksFiles(
    mapSourceDir,
    dest,
    sourceFiles,
    copyFileTo,
    { mapToken },
  );
  const destFiles = await listFilesRecursive(dest);
  const missing = missingEssentialWorldRels(
    mapSourceDir,
    dest,
    sourceFiles,
    destFiles,
    { mapToken },
  );
  if (missing.length > 0) {
    throw new Error(
      `World backup incomplete; missing essential save data: ${
        missing.map((rel) => basename(rel)).slice(0, 5).join(", ")
      }`,
    );
  }

  return {
    meta: {
      empty: destFiles.length === 0,
      fileCount: destFiles.length,
      savedArksPresent: true,
      mapToken,
      mapFolderName: resolved.folderName,
      copiedFileCount: copyResult.copiedFileCount,
      skippedTransientCount:
        selection.skippedTransientCount + copyResult.skippedTransientCount,
      skippedTransient: copyResult.skippedTransient,
      skippedOlderDatedCount: selection.skippedOlderDatedCount,
      retainedDatedCount: selection.retainedDatedCount,
    },
  };
}

/**
 * Flat profile snapshot used only as a same-kind `pre_restore` safeguard.
 * Manual / critical-path “all players” archives are not created (#275).
 */
async function packagePlayers(
  server: ServerProfile,
  targetDir: string,
): Promise<{ meta: Record<string, unknown> }> {
  const profilesRoot = join(targetDir, "PlayerProfiles");
  await mkdir(profilesRoot, { recursive: true });
  const sources = await collectFlatPlayerProfileSources(server);
  for (const file of sources) {
    await copyFileTo(file, join(profilesRoot, basename(file)));
  }
  return { meta: { empty: sources.length === 0, fileCount: sources.length } };
}

export async function packageSinglePlayer(
  server: ServerProfile,
  targetDir: string,
  playerKey: string,
  options?: { waitForProfile?: boolean },
): Promise<{ meta: Record<string, unknown> }> {
  const profilesRoot = join(targetDir, "PlayerProfiles");
  await mkdir(profilesRoot, { recursive: true });
  const needle = normalizePlayerKey(playerKey);
  const maxAttempts = options?.waitForProfile === true ? 8 : 1;
  let matched: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    matched = [];
    const sources = await collectFlatPlayerProfileSources(server);
    for (const file of sources) {
      const name = basename(file);
      const stem = name
        .replace(/\.(arkprofile)(\.bak)?$/i, "")
        .replace(/\.profilebak$/i, "");
      if (normalizePlayerKey(stem) !== needle) continue;
      await copyFileTo(file, join(profilesRoot, name));
      matched.push(name);
    }

    if (matched.length > 0) break;
    if (attempt < maxAttempts - 1) {
      await delay(400);
    }
  }

  return {
    meta: {
      empty: matched.length === 0,
      fileCount: matched.length,
      playerKey: needle,
      files: matched,
    },
  };
}

async function collectFlatPlayerProfileSources(server: ServerProfile): Promise<string[]> {
  const selected: string[] = [];
  const seen = new Set<string>();

  const takeFrom = async (dir: string): Promise<void> => {
    if (!existsSync(dir)) return;
    for (const file of await listFilesRecursive(dir)) {
      const name = basename(file);
      if (!isPlayerProfileFile(name)) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(file);
    }
  };

  const mapToken = server.map.trim();
  if (isSafeMapToken(mapToken)) {
    const resolved = await resolveWorldMapSaveDir(
      savedArksDir(server),
      mapToken,
      server.mapSaveFolder,
    );
    if (resolved !== null) {
      await takeFrom(resolved.dir);
    }
  }

  for (const root of playerSearchRoots(server)) {
    await takeFrom(root.path);
  }

  return selected;
}

function playerSearchRoots(server: ServerProfile): Array<{ label: string; path: string }> {
  const savedRoot = savedRootDir(server);
  return [
    { label: "SavedArks", path: savedArksDir(server) },
    { label: "SaveGames", path: join(savedRoot, "SaveGames") },
  ];
}

async function packageIni(
  server: ServerProfile,
  targetDir: string,
): Promise<{ meta: Record<string, unknown> }> {
  const config = configDir(server);
  const dest = join(targetDir, "ConfigWindowsServer");
  await mkdir(dest, { recursive: true });
  const names = ["Game.ini", "GameUserSettings.ini"] as const;
  const copied: string[] = [];
  for (const name of names) {
    const src = join(config, name);
    if (!existsSync(src)) continue;
    await copyFileTo(src, join(dest, name));
    copied.push(name);
  }
  return {
    meta: {
      empty: copied.length === 0,
      files: copied,
      configPresent: copied.length > 0,
    },
  };
}
