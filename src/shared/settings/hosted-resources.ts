/**
 * Hosted Resources (#564): experimental, default-off loopback HTTP host.
 *
 * Serves published, immutable text/JSON/INI revisions over
 * `http://127.0.0.1:<port>/r/<token>` so ASA settings that expect an HTTP URL
 * body (AdminListURL, BanListURL, …) can target YARK instead of an external
 * host. Loopback only — never LAN/WAN. Resources become unavailable when YARK
 * exits, and a stale URL must not be trusted after a port change.
 */

import { parseStoredBoolean, serializeStoredBoolean } from "./desktop-shell";
import { parseIniTextRows } from "../ini/ini-text";

export const HOSTED_RESOURCES_ENABLED_SETTING_KEY = "hostedResources.enabled";
export const HOSTED_RESOURCES_PORT_SETTING_KEY = "hostedResources.port";

/** Loopback bind is fixed. Never configurable to 0.0.0.0 / :: in this experiment. */
export const HOSTED_RESOURCES_BIND_HOST = "127.0.0.1";

/** Product default: the experiment is off until the operator opts in. */
const DEFAULT_HOSTED_RESOURCES_ENABLED = false;

/** Product default port for the local host. Editable; bind is fail-closed. */
export const DEFAULT_HOSTED_RESOURCES_PORT = 8935;

export const HOSTED_RESOURCES_MIN_PORT = 1024;
export const HOSTED_RESOURCES_MAX_PORT = 65535;

/** 32 random bytes as base64url → 43 characters. */
export const HOSTED_RESOURCES_TOKEN_BYTES = 32;
export const HOSTED_RESOURCES_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Request path prefix for served resources. */
export const HOSTED_RESOURCES_PATH_PREFIX = "/r/";

/** Fixed MIME per format; resources never render as HTML. */
export const HOSTED_RESOURCE_CONTENT_TYPES: Record<HostedResourceFormat, string> = {
  json: "application/json; charset=utf-8",
  ini: "text/plain; charset=utf-8",
  text: "text/plain; charset=utf-8",
};

/** Upper bound for a single revision body (validated before publishing). */
export const HOSTED_RESOURCES_MAX_CONTENT_BYTES = 512 * 1024;
export const HOSTED_RESOURCES_MAX_DISPLAY_NAME_LENGTH = 120;
export const HOSTED_RESOURCES_MAX_NOTES_LENGTH = 500;
export const HOSTED_RESOURCES_MAX_TAGS = 12;
export const HOSTED_RESOURCES_MAX_TAG_LENGTH = 32;

export type HostedResourceFormat = "json" | "ini" | "text";

/**
 * Typed compatibility, separate from operator tags: a kind names the ASA consumer the
 * body is written for, which is what a setting's selector filters on.
 */
export type HostedResourceKind =
  | "admin-list"
  | "ban-list"
  | "dynamic-config"
  | "notification-url"
  | "bad-word-list"
  | "good-word-list"
  | "live-tuning";

export const HOSTED_RESOURCE_KINDS = [
  "admin-list",
  "ban-list",
  "dynamic-config",
  "notification-url",
  "bad-word-list",
  "good-word-list",
  "live-tuning",
] as const satisfies readonly HostedResourceKind[];

/** A kind fixes the body format, so a resource can never be half re-typed later. */
const HOSTED_RESOURCE_KIND_FORMATS: Record<HostedResourceKind, HostedResourceFormat> = {
  "admin-list": "text",
  "ban-list": "text",
  "dynamic-config": "ini",
  "notification-url": "text",
  "bad-word-list": "text",
  "good-word-list": "text",
  "live-tuning": "json",
};

export const HOSTED_RESOURCE_KIND_LABELS: Record<HostedResourceKind, string> = {
  "admin-list": "Admin list",
  "ban-list": "Ban list",
  "dynamic-config": "Dynamic config",
  "notification-url": "Notification URL",
  "bad-word-list": "Bad words list",
  "good-word-list": "Good words list",
  "live-tuning": "Live tuning",
};

