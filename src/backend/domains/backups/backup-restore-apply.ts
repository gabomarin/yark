import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { isSafeMapToken } from "@shared/map-identity";
import { MAP_NAME_COPY } from "@shared/map-name-copy";
import type { BackupRecord, RestoreBackupOptions, ServerProfile } from "@shared/types";
import { isTraversableDirectoryDirent, prepareWritableDirUnderRoot } from "../../infra/fs/reparse-points";
import { extractZip, isZipBackupPath, parseBackupManifest } from "./backup-archive";
import { copyFileTo, isPlayerProfileFile, listFilesRecursive } from "./backup-package";
import {
  assertPlayersRestoreArchiveLayout,
  preferredWorldMapRestoreFolderName,
  resolveWorldRestoreMapToken as resolveWorldRestoreMapTokenPlan,
  shouldCopyWorldRestoreFile,
} from "./backup-restore";
import {
  resolveWorldMapSaveDir,
  worldMapDirNameCandidates,
} from "./world-snapshot";

function savedRootDir(server: ServerProfile): string {
  return join(server.installDir, "ShooterGame", "Saved");
}

function savedArksDir(server: ServerProfile): string {
  return join(savedRootDir(server), "SavedArks");
}

function configDir(server: ServerProfile): string {
  return join(savedRootDir(server), "Config", "WindowsServer");
}

export async function applyRestore(
  server: ServerProfile,
  backup: BackupRecord,
  options?: RestoreBackupOptions,
): Promise<void> {
  await withBackupContents(backup.path, async (root) => {
    if (backup.kind === "world") {
      await restoreWorld(server, root, backup, options);
      return;
    }
    if (backup.kind === "players") {
      await restorePlayers(server, root);
      return;
    }
    await restoreIni(server, root);
  });
}

