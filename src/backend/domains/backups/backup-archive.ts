import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import type { BackupKind } from "@shared/types";
import yazl from "yazl";
import yauzl from "yauzl";
import {
  assertDestAndParentNotReparsePoints,
  assertNoReparsePointsUnderRoot,
  listFilesRecursiveSafe,
} from "../../infra/fs/reparse-points";
import { ensureParentDir } from "./backup-disk";

/** Resolve an entry path under destDir, rejecting zip-slip (`../`, absolute paths). */
export function safeExtractTarget(destDir: string, entryName: string): string {
  const destResolved = resolve(destDir);
  // Normalize zip separators; reject absolute / drive-rooted names before join.
  const normalized = entryName.replace(/\\/g, "/");
  if (
    normalized.length === 0
    || isAbsolute(normalized)
    || /^[a-zA-Z]:/.test(normalized)
    || normalized.split("/").includes("..")
  ) {
    throw new Error(`Unsafe zip entry path: ${entryName}`);
  }
  const target = resolve(destDir, normalized);
  const rel = relative(destResolved, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Unsafe zip entry path: ${entryName}`);
  }
  return target;
}

/** On-disk subfolder under the backup root for each kind. */
export function backupKindSubdir(kind: BackupKind): string {
  if (kind === "world") return "World";
  if (kind === "players") return "Player profiles";
  return "INI";
}

export function isZipBackupPath(path: string): boolean {
  return path.toLowerCase().endsWith(".zip");
}

export function kindFromSubdirName(name: string): BackupKind | null {
  const normalized = name.trim().toLowerCase();
  if (normalized === "world") return "world";
  if (normalized === "player profiles" || normalized === "players") return "players";
  if (normalized === "ini" || normalized === "inis") return "ini";
  return null;
}

async function listFilesRecursive(root: string): Promise<string[]> {
  return listFilesRecursiveSafe(root);
}

/**
 * ASA save blobs are already dense; use zlib level 4 (moderate) instead of the
 * yazl default (6) when packaging world/players archives.
 */
export const ASA_SAVE_ZIP_COMPRESSION_LEVEL = 4;

export function isAsaSaveBlobZipEntry(entryName: string): boolean {
  const lower = basename(entryName).toLowerCase();
  return (
    lower.endsWith(".ark")
    || lower.endsWith(".ark.bak")
    || lower.endsWith(".arktribe")
    || lower.endsWith(".tribebak")
    || lower.endsWith(".arkprofile")
    || lower.endsWith(".arkprofile.bak")
    || lower.endsWith(".profilebak")
  );
}

/** Zip the contents of `sourceDir` into `zipPath` (paths inside the zip are relative to sourceDir). */
export async function zipDirectory(
  sourceDir: string,
  zipPath: string,
  options?: { lightCompressBinarySaves?: boolean },
): Promise<number> {
  await ensureParentDir(zipPath);
  const files = await listFilesRecursive(sourceDir);
  const zipfile = new yazl.ZipFile();
  const lightCompressBinarySaves = options?.lightCompressBinarySaves === true;

  for (const file of files) {
    const entryName = relative(sourceDir, file).split(sep).join("/");
    if (entryName.length === 0) continue;
    if (lightCompressBinarySaves && isAsaSaveBlobZipEntry(entryName)) {
      zipfile.addFile(file, entryName, {
        compress: true,
        compressionLevel: ASA_SAVE_ZIP_COMPRESSION_LEVEL,
      });
    } else {
      zipfile.addFile(file, entryName);
    }
  }

  zipfile.end();

  await pipeline(zipfile.outputStream, createWriteStream(zipPath));
  const info = await stat(zipPath);
  return info.size;
}

/** Extract a zip archive into `destDir` (created if missing). */
export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await assertDestAndParentNotReparsePoints(destDir, {
    operationLabel: "extract this backup",
  });
  await mkdir(destDir, { recursive: true });
  await assertNoReparsePointsUnderRoot(destDir, {
    operationLabel: "extract this backup",
  });

  await new Promise<void>((resolvePromise, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
      if (openErr !== null || zipfile === undefined) {
        reject(openErr ?? new Error("Could not open zip archive"));
        return;
      }

      let settled = false;
      const fail = (err: unknown): void => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const succeed = (): void => {
        if (settled) return;
        settled = true;
        zipfile.close();
        resolvePromise();
      };

      // Register listeners before readEntry — empty archives can emit "end"
      // synchronously on the first readEntry under lazyEntries.
      zipfile.on("entry", (entry: yauzl.Entry) => {
        let target: string;
        try {
          target = safeExtractTarget(destDir, entry.fileName);
        } catch (err) {
          fail(err);
          return;
        }

        if (/\/$/.test(entry.fileName)) {
          void mkdir(target, { recursive: true })
            .then(() => zipfile.readEntry())
            .catch(fail);
          return;
        }

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr !== null || readStream === undefined) {
            fail(streamErr ?? new Error(`Could not read zip entry ${entry.fileName}`));
            return;
          }
          void mkdir(dirname(target), { recursive: true })
            .then(async () => {
              await pipeline(readStream, createWriteStream(target));
              zipfile.readEntry();
            })
            .catch(fail);
        });
      });

      zipfile.on("end", () => succeed());
      zipfile.on("error", fail);
      zipfile.readEntry();
    });
  });
}

/** Read a UTF-8 text file from inside a zip without full extract. */
export async function readZipTextEntry(
  zipPath: string,
  entryName: string,
): Promise<string | null> {
  const normalizedWanted = entryName.split(sep).join("/");

  return await new Promise<string | null>((resolvePromise, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
      if (openErr !== null || zipfile === undefined) {
        reject(openErr ?? new Error("Could not open zip archive"));
        return;
      }

      let settled = false;
      const fail = (err: unknown): void => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const succeed = (value: string | null): void => {
        if (settled) return;
        settled = true;
        zipfile.close();
        resolvePromise(value);
      };

      let found = false;
      // Attach listeners before the first read — lazyEntries may emit synchronously.
      zipfile.on("entry", (entry: yauzl.Entry) => {
        const name = entry.fileName.split(sep).join("/");
        if (name !== normalizedWanted) {
          zipfile.readEntry();
          return;
        }
        found = true;
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr !== null || readStream === undefined) {
            fail(streamErr ?? new Error(`Could not read ${entryName}`));
            return;
          }
          const chunks: Buffer[] = [];
          readStream.on("data", (chunk: Buffer) => chunks.push(chunk));
          readStream.on("end", () => {
            succeed(Buffer.concat(chunks).toString("utf8"));
          });
          readStream.on("error", fail);
        });
      });
      zipfile.on("end", () => {
        if (!found) succeed(null);
      });
      zipfile.on("error", fail);
      zipfile.readEntry();
    });
  });
}

export function archiveDisplayName(path: string): string {
  return basename(path);
}

/**
 * True when `zipPath` is a readable zip (central directory present).
 * Rejects empty files and in-progress yazl writes that lack a valid EOCD.
 */
export async function isReadableZipArchive(zipPath: string): Promise<boolean> {
  try {
    const info = await stat(zipPath);
    if (!info.isFile() || info.size <= 0) return false;
  } catch {
    return false;
  }

  return await new Promise<boolean>((resolvePromise) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
      if (openErr !== null || zipfile === undefined) {
        resolvePromise(false);
        return;
      }
      zipfile.close();
      resolvePromise(true);
    });
  });
}

function isBackupLayoutZipEntry(entryName: string): boolean {
  const name = entryName.replace(/\\/g, "/");
  if (name === "manifest.json") return true;
  if (name === "SavedArks" || name.startsWith("SavedArks/")) return true;
  if (name === "PlayerProfiles" || name.startsWith("PlayerProfiles/")) return true;
  if (name === "ConfigWindowsServer" || name.startsWith("ConfigWindowsServer/")) {
    return true;
  }
  return false;
}

/**
 * True when the zip looks like a YARK/legacy backup (manifest or known layout
 * roots). Unrelated archives under the backup tree must not be imported.
 */
export async function zipHasBackupLayout(zipPath: string): Promise<boolean> {
  return await new Promise<boolean>((resolvePromise) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
      if (openErr !== null || zipfile === undefined) {
        resolvePromise(false);
        return;
      }

      let settled = false;
      const finish = (value: boolean): void => {
        if (settled) return;
        settled = true;
        zipfile.close();
        resolvePromise(value);
      };

      zipfile.on("entry", (entry: yauzl.Entry) => {
        if (isBackupLayoutZipEntry(entry.fileName)) {
          finish(true);
          return;
        }
        zipfile.readEntry();
      });
      zipfile.on("end", () => finish(false));
      zipfile.on("error", () => finish(false));
      zipfile.readEntry();
    });
  });
}

/** Kind payload root expected inside a portable YARK ZIP. */
export function kindPayloadPrefix(kind: BackupKind): string {
  if (kind === "world") return "SavedArks";
  if (kind === "players") return "PlayerProfiles";
  return "ConfigWindowsServer";
}

function isUnsafeZipEntryName(entryName: string): boolean {
  const normalized = entryName.replace(/\\/g, "/");
  if (normalized.length === 0) return true;
  if (isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) return true;
  if (normalized.split("/").includes("..")) return true;
  return false;
}

/** Unix symlink bit in the high 16 bits of ZIP external attributes. */
function isZipSymlinkEntry(entry: yauzl.Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return unixMode !== 0 && (unixMode & 0xf000) === 0xa000;
}

function entryMatchesKindPayload(entryName: string, kind: BackupKind): boolean {
  const name = entryName.replace(/\\/g, "/");
  const prefix = kindPayloadPrefix(kind);
  return name === prefix || name.startsWith(`${prefix}/`);
}

export interface PortableZipValidation {
  /** Kind declared in manifest.json when present and valid. */
  manifestKind: BackupKind | null;
}

/**
 * Validate a portable YARK ZIP before cataloging.
 * Rejects corrupt archives, zip-slip / absolute paths, symlinks, and kind mismatch.
 */
export async function validatePortableZip(
  zipPath: string,
  expectedKind: BackupKind,
): Promise<PortableZipValidation> {
  if (!isZipBackupPath(zipPath)) {
    throw new Error("Import requires a .zip archive");
  }
  const readable = await isReadableZipArchive(zipPath);
  if (!readable) {
    throw new Error("Archive is corrupt or unreadable");
  }

  return await new Promise<PortableZipValidation>((resolvePromise, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
      if (openErr !== null || zipfile === undefined) {
        reject(openErr ?? new Error("Could not open zip archive"));
        return;
      }

      let settled = false;
      let hasKindPayload = false;
      let manifestRaw: string | null = null;
      const fail = (err: unknown): void => {
        if (settled) return;
        settled = true;
        zipfile.close();
        const message = err instanceof Error ? err.message : String(err);
        if (/invalid relative path/i.test(message)) {
          reject(new Error(`Unsafe zip entry path: ${message}`));
          return;
        }
        reject(err instanceof Error ? err : new Error(message));
      };
      const succeed = (value: PortableZipValidation): void => {
        if (settled) return;
        settled = true;
        zipfile.close();
        resolvePromise(value);
      };

      zipfile.on("entry", (entry: yauzl.Entry) => {
        if (isUnsafeZipEntryName(entry.fileName)) {
          fail(new Error(`Unsafe zip entry path: ${entry.fileName}`));
          return;
        }
        if (isZipSymlinkEntry(entry)) {
          fail(new Error(`Zip contains symlink entry: ${entry.fileName}`));
          return;
        }

        const name = entry.fileName.replace(/\\/g, "/");
        if (entryMatchesKindPayload(name, expectedKind)) {
          hasKindPayload = true;
        }

        if (name === "manifest.json" && !/\/$/.test(entry.fileName)) {
          zipfile.openReadStream(entry, (streamErr, readStream) => {
            if (streamErr !== null || readStream === undefined) {
              fail(streamErr ?? new Error("Could not read manifest.json"));
              return;
            }
            const chunks: Buffer[] = [];
            readStream.on("data", (chunk: Buffer) => chunks.push(chunk));
            readStream.on("end", () => {
              manifestRaw = Buffer.concat(chunks).toString("utf8");
              zipfile.readEntry();
            });
            readStream.on("error", fail);
          });
          return;
        }

        zipfile.readEntry();
      });

      zipfile.on("end", () => {
        if (!hasKindPayload) {
          fail(
            new Error(
              `Archive is missing expected ${kindPayloadPrefix(expectedKind)}/ content for ${expectedKind} backups`,
            ),
          );
          return;
        }

        let manifestKind: BackupKind | null = null;
        if (manifestRaw !== null && manifestRaw.trim().length > 0) {
          try {
            const data = JSON.parse(manifestRaw) as {
              backup?: { kind?: string };
            };
            const kind = data.backup?.kind;
            if (kind === "world" || kind === "players" || kind === "ini") {
              manifestKind = kind;
            }
          } catch {
            fail(new Error("Archive manifest.json is not valid JSON"));
            return;
          }
        }

        if (manifestKind !== null && manifestKind !== expectedKind) {
          fail(
            new Error(
              `Archive kind is ${manifestKind}, but import target is ${expectedKind}`,
            ),
          );
          return;
        }

        succeed({ manifestKind });
      });
      zipfile.on("error", fail);
      zipfile.readEntry();
    });
  });
}