export function isHostedResourceKind(value: unknown): value is HostedResourceKind {
  return typeof value === "string" && (HOSTED_RESOURCE_KINDS as readonly string[]).includes(value);
}

export function formatForHostedResourceKind(kind: HostedResourceKind): HostedResourceFormat {
  return HOSTED_RESOURCE_KIND_FORMATS[kind];
}

/** Kinds an existing resource may be re-typed to, given its immovable format. */
export function kindsForHostedResourceFormat(format: HostedResourceFormat): HostedResourceKind[] {
  return HOSTED_RESOURCE_KINDS.filter((kind) => HOSTED_RESOURCE_KIND_FORMATS[kind] === format);
}

/** `null` means untyped: a manual resource the operator has not declared a consumer for. */
export function normalizeHostedResourceKind(value: string | null | undefined): HostedResourceKind | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (!isHostedResourceKind(trimmed)) {
    throw new Error(`Unknown hosted resource kind: ${value}`);
  }
  return trimmed;
}

/** Common ASA URL consumers; MultiSelect also permits operator-defined tags. */
export const HOSTED_RESOURCE_TAG_OPTIONS = HOSTED_RESOURCE_KINDS.map((kind) => ({
  value: kind,
  label: HOSTED_RESOURCE_KIND_LABELS[kind],
}));

/** Stable, case-insensitive tags used for operator categorisation only; compatibility uses the typed kind. */
export function normalizeHostedResourceTags(tags: readonly string[]): string[] {
  const normalized = new Set<string>();
  for (const tag of tags) {
    const value = tag.trim().toLowerCase();
    if (value.length === 0) continue;
    if (value.length > HOSTED_RESOURCES_MAX_TAG_LENGTH) {
      throw new Error(`Tags must be ${HOSTED_RESOURCES_MAX_TAG_LENGTH} characters or fewer.`);
    }
    normalized.add(value);
    if (normalized.size > HOSTED_RESOURCES_MAX_TAGS) {
      throw new Error(`Use at most ${HOSTED_RESOURCES_MAX_TAGS} tags per resource.`);
    }
  }
  return [...normalized];
}

export function isHostedResourcesPort(value: number): boolean {
  return Number.isInteger(value) && value >= HOSTED_RESOURCES_MIN_PORT && value <= HOSTED_RESOURCES_MAX_PORT;
}

/** Invalid / missing stored values fall back to the default port. */
export function parseHostedResourcesPort(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return DEFAULT_HOSTED_RESOURCES_PORT;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  return isHostedResourcesPort(parsed) ? parsed : DEFAULT_HOSTED_RESOURCES_PORT;
}

export function parseHostedResourcesEnabled(raw: string | null | undefined): boolean {
  return parseStoredBoolean(raw, DEFAULT_HOSTED_RESOURCES_ENABLED);
}

export function serializeHostedResourcesEnabled(value: boolean): string {
  return serializeStoredBoolean(value);
}

function formatHostedResourcePath(token: string): string {
  return `${HOSTED_RESOURCES_PATH_PREFIX}${token}`;
}

export function formatHostedResourceUrl(port: number, token: string): string {
  return `http://${HOSTED_RESOURCES_BIND_HOST}:${port}${formatHostedResourcePath(token)}`;
}

/** Localhost spellings YARK treats as its own loopback host. `url.hostname` keeps IPv6 brackets. */
const LOOPBACK_HOSTS = new Set([HOSTED_RESOURCES_BIND_HOST, "localhost", "[::1]"]);

export interface ParsedHostedResourceUrl {
  token: string;
  host: string;
  /** Null when the URL carries no explicit port. */
  port: number | null;
}

/**
 * Reduce a value to the token of a YARK loopback resource URL. Matching on the token
 * instead of the whole URL keeps a reference recognisable after the host port changes.
 * Returns null for anything that is not a loopback resource URL, including external URLs.
 */
