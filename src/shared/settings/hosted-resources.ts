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

/** Common ASA URL consumers; MultiSelect also permits operator-defined tags. */
export const HOSTED_RESOURCE_TAG_OPTIONS = [
  { value: "admin-list", label: "Admin list" },
  { value: "ban-list", label: "Ban list" },
  { value: "dynamic-config", label: "Dynamic config" },
];

/** Stable, case-insensitive tags used for operator categorisation and future selectors. */
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
  if (bytes === 0) {
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
