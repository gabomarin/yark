/**
 * CurseForge proxy URL helpers (#151).
 * The endpoint is public configuration, not a secret.
 */

export const METADATA_SERVICE_NOT_CONFIGURED_CODE = "METADATA_SERVICE_NOT_CONFIGURED";

export const METADATA_SERVICE_NOT_CONFIGURED_MESSAGE =
  "Mod metadata service is not configured. Official YARK releases embed the proxy URL at build time; local/dev builds can set YARK_CURSEFORGE_PROXY_URL. Existing mod IDs still launch; search and metadata refresh need an endpoint.";

export function isMetadataServiceNotConfiguredMessage(message: string | null | undefined): boolean {
  if (message == null || message.length === 0) return false;
  return (
    message === METADATA_SERVICE_NOT_CONFIGURED_MESSAGE ||
    message.includes(METADATA_SERVICE_NOT_CONFIGURED_CODE) ||
    /metadata service is not configured/i.test(message)
  );
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Normalize and validate a proxy base URL.
 * HTTPS required except loopback HTTP for local Worker development.
 */
export function normalizeCurseforgeProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("Enter a CurseForge proxy base URL.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("CurseForge proxy URL is not a valid URL.");
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error("CurseForge proxy URL must not include credentials.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("CurseForge proxy URL must use https: (or http: on loopback only).");
  }
  if (parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname)) {
    throw new Error("HTTP is only allowed for loopback CurseForge proxy URLs (local development).");
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new Error("CurseForge proxy URL must not include query parameters or a hash.");
  }
  return stripTrailingSlash(parsed.toString());
}

export class MetadataServiceNotConfiguredError extends Error {
  readonly code = METADATA_SERVICE_NOT_CONFIGURED_CODE;

  constructor() {
    super(METADATA_SERVICE_NOT_CONFIGURED_MESSAGE);
    this.name = "MetadataServiceNotConfiguredError";
  }
}
