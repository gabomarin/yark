import { flattenIniText, INI_FLAT_SEP, setIniTextValue } from "@shared/ini-text";
import { isYarkOwnedIniKey } from "@shared/yark-owned-ini-keys";
import type { IniDiffEntry, IniPreview, ServerIniPayload, ServerProfile } from "@shared/types";
import { prepareClusterIniTemplatePayload } from "./cluster-ini-template-service";

/** Profile fields written into GameUserSettings after template composition. */
export type ProfileIniIdentity = Pick<
  ServerProfile,
  | "rconPort"
  | "adminPassword"
  | "serverPassword"
  | "sessionName"
  | "gamePort"
  | "queryPort"
>;

const REDACTED = "••••••••";
const SECRET_KEYS = new Set(["serveradminpassword", "serverpassword"]);

function flatLookup(
  flat: Record<string, string>,
  section: string,
  key: string,
): string | undefined {
  const exact = flat[`${section}${INI_FLAT_SEP}${key}`];
  if (exact !== undefined) {
    return exact;
  }
  const sectionLower = section.toLowerCase();
  const keyLower = key.toLowerCase();
  for (const [flatKey, value] of Object.entries(flat)) {
    const sep = flatKey.indexOf(INI_FLAT_SEP);
    if (sep < 0) continue;
    if (
      flatKey.slice(0, sep).toLowerCase() === sectionLower &&
      flatKey.slice(sep + INI_FLAT_SEP.length).toLowerCase() === keyLower
    ) {
      return value;
    }
  }
  return undefined;
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Prefer the member’s current on-disk Server Information values so template
 * restore/seed never rewrites ports, passwords, or session name from another
 * server. Fall back to the profile when a key is missing (e.g. first seed).
 */
export function resolveMemberIdentity(
  profile: ProfileIniIdentity,
  currentGameUserSettings?: string,
): ProfileIniIdentity {
  if (currentGameUserSettings === undefined || currentGameUserSettings.trim().length === 0) {
    return profile;
  }
  const flat = flattenIniText(currentGameUserSettings);
  return {
    rconPort: parsePort(
      flatLookup(flat, "ServerSettings", "RCONPort"),
      profile.rconPort,
    ),
    adminPassword:
      flatLookup(flat, "ServerSettings", "ServerAdminPassword") ??
      profile.adminPassword,
    serverPassword:
      flatLookup(flat, "ServerSettings", "ServerPassword") ??
      profile.serverPassword,
    sessionName:
      flatLookup(flat, "SessionSettings", "SessionName") ?? profile.sessionName,
    gamePort: parsePort(
      flatLookup(flat, "SessionSettings", "Port"),
      profile.gamePort,
    ),
    queryPort: parsePort(
      flatLookup(flat, "SessionSettings", "QueryPort"),
      profile.queryPort,
    ),
  };
}

/**
 * Applies YARK profileSync keys into GameUserSettings text (in memory).
 * Must stay aligned with `syncProfileSettingsToIni` / `yark-owned-ini-keys`.
 */
export function applyProfileOwnedKeysToGameUserSettings(
  gameUserSettings: string,
  profile: ProfileIniIdentity,
): string {
  let text = gameUserSettings;
  text = setIniTextValue(text, "ServerSettings", "RCONEnabled", "True");
  text = setIniTextValue(
    text,
    "ServerSettings",
    "RCONPort",
    String(profile.rconPort),
  );
  text = setIniTextValue(
    text,
    "ServerSettings",
    "ServerAdminPassword",
    profile.adminPassword,
  );
  text = setIniTextValue(
    text,
    "ServerSettings",
    "ServerPassword",
    profile.serverPassword ?? "",
  );
  text = setIniTextValue(
    text,
    "SessionSettings",
    "SessionName",
    profile.sessionName,
  );
  text = setIniTextValue(
    text,
    "SessionSettings",
    "Port",
    String(profile.gamePort),
  );
  text = setIniTextValue(
    text,
    "SessionSettings",
    "QueryPort",
    String(profile.queryPort),
  );
  return text;
}

/** Template → member: replace both INI files, then reapply per-server identity. */
export function composeMemberPayloadFromTemplate(
  template: ServerIniPayload,
  profile: ProfileIniIdentity,
  currentMember?: ServerIniPayload,
): ServerIniPayload {
  const prepared = prepareClusterIniTemplatePayload(template);
  const identity = resolveMemberIdentity(
    profile,
    currentMember?.gameUserSettings,
  );
  return {
    gameUserSettings: applyProfileOwnedKeysToGameUserSettings(
      prepared.gameUserSettings,
      identity,
    ),
    game: prepared.game,
  };
}

/** Member → template: sanitize and strip YARK-owned keys. */
export function composeTemplatePayloadFromMember(
  member: ServerIniPayload,
): ServerIniPayload {
  return prepareClusterIniTemplatePayload(member);
}

function redactDiffEntry(entry: IniDiffEntry): IniDiffEntry {
  if (!SECRET_KEYS.has(entry.key.toLowerCase())) {
    return entry;
  }
  return {
    ...entry,
    before: entry.before === null ? null : REDACTED,
    after: entry.after === null ? null : REDACTED,
  };
}

/** Drop YARK-owned keys from operator previews — they are never template-authored. */
export function omitYarkOwnedFromIniPreview(preview: IniPreview): IniPreview {
  const diff = preview.diff.filter(
    (entry) =>
      entry.fileKey !== "gameUserSettings" ||
      !isYarkOwnedIniKey(entry.section, entry.key),
  );
  return {
    ...preview,
    diff,
    changedCount: diff.length,
  };
}

/** Redact password values in a preview before returning to the renderer. */
export function redactIniPreviewSecrets(preview: IniPreview): IniPreview {
  return {
    ...preview,
    diff: preview.diff.map(redactDiffEntry),
  };
}

/** Operator-facing preview: hide owned keys, redact remaining secrets. */
export function finalizeClusterIniApplyPreview(preview: IniPreview): IniPreview {
  return redactIniPreviewSecrets(omitYarkOwnedFromIniPreview(preview));
}
