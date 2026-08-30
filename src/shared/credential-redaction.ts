/**
 * Diagnostic sanitizer for local credentials (#144).
 * Safe for renderer, main, and tests — no Electron APIs.
 *
 * Diagnostic-only: omit password fields from dumps and redact leftovers.
 * Do not reuse {@link sanitizeDiagnosticValue} on live profile writes.
 *
 * YARK does not encrypt the SQLite copy: ASA still needs plaintext passwords in
 * GameUserSettings.ini.
 */

/** Fixed-length mask so dumps do not leak secret length. */
export const REDACTED_SECRET = "••••••••";

const INI_PASSWORD_KEYS = new Set(["serveradminpassword", "serverpassword"]);

const OBJECT_PASSWORD_KEYS = new Set([
  "adminpassword",
  "serverpassword",
  "serveradminpassword",
  "admin_password",
  "server_password",
]);

/** Key aliases in assignment leaks (GUS keys plus common JSON / typo forms). */
const ASSIGNMENT_KEY_PATTERN =
  "serveradminpassword|serverpassword|adminpassword|server_password|admin_password|serveradminpwd";

/**
 * Key + separator, then a quoted value (may contain `&`, spaces) or the rest of
 * the line. `serveradminpwd` is assignment-only (not a GUS omit key).
 */
const ASSIGNMENT_RE = new RegExp(
  `(["']?(?:${ASSIGNMENT_KEY_PATTERN})["']?\\s*[=:]\\s*)(?:"([^"]*)"|'([^']*)'|([^\\r\\n]+))`,
  "gi",
);

const AUTH_HEADER_RE = /(authorization\s*[:=]\s*)(\S+)/gi;
const BEARER_RE = /(bearer\s+)(\S+)/gi;
const API_KEY_RE = /((?:x-api-key|api[_-]?key)\s*[:=]\s*)(\S+)/gi;

/** Runtime console prefix: `[iso] [stdout] payload`. */
const RUNTIME_LOG_PREFIX_RE = /^\[[^\]]*\]\s+\[[^\]]*\]\s+/;

const INI_SECTION_HEADER_RE = /^\[.+]$/;

export function isIniPasswordKey(key: string): boolean {
  return INI_PASSWORD_KEYS.has(normalizeFieldName(key));
}

function isPasswordConfigField(name: string): boolean {
  return OBJECT_PASSWORD_KEYS.has(normalizeFieldName(name));
}

/** Strip a single pair of surrounding JSON/INI quotes; not embedded quotes. */
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

function dropEmptyIniSections(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    if (INI_SECTION_HEADER_RE.test(trimmed)) {
      let j = i + 1;
      let hasBody = false;
      while (j < lines.length && !INI_SECTION_HEADER_RE.test(lines[j]!.trim())) {
        const body = lines[j]!.trim();
        if (body.length > 0 && !body.startsWith(";") && !body.startsWith("#")) {
          hasBody = true;
          break;
        }
        j += 1;
      }
      if (!hasBody) {
        i = j;
        continue;
      }
    }
    out.push(lines[i]!);
    i += 1;
  }
  return out;
}

/**
 * Drop GUS / config password settings from diagnostic text so dumps never
 * reprint those keys (omit, do not reprint even as bullets). Empty INI
 * sections left with only a header are dropped.
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
  return dropEmptyIniSections(kept).join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace known live secrets. Longer values first. Word boundaries so a
 * 4-char password `admin` does not rewrite `administrator`.
 */
function redactKnownValues(text: string, secrets: readonly string[]): string {
  const unique = [...new Set(secrets.map((secret) => secret.trim()).filter((s) => s.length >= 4))];
  unique.sort((a, b) => b.length - a.length);
  let next = text;
  for (const secret of unique) {
    next = next.replace(
      new RegExp(`(?<!\\w)${escapeRegExp(secret)}(?!\\w)`, "g"),
      REDACTED_SECRET,
    );
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
    const admin = profile.adminPassword.trim();
    if (admin.length >= 4) {
      values.push(admin);
    }
    if (profile.serverPassword !== null) {
      const join = profile.serverPassword.trim();
      if (join.length >= 4) {
        values.push(join);
      }
    }
  }
  return [...new Set(values)];
}

/**
 * Omit password fields from a diagnostic config object and sanitize nested
 * strings. Not for persisting profiles.
 */
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
