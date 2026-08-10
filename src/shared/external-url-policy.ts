/**
 * Hosts the main-process window-open handler may open via `shell.openExternal`.
 * Keep this tight: the renderer is local, but any XSS/`target=_blank` must not
 * become an arbitrary OS-browser open.
 */
const ALLOWED_EXTERNAL_HOSTS = new Set([
  "ark.wiki.gg",
  "curseforge.com",
  "www.curseforge.com",
  "github.com",
  "www.github.com",
]);

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase();
  // Reject empty / leading-dot hosts (e.g. `https://.curseforge.com` parses and
  // would otherwise match a naive `endsWith(".curseforge.com")`).
  if (!host || host.startsWith(".")) return false;
  if (ALLOWED_EXTERNAL_HOSTS.has(host)) return true;
  // CurseForge CDN / regional hosts (e.g. mediafilez.forgecdn.net is download-only;
  // mod pages stay on curseforge.com).
  if (host.length > ".curseforge.com".length && host.endsWith(".curseforge.com")) {
    return true;
  }
  return false;
}

/** True when `url` is http(s) and the host is on the YARK external allowlist. */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return hostAllowed(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Returns `url` when it passes {@link isAllowedExternalUrl}; otherwise throws a
 * sanitized operator-facing Error (does not echo the raw URL into IPC/toasts).
 * Used by main before `shell.openExternal` (window-open handler + release notes).
 */
export function requireAllowedExternalUrl(
  url: string | null | undefined,
): string {
  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error("No external URL is available.");
  }
  if (!isAllowedExternalUrl(url)) {
    throw new Error("That link is not on the allowed external hosts list.");
  }
  return url;
}
