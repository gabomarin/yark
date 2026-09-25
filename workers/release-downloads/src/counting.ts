/**
 * Pure counting helpers for the release downloads worker.
 *
 * Deliberately free of Cloudflare runtime types: the root Vitest suite imports
 * these, and pulling the worker entrypoint (which uses `KVNamespace`,
 * `ScheduledController`, `ExportedHandler`) into the main `tsc --noEmit`
 * program would fail, since the root tsconfig only loads `@types/node`.
 */

export interface GitHubAsset {
  name: string;
  download_count: number;
}

export interface GitHubRelease {
  assets?: GitHubAsset[];
}

const EXE_SUFFIX = ".exe";

/** Sum `download_count` for assets whose name ends in `.exe`. */
export function sumExeDownloads(releases: readonly GitHubRelease[]): number {
  let total = 0;
  for (const release of releases) {
    for (const asset of release.assets ?? []) {
      if (asset.name.toLowerCase().endsWith(EXE_SUFFIX)) total += asset.download_count;
    }
  }
  return total;
}

/** Constant-time compare for the refresh token (avoids short-circuit leak). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
