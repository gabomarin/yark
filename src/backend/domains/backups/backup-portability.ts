import type { BackupKind, BackupType } from "@shared/types";
import { isZipBackupPath, kindFromSubdirName } from "./backup-archive";

/** Filename slug for server names in create/import ZIP names (#146). */
export function slugBackupFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function guessBackupKindFromName(name: string): BackupKind | null {
  const lower = name.toLowerCase();
  if (lower.includes("-players-") || lower.includes("player_")) return "players";
  if (lower.includes("-ini-") || lower.includes("ini_save")) return "ini";
  if (lower.includes("-world-")) return "world";
  return null;
}

export function guessBackupTypeFromName(name: string): BackupType {
  const lower = name.toLowerCase();
  if (lower.includes("player_disconnect")) return "player_disconnect";
  if (lower.includes("player_connect")) return "player_connect";
  if (lower.includes("ini_save")) return "ini_save";
  if (lower.includes("scheduled")) return "scheduled";
  if (lower.includes("pre_update")) return "pre_update";
  if (lower.includes("pre_stop")) return "pre_stop";
  if (lower.includes("pre_restart")) return "pre_restart";
  if (lower.includes("pre_restore")) return "pre_restore";
  return "manual";
}

/** Ensure an export destination path ends with `.zip`. */
export function resolveExportZipDestination(destinationPath: string): string {
  return isZipBackupPath(destinationPath) ? destinationPath : `${destinationPath}.zip`;
}

export function buildImportedZipFileName(input: {
  serverName: string;
  kind: BackupKind;
  stamp: string;
}): string {
  return `${slugBackupFilePart(input.serverName)}-${input.kind}-imported-${input.stamp}.zip`;
}

export function folderLooksLikeBackupArchive(flags: {
  hasManifest: boolean;
  hasSavedArks: boolean;
  hasPlayerProfiles: boolean;
  hasConfigWindowsServer: boolean;
}): boolean {
  return (
    flags.hasManifest
    || flags.hasSavedArks
    || flags.hasPlayerProfiles
    || flags.hasConfigWindowsServer
  );
}

export function resolveImportEntryKind(
  defaultKind: BackupKind | null,
  entryName: string,
): BackupKind {
  return defaultKind ?? guessBackupKindFromName(entryName) ?? "world";
}

/** Skip World / Player profiles / INI when scanning the backup root. */
export function shouldSkipKindSubdirOnRootScan(
  isDirectory: boolean,
  defaultKind: BackupKind | null,
  entryName: string,
): boolean {
  return isDirectory && defaultKind === null && kindFromSubdirName(entryName) !== null;
}

/**
 * Keep the manifest id when free; mint a new one (undefined) when already taken.
 */
export function resolveImportedBackupId(
  manifestId: string | undefined,
  idAlreadyTaken: boolean,
): string | undefined {
  if (manifestId === undefined) return undefined;
  return idAlreadyTaken ? undefined : manifestId;
}

export function portableImportNotes(sourceBasename: string): string {
  return `Imported portable archive: ${sourceBasename}`;
}

export function diskImportNotes(sourceBasename: string): string {
  return `Imported from disk: ${sourceBasename}`;
}