export function parseHostedResourceUrl(value: string): ParsedHostedResourceUrl | null {
  const raw = value
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim();
  if (raw.length === 0) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // YARK only ever serves plain HTTP on the loopback port, so an https value is not a
  // resource URL: classifying it as current would tell an operator a TLS-failing URL is fine.
  if (url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) return null;
  if (!url.pathname.startsWith(HOSTED_RESOURCES_PATH_PREFIX)) return null;
  const token = url.pathname.slice(HOSTED_RESOURCES_PATH_PREFIX.length);
  if (!HOSTED_RESOURCES_TOKEN_PATTERN.test(token)) return null;
  return { token, host, port: url.port.length === 0 ? null : Number.parseInt(url.port, 10) };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Unanchored token body, so the scanner and HOSTED_RESOURCES_TOKEN_PATTERN cannot drift. */
const TOKEN_SHAPE = HOSTED_RESOURCES_TOKEN_PATTERN.source.replace(/^\^/, "").replace(/\$$/, "");

/** A loopback resource URL anywhere inside a larger value (quote/flag tolerating). */
const HOSTED_RESOURCE_URL_IN_VALUE = new RegExp(
  `http://(?:${[...LOOPBACK_HOSTS].map(escapeRegExp).join("|")})[^\\s"'=;]*${escapeRegExp(HOSTED_RESOURCES_PATH_PREFIX)}${TOKEN_SHAPE}`,
  "gi",
);

/**
 * First YARK resource URL found inside a value, with what it points at, or null. ASA joins
 * its own syntax around the URL (`AdminListURL="…"`, `?Flag=…?CustomDynamicConfigUrl=…`, a
 * trailing INI comment) and a mod may embed one in an argument of its own, so a reference is
 * a substring match — the candidate still has to survive {@link parseHostedResourceUrl}.
 */
export function findHostedResource(value: string): { url: string; parsed: ParsedHostedResourceUrl } | null {
  for (const candidate of value.matchAll(HOSTED_RESOURCE_URL_IN_VALUE)) {
    const parsed = parseHostedResourceUrl(candidate[0]);
    if (parsed !== null) {
      return { url: candidate[0], parsed };
    }
  }
  return null;
}

/**
 * Launch argument carrying a resource URL, named by the flag that precedes it
 * (`-CustomNotificationURL="…"`, `?Flag1=x?CustomLiveTuningUrl=…`).
 */
export function hostedResourceLaunchArg(arg: string): { key: string; value: string } | null {
  const found = findHostedResource(arg);
  if (found === null) {
    return null;
  }
  const flag = /[-?]([^=\s]+)=\s*["']?$/.exec(arg.slice(0, arg.indexOf(found.url)));
  if (flag === null || flag[1] === undefined) return null;
  return { key: flag[1], value: found.url };
}

export interface HostedResourceValidation {
  ok: boolean;
  message: string | null;
}

/**
 * Validate a revision body at the IPC boundary before publishing. UTF-8 is
 * guaranteed by the string type; we enforce size and format shape.
 */
export function validateHostedResourceContent(format: HostedResourceFormat, content: string): HostedResourceValidation {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes === 0 && format !== "text") {
    return { ok: false, message: "Content is empty." };
  }
  if (bytes > HOSTED_RESOURCES_MAX_CONTENT_BYTES) {
    return {
      ok: false,
      message: `Content exceeds the ${HOSTED_RESOURCES_MAX_CONTENT_BYTES} byte limit.`,
    };
  }
  if (format === "json") {
    try {
      JSON.parse(content);
    } catch {
      return { ok: false, message: "Content is not valid JSON." };
    }
  }
  if (format === "ini") {
    // Deliberately shallow: the official `dynamicconfig.ini` is a flat, section-less
    // list of `Key=Value` lines, so requiring a `[Section]` would reject the primary
    // ASA consumer. We validate syntax, not ASA's supported-key schema.
    if (parseIniTextRows(content).length === 0) {
      return {
        ok: false,
        message: "Content has no INI settings (expected `Key=Value` lines).",
      };
    }
  }
  return { ok: true, message: null };
}
