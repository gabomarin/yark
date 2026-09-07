import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Keep current release + one previous tag folder per GitHub repo. */
const ASA_API_CACHE_KEEP_TAG_FOLDERS = 2;

/** Sanitize a path segment for Windows-safe cache folders. */
export function sanitizeAsaApiCacheSegment(raw: string): string {
  const trimmed = raw.trim();
  const cleaned = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "unknown";
}

/** `{cacheRoot}/{repo}/{tag}/{assetFileName}` */
export function asaApiCachedZipPath(
  cacheRoot: string,
  repo: string,
  tag: string,
  assetFileName: string,
): string {
  return join(
    cacheRoot,
    sanitizeAsaApiCacheSegment(repo),
    sanitizeAsaApiCacheSegment(tag),
    sanitizeAsaApiCacheSegment(assetFileName),
  );
}

/**
 * Return cached zip path when the file exists and size matches (when known).
 * Size check avoids using a truncated/partial download.
 */
export async function resolveAsaApiCachedZip(
  cacheRoot: string,
  repo: string,
  tag: string,
  assetFileName: string,
  expectedSize: number | null,
): Promise<string | null> {
  const path = asaApiCachedZipPath(cacheRoot, repo, tag, assetFileName);
  if (!existsSync(path)) return null;
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size <= 0) return null;
    if (
      expectedSize !== null
      && expectedSize > 0
      && info.size !== expectedSize
    ) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

/**
 * Download lands in a sibling `.partial` file, then renames into place so a
 * crashed download never looks like a valid cache hit.
 */
export function asaApiCachedZipPartialPath(finalPath: string): string {
  return `${finalPath}.partial`;
}

async function ensureAsaApiCacheParent(finalPath: string): Promise<void> {
  await mkdir(dirname(finalPath), { recursive: true });
}

export async function finalizeAsaApiCacheDownload(
  partialPath: string,
  finalPath: string,
): Promise<void> {
  await ensureAsaApiCacheParent(finalPath);
  if (existsSync(finalPath)) {
    await rm(finalPath, { force: true });
  }
  await rename(partialPath, finalPath);
}

/**
 * Under `{cacheRoot}/{repo}/`, keep the newest {@link ASA_API_CACHE_KEEP_TAG_FOLDERS}
 * tag folders (by mtime) and delete the rest.
 */
export async function pruneAsaApiRepoCache(
  cacheRoot: string,
  repo: string,
  keep = ASA_API_CACHE_KEEP_TAG_FOLDERS,
): Promise<void> {
  const repoDir = join(cacheRoot, sanitizeAsaApiCacheSegment(repo));
  if (!existsSync(repoDir)) return;

  const entries = await readdir(repoDir, { withFileTypes: true });
  const tags: { name: string; mtimeMs: number }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(repoDir, entry.name);
    try {
      const info = await stat(full);
      tags.push({ name: entry.name, mtimeMs: info.mtimeMs });
    } catch {
      // skip unreadable
    }
  }
  if (tags.length <= keep) return;

  tags.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const stale of tags.slice(keep)) {
    await rm(join(repoDir, stale.name), { recursive: true, force: true }).catch(
      () => {
        // best-effort
      },
    );
  }
}

/** Delete the whole AsaApi download cache tree. */
export async function clearAsaApiDownloadCache(cacheRoot: string): Promise<void> {
  if (!existsSync(cacheRoot)) return;
  await rm(cacheRoot, { recursive: true, force: true });
  await mkdir(cacheRoot, { recursive: true });
}