/** Run `fn` against a folder snapshot (legacy) or an extracted ZIP staging dir. */
async function withBackupContents(
  backupPath: string,
  fn: (contentRoot: string) => Promise<void>,
): Promise<void> {
  if (!isZipBackupPath(backupPath)) {
    await fn(backupPath);
    return;
  }
  const stagingDir = join(tmpdir(), `yark-restore-${randomUUID()}`);
  try {
    await extractZip(backupPath, stagingDir);
    await fn(stagingDir);
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function restoreWorld(
  server: ServerProfile,
  backupPath: string,
  backup: BackupRecord,
  options?: RestoreBackupOptions,
): Promise<void> {
  const backupSaved = join(backupPath, "SavedArks");
  if (!existsSync(backupSaved)) {
    throw new Error("World backup is missing SavedArks data");
  }

  const mapToken = await resolveWorldRestoreMapToken(backupSaved, backup, server);
  const backupMapDir = join(backupSaved, mapToken);
  if (!existsSync(backupMapDir)) {
    throw new Error(`World backup is missing map folder ${mapToken}`);
  }

  const restoreProfilesTribes = options?.restoreProfilesTribes !== false;
  const liveSavedArks = savedArksDir(server);
  const liveResolved = await resolveWorldMapSaveDir(
    liveSavedArks,
    mapToken,
    server.mapSaveFolder,
  );
  // After a wipe the live folder is gone; prefer manifest mapFolderName (mod
  // maps often live under SavedArks/Svartalfheim/ while the ZIP uses the
  // launch token) over blindly mkdir'ing SavedArks/{mapToken}.
  let manifestFolder: string | null = null;
  try {
    const manifestRaw = await readFile(join(backupPath, "manifest.json"), "utf8");
    manifestFolder = parseBackupManifest(manifestRaw)?.mapFolderName ?? null;
  } catch {
    manifestFolder = null;
  }
  const restoreFolder =
    liveResolved?.folderName
    ?? preferredWorldMapRestoreFolderName({
      mapToken,
      mapSaveFolder: server.mapSaveFolder,
      mapFolderName: manifestFolder,
    });
  if (restoreFolder === null) {
    throw new Error(`Cannot resolve live map folder for ${mapToken}`);
  }
  const liveMapDir = liveResolved?.dir ?? join(liveSavedArks, restoreFolder);
  await prepareWritableDirUnderRoot(server.installDir, liveMapDir, {
    operationLabel: "restore world files",
  });

  const files = await listFilesRecursive(backupMapDir);
  let copied = 0;
  for (const file of files) {
    const name = basename(file);
    if (
      !shouldCopyWorldRestoreFile({
        fileName: name,
        mapToken,
        restoreProfilesTribes,
      })
    ) {
      continue;
    }
    const rel = relative(backupMapDir, file);
    await copyFileTo(file, join(liveMapDir, rel));
    copied += 1;
  }

  if (copied === 0) {
    throw new Error(`World restore found no files to apply for map ${mapToken}`);
  }
}

async function resolveWorldRestoreMapToken(
  backupSaved: string,
  backup: BackupRecord,
  server: ServerProfile,
): Promise<string> {
  const serverMap = server.map.trim();
  const serverMapPathExists =
    isSafeMapToken(serverMap) && existsSync(join(backupSaved, serverMap));

  let dirs: string[] = [];
  const needsListing =
    (backup.mapToken === null || !isSafeMapToken(backup.mapToken))
    && !serverMapPathExists;
  if (needsListing) {
    let entries;
    try {
      entries = await readdir(backupSaved, { withFileTypes: true });
    } catch {
      throw new Error("World backup SavedArks folder is unreadable");
    }
    dirs = entries
      .filter((entry) => isTraversableDirectoryDirent(entry))
      .map((entry) => entry.name);
  }

  return resolveWorldRestoreMapTokenPlan({
    backupMapToken: backup.mapToken,
    serverMap: server.map,
    serverMapPathExists,
    backupSavedDirNames: dirs,
  });
}

async function restorePlayers(
  server: ServerProfile,
  backupPath: string,
): Promise<void> {
  const profilesRoot = join(backupPath, "PlayerProfiles");
  const hasPlayerProfilesRoot = existsSync(profilesRoot);
  const files = hasPlayerProfilesRoot ? await listFilesRecursive(profilesRoot) : [];
  assertPlayersRestoreArchiveLayout({
    hasPlayerProfilesRoot,
    hasSavedArksAtBackupRoot: existsSync(join(backupPath, "SavedArks")),
    relativePathsUnderPlayerProfiles: files.map((file) => relative(profilesRoot, file)),
  });

  const destDir = await resolveLivePlayerProfileDir(server);
  await prepareWritableDirUnderRoot(server.installDir, destDir, {
    operationLabel: "restore player profiles",
  });
  let copied = 0;
  for (const file of files) {
    const name = basename(file);
    if (!isPlayerProfileFile(name)) continue;
    await copyFileTo(file, join(destDir, name));
    copied += 1;
  }
  if (copied === 0) {
    throw new Error("Players backup has no profile data");
  }
}

/** Live map folder where restored flat player profiles should land (#275). */
async function resolveLivePlayerProfileDir(server: ServerProfile): Promise<string> {
  const mapToken = server.map.trim();
  if (!isSafeMapToken(mapToken)) {
    throw new Error(MAP_NAME_COPY.mustBeSafeFolder);
  }
  const savedArks = savedArksDir(server);
  const resolved = await resolveWorldMapSaveDir(
    savedArks,
    mapToken,
    server.mapSaveFolder,
  );
  if (resolved !== null) {
    return resolved.dir;
  }
  const folderName = worldMapDirNameCandidates(mapToken, server.mapSaveFolder)[0] ?? mapToken;
  return join(savedArks, folderName);
}

async function restoreIni(
  server: ServerProfile,
  backupPath: string,
): Promise<void> {
  const backupConfig = join(backupPath, "ConfigWindowsServer");
  const live = configDir(server);
  if (!existsSync(backupConfig)) {
    throw new Error("INI backup is missing ConfigWindowsServer data");
  }
  await prepareWritableDirUnderRoot(server.installDir, live, {
    operationLabel: "restore INI files",
  });
  for (const name of ["Game.ini", "GameUserSettings.ini"] as const) {
    const src = join(backupConfig, name);
    if (!existsSync(src)) continue;
    await copyFileTo(src, join(live, name));
  }
}
