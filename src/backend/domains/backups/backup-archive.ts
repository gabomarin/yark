import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import type { BackupKind } from "@shared/types";
import yazl from "yazl";
import yauzl from "yauzl";

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
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/** Zip the contents of `sourceDir` into `zipPath` (paths inside the zip are relative to sourceDir). */
export async function zipDirectory(sourceDir: string, zipPath: string): Promise<number> {
  await mkdir(dirname(zipPath), { recursive: true });
  const files = await listFilesRecursive(sourceDir);
  const zipfile = new yazl.ZipFile();

  for (const file of files) {
    const entryName = relative(sourceDir, file).split(sep).join("/");
    if (entryName.length === 0) continue;
    zipfile.addFile(file, entryName);
  }

  zipfile.end();

  await pipeline(zipfile.outputStream, createWriteStream(zipPath));
  const info = await stat(zipPath);
  return info.size;
}

/** Extract a zip archive into `destDir` (created if missing). */
export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });

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

      zipfile.readEntry();
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
      zipfile.readEntry();
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
    });
  });
}

export function archiveDisplayName(path: string): string {
  return basename(path);
}
