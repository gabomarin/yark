/**
 * Diagnostic sanitizer for local credentials (#144).
 * Safe for renderer, main, and tests — no Electron APIs.
 *
 * YARK does not encrypt the SQLite copy: ASA still needs plaintext passwords in
 * GameUserSettings.ini. This module exists so logs, IPC errors, and exports do
 * not copy those values. Prefer omitting password settings from GUS/config
 * dumps; redact leftover assignment forms.
 */

export const REDACTED_SECRET = "••••••••";

const INI_PASSWORD_KEYS = new Set(["serveradminpassword", "serverpassword"]);

const OBJECT_PASSWORD_KEYS = new Set([
  "adminpassword",
  "serverpassword",
  "serveradminpassword",
  "admin_password",
  "server_password",
]);

/** INI / JSON / query-string assignments that carry server secrets. */
const ASSIGNMENT_RE =
  /(["']?(?:serveradminpassword|serverpassword|adminpassword|server_password|admin_password|serveradminpwd)["']?\s*[=:]\s*)["']?([^\s"'&,;}]+)["']?/gi;

const AUTH_HEADER_RE = /(authorization\s*[:=]\s*)(\S+)/gi;
const BEARER_RE = /(bearer\s+)(\S+)/gi;
const API_KEY_RE = /((?:x-api-key|api[_-]?key)\s*[:=]\s*)(\S+)/gi;

/** Runtime console prefix: `[iso] [stdout] payload`. */
const RUNTIME_LOG_PREFIX_RE = /^\[[^\]]*\]\s+\[[^\]]*\]\s+/;

export function isIniPasswordKey(key: string): boolean {
  return INI_PASSWORD_KEYS.has(normalizeFieldName(key));
}

function isPasswordConfigField(name: string): boolean {
  return OBJECT_PASSWORD_KEYS.has(normalizeFieldName(name));
}

function normalizeFieldName(name: string): string {
  return name.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

function isPasswordSettingLine(trimmed: string): boolean {
  if (trimmed.length === 0 || trimmed.startsWith(";") || trimmed.startsWith("#")) {
    return false;
  }
  const eq = trimmed.indexOf("=");
  if (eq > 0 && isIniPasswordKey(trimmed.slice(0, eq))) {
    return true;
  }
  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const key = trimmed.slice(0, colon);
    if (isPasswordConfigField(key) || isIniPasswordKey(key)) {
      return true;
    }
  }
  return false;
}

/**
 * Drop GUS / config password settings from diagnostic text so dumps never
 * reprint those keys (omit, do not reprint even as bullets).
 */
export function omitIniPasswordSettings(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const payload = trimmed.replace(RUNTIME_LOG_PREFIX_RE, "").trim();
    if (isPasswordSettingLine(trimmed) || isPasswordSettingLine(payload)) {
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

function redactKnownValues(text: string, secrets: readonly string[]): string {
  let next = text;
  for (const secret of secrets) {
    const trimmed = secret.trim();
    if (trimmed.length < 4) continue;
    next = next.split(trimmed).join(REDACTED_SECRET);
  }
  return next;
}

function redactAssignmentForms(text: string, knownSecrets: readonly string[]): string {
  let next = text.replace(ASSIGNMENT_RE, `$1${REDACTED_SECRET}`);
  next = next.replace(BEARER_RE, `$1${REDACTED_SECRET}`);
  next = next.replace(AUTH_HEADER_RE, `$1${REDACTED_SECRET}`);
  next = next.replace(API_KEY_RE, `$1${REDACTED_SECRET}`);
  return redactKnownValues(next, knownSecrets);
}

/**
 * Prepare text for logs / IPC errors / exports: omit GUS password lines, then
 * redact remaining assignment forms and optional known live secrets.
 */
export function sanitizeDiagnosticText(
  text: string,
  knownSecrets: readonly string[] = [],
): string {
  return redactAssignmentForms(omitIniPasswordSettings(text), knownSecrets);
}

export function collectKnownSecrets(
  profiles: ReadonlyArray<{ adminPassword: string; serverPassword: string | null }>,
): string[] {
  const values: string[] = [];
  for (const profile of profiles) {
    if (profile.adminPassword.trim().length >= 4) {
      values.push(profile.adminPassword);
    }
    if (profile.serverPassword !== null && profile.serverPassword.trim().length >= 4) {
      values.push(profile.serverPassword);
    }
  }
  return values;
}

/** Omit password fields from a config object and sanitize nested strings. */
export function sanitizeDiagnosticValue(
  value: unknown,
  knownSecrets: readonly string[] = [],
): unknown {
  if (typeof value === "string") {
    return sanitizeDiagnosticText(value, knownSecrets);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticValue(item, knownSecrets));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (isPasswordConfigField(key)) {
        continue;
      }
      out[key] = sanitizeDiagnosticValue(nested, knownSecrets);
    }
    return out;
  }
  return value;
}

export function sanitizeAppEvent<T extends { message: string; details: unknown }>(
  event: T,
  knownSecrets: readonly string[] = [],
): T {
  return {
    ...event,
    message: sanitizeDiagnosticText(event.message, knownSecrets),
    details:
      event.details === null || event.details === undefined
        ? event.details
        : (sanitizeDiagnosticValue(event.details, knownSecrets) as T["details"]),
  };
}
