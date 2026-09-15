/** Cap CurseForge screenshot HTTPS URLs kept in cache / IPC (#342). */
export const MAX_MOD_SCREENSHOT_URLS = 8;

/**
 * Keep a bounded list of absolute https screenshot URLs (no blobs).
 * Drops non-strings, non-https, empties, and duplicates (first wins).
 */
export function normalizeModScreenshotUrls(
  input: readonly unknown[] | null | undefined,
): string[] {
  if (input == null || input.length === 0) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    if (typeof entry !== "string") continue;
    const url = entry.trim();
    if (url.length === 0) continue;
    if (!/^https:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_MOD_SCREENSHOT_URLS) break;
  }
  return out;
}
