import {
  asaLaunchOptionEntries,
  lookupLaunchOptionById,
  type AsaLaunchOptionEntry,
} from "./asa-launch-options-catalog";

/** Persisted structured selection keyed by catalog entry id (#93). */
export interface StructuredLaunchArgState {
  enabled: boolean;
  /** Required for non-flag value types when enabled. */
  value?: string;
}

export type StructuredLaunchArgs = Record<string, StructuredLaunchArgState>;

export type StructuredLaunchGroupId = "world" | "security" | "logging" | "performance";

interface StructuredLaunchCuration {
  /** Catalog entry id (must be status=supported). */
  id: string;
  group: StructuredLaunchGroupId;
  /** Internal popularity — docs/audit only (Launch shows all curated rows). */
  common: boolean;
  /** Shown while enabled; sticky risk callout. */
  operatorWarning?: string;
  /** Enum choices when the wiki does not list them. */
  enumOptions?: readonly string[];
  /** Multi-select over `enumOptions`; value stored as `A+B` or special ALL. */
  multiSelect?: boolean;
  defaultValue?: string;
  /** Only interactive / emitted when this parent curation id is effectively on. */
  dependsOn?: string;
}

export const STRUCTURED_LAUNCH_GROUP_ORDER: readonly StructuredLaunchGroupId[] = [
  "world",
  "security",
  "logging",
  "performance",
] as const;

export function structuredLaunchGroupLabel(group: StructuredLaunchGroupId): string {
  switch (group) {
    case "world":
      return "World & gameplay";
    case "security":
      return "Security & integrity";
    case "logging":
      return "Logging & messaging";
    case "performance":
      return "Performance & network";
  }
}

/**
 * Internal curation for the Launch tab (tiers never shown to operators).
 * Ids must match `asa-launch-options-catalog.json`.
 */

/** Atomic `-ServerPlatform=` codes (ALL = every code selected). */
const SERVER_PLATFORM_CODES = ["PC", "PS5", "XSX", "WINGDK"] as const;

export type ServerPlatformCode = (typeof SERVER_PLATFORM_CODES)[number];

/** Persist MultiSelect codes as ALL (all selected), A+B, or "" when none. */
export function encodeServerPlatformSelection(codes: readonly string[]): string {
  const selected = SERVER_PLATFORM_CODES.filter((code) => codes.some((c) => c.toUpperCase() === code));
  if (selected.length === 0) return "";
  if (selected.length === SERVER_PLATFORM_CODES.length) return "ALL";
  return selected.join("+");
}

/** Expand stored ALL / PC+XSX into MultiSelect values. Empty → none selected. */
export function decodeServerPlatformSelection(value: string | undefined): ServerPlatformCode[] {
  const raw = (value ?? "").trim();
  if (raw.length === 0) return [];
  if (/^ALL$/i.test(raw)) {
    return [...SERVER_PLATFORM_CODES];
  }
  const parts = new Set(
    raw
      .split("+")
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean),
  );
  return SERVER_PLATFORM_CODES.filter((code) => parts.has(code));
}

const STRUCTURED_LAUNCH_CURATION: readonly StructuredLaunchCuration[] = [
  { id: "forceallowcaveflyers", group: "world", common: true },
  { id: "autodestroystructures", group: "world", common: true },
  { id: "enableidleplayerkick", group: "world", common: true },
  {
    id: "forcerespawndinos",
    group: "world",
    common: true,
    operatorWarning: "Wipes wild dinos on every start. Turn off after maintenance unless you intend this every boot.",
  },
  { id: "nobattleye", group: "security", common: true },
  {
    id: "exclusivejoin",
    group: "security",
    common: true,
    operatorWarning: "If PlayersExclusiveJoinList.txt is missing or empty, nobody can join.",
  },
  { id: "forcedupelog", group: "security", common: true },
  { id: "disabledupelogdeletes", group: "security", common: true },
  { id: "ignoredupeditems", group: "security", common: true },
  { id: "disablecustomcosmetics", group: "security", common: true },
  { id: "docustomcosmeticvalidation", group: "security", common: true },
  { id: "servergamelog", group: "logging", common: true },
  {
    id: "servergamelogincludetribelogs",
    group: "logging",
    common: true,
    dependsOn: "servergamelog",
  },
  {
    id: "serverrconoutputtribelogs",
    group: "logging",
    common: true,
    /** Wiki: requires `-servergamelogincludetribelogs`. */
    dependsOn: "servergamelogincludetribelogs",
  },
  {
    id: "culture-lang_code",
    group: "logging",
    common: true,
    enumOptions: ["en", "de", "es", "fr", "ja", "ko", "zh"],
    defaultValue: "en",
  },
  {
    id: "customnotificationurl-url",
    group: "logging",
    common: true,
    defaultValue: "",
  },
  {
    id: "server-platform",
    group: "performance",
    common: true,
    multiSelect: true,
    enumOptions: SERVER_PLATFORM_CODES,
    defaultValue: "ALL",
  },
  {
    id: "gbusagetoforcerestart-value",
    group: "performance",
    common: true,
    defaultValue: "35",
  },
  { id: "nosound", group: "performance", common: true },
  { id: "forceuseperfthreads", group: "performance", common: true },
  { id: "noperfthreads", group: "performance", common: true },
  { id: "multihome", group: "performance", common: true },
  { id: "useservernetspeedcheck", group: "performance", common: true },
  { id: "unstasisdinoobstructioncheck", group: "performance", common: true },
  { id: "stasiskeepcontrollers", group: "performance", common: true },
  { id: "usedynamicconfig", group: "world", common: true },
  {
    id: "customdynamicconfigurl-url",
    group: "world",
    common: true,
    dependsOn: "usedynamicconfig",
    defaultValue: "",
  },
  { id: "nowildbabies", group: "world", common: true },
] as const;

const CURATION_BY_ID = new Map(STRUCTURED_LAUNCH_CURATION.map((c) => [c.id, c]));

/** True when every ancestor in the `dependsOn` chain is enabled. */
export function isStructuredDependencyMet(
  curationId: string,
  structured: StructuredLaunchArgs | null | undefined,
): boolean {
  const state = normalizeStructuredLaunchArgs(structured);
  let currentId: string | undefined = curationId;
  const seen = new Set<string>();
  while (currentId) {
    if (seen.has(currentId)) return false;
    seen.add(currentId);
    const curation = CURATION_BY_ID.get(currentId);
    const parentId = curation?.dependsOn;
    if (!parentId) return true;
    if (state[parentId]?.enabled !== true) return false;
    currentId = parentId;
  }
  return true;
}

/** Enabled in state and dependency chain satisfied (emitted / counted as on). */
export function isStructuredOptionEffectivelyEnabled(
  curationId: string,
  structured: StructuredLaunchArgs | null | undefined,
): boolean {
  const state = normalizeStructuredLaunchArgs(structured);
  if (state[curationId]?.enabled !== true) return false;
  return isStructuredDependencyMet(curationId, state);
}

export interface StructuredLaunchUiOption {
  curation: StructuredLaunchCuration;
  entry: AsaLaunchOptionEntry;
}

export function listStructuredLaunchUiOptions(): StructuredLaunchUiOption[] {
  const out: StructuredLaunchUiOption[] = [];
  for (const curation of STRUCTURED_LAUNCH_CURATION) {
    const entry = lookupLaunchOptionById(curation.id);
    if (entry === undefined || entry.status !== "supported") continue;
    out.push({ curation, entry });
  }
  return out;
}

export function emptyStructuredLaunchArgs(): StructuredLaunchArgs {
  return {};
}

export function normalizeStructuredLaunchArgs(value: StructuredLaunchArgs | null | undefined): StructuredLaunchArgs {
  if (value == null || typeof value !== "object") return {};
  const out: StructuredLaunchArgs = {};
  for (const [id, state] of Object.entries(value)) {
    if (state == null || typeof state !== "object") continue;
    out[id] = {
      enabled: state.enabled === true,
      value: typeof state.value === "string" ? state.value : undefined,
    };
  }
  return out;
}

function tokenStem(token: string): string {
  let t = token.trim();
  // Drop wrapping quotes around the whole token if present.
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  // Key is before '=' / whitespace (Unreal `?Option=` or `-Option=`).
  t = (t.split(/[=\s]/)[0] ?? "").trim();
  t = t.replace(/^[?-]+/, "");
  return t.toLowerCase();
}

/** Strip catalog placeholders like `<url>` / `[optional]` (not HTML sanitization). */
function stripCatalogPlaceholders(token: string): string {
  let result = token;
  for (;;) {
    const withoutAngles = result.replace(/<[^>]*>/g, "");
    if (withoutAngles === result) break;
    result = withoutAngles;
  }
  return result.replace(/[\[\]]/g, "");
}

/**
 * Build a pasteable CLI token from catalog entry + selection value.
 * Returns null when a valued option has no usable value (do not emit placeholders).
 */
export function buildStructuredLaunchToken(entry: AsaLaunchOptionEntry, value: string | undefined): string | null {
  if (entry.valueType === "flag") {
    return entry.example.trim() || entry.token.trim().split(/\s+/)[0]!;
  }
  const rawValue = (value ?? "").trim();
  if (rawValue.length === 0) return null;
  // CLI quoting only — strip ASCII double quotes from the value payload.
  const sanitized = Array.from(rawValue)
    .filter((ch) => ch !== '"')
    .join("");
  const quoted = /^https?:\/\//i.test(sanitized) || /\s/.test(sanitized) ? `"${sanitized}"` : sanitized;
  const base = stripCatalogPlaceholders(entry.token);
  if (base.includes("=")) {
    const eq = base.indexOf("=");
    return `${base.slice(0, eq + 1)}${quoted}`;
  }
  const exampleEq = entry.example.indexOf("=");
  if (exampleEq >= 0) {
    return `${entry.example.slice(0, exampleEq + 1)}${quoted}`;
  }
  return `${entry.example}${quoted}`;
}

export interface LaunchArgConflict {
  message: string;
  field?: "extraArgs" | "structuredLaunchArgs";
}

/** Issues for effectively-on valued options missing a usable value. */
function findStructuredLaunchValueIssues(structured: StructuredLaunchArgs | null | undefined): LaunchArgConflict[] {
  const state = normalizeStructuredLaunchArgs(structured);
  const issues: LaunchArgConflict[] = [];
  for (const curation of STRUCTURED_LAUNCH_CURATION) {
    if (!isStructuredOptionEffectivelyEnabled(curation.id, state)) continue;
    const entry = lookupLaunchOptionById(curation.id);
    if (entry === undefined || entry.status !== "supported") continue;
    if (entry.valueType === "flag") continue;
    if ((state[curation.id]?.value ?? "").trim().length > 0) continue;
    const label = entry.token.split(/[=\s]/)[0] ?? curation.id;
    issues.push({
      field: "structuredLaunchArgs",
      message: `Structured “${label}” requires a value.`,
    });
  }
  return issues;
}

/** Enabled structured tokens in curation order (skips valued options with empty values). */
export function buildStructuredLaunchArgList(structured: StructuredLaunchArgs | null | undefined): string[] {
  const state = normalizeStructuredLaunchArgs(structured);
  const tokens: string[] = [];
  for (const curation of STRUCTURED_LAUNCH_CURATION) {
    const sel = state[curation.id];
    const entry = lookupLaunchOptionById(curation.id);
    if (entry === undefined || entry.status !== "supported") continue;
    if (!isStructuredOptionEffectivelyEnabled(curation.id, state)) continue;
    const token = buildStructuredLaunchToken(entry, sel?.value);
    if (token !== null) tokens.push(token);
  }
  return tokens;
}

const YARK_OWNED_STEMS = new Set([
  "port",
  "winlivemaxplayers",
  "mods",
  "clusterid",
  "clusterdiroverride",
  "notransferfromfiltering",
]);

/** `-port=N` — YARK-owned game port (#458). */
export function yarkPortArg(gamePort: number): string {
  return `-port=${gamePort}`;
}

/** `-WinLiveMaxPlayers=N` when slots &gt; 0. */
export function yarkWinLiveMaxPlayersArg(maxPlayers: number): string {
  return `-WinLiveMaxPlayers=${maxPlayers}`;
}

/** Default platform when neither structured nor raw supply `-ServerPlatform`. */
export const YARK_DEFAULT_SERVER_PLATFORM_ARG = "-ServerPlatform=ALL";

/** `-mods=a,b,c` for enabled CurseForge project IDs. */
export function yarkModsArg(modIds: readonly string[]): string {
  return `-mods=${modIds.join(",")}`;
}

/**
 * Catalog id of the retired Launch `-passivemods=` option. The Mods tab owns
 * passive mods now; the option is kept only to migrate saved selections (#509).
 */
export const LEGACY_PASSIVE_MODS_OPTION_ID = "passivemods-modid1-[-modid2-[...]]";

/** `-passivemods=a,b,c` for enabled passive CurseForge project IDs. */
export function yarkPassiveModsArg(modIds: readonly string[]): string {
  return `-passivemods=${modIds.join(",")}`;
}

/** True when an arg is a real `-passivemods=` / `?passivemods` token. */
export function isPassiveModsArg(arg: string): boolean {
  return tokenStem(arg) === "passivemods";
}

function isLegacyPassiveModsOptionId(id: string): boolean {
  return tokenStem(id) === LEGACY_PASSIVE_MODS_OPTION_ID;
}

/** Comma/space separated Project IDs from every `-passivemods=` token. */
export function parsePassiveModIds(args: readonly string[]): string[] {
  const ids: string[] = [];
  for (const arg of args) {
    if (!isPassiveModsArg(arg)) continue;
    const eq = arg.indexOf("=");
    if (eq < 0) continue;
    const value = arg
      .slice(eq + 1)
      .replace(/^["']|["']$/g, "")
      .trim();
    if (value.length === 0) continue;
    for (const id of value.split(/[,;]+/)) {
      const trimmed = id.trim();
      if (trimmed.length > 0) ids.push(trimmed);
    }
  }
  return ids;
}

/**
 * Split configured mods into `-mods=` (active) and `-passivemods=` (passive).
 * Passive implies enabled; a disabled ID can never be passive. Load order
 * follows the `mods` array for both buckets.
 */
export function resolveProfileModBuckets(profile: {
  mods: readonly string[];
  disabledMods?: readonly string[];
  passiveMods?: readonly string[];
}): { active: string[]; passive: string[] } {
  const disabled = new Set(profile.disabledMods ?? []);
  const enabled = profile.mods.filter((id) => !disabled.has(id));
  const passiveSet = new Set((profile.passiveMods ?? []).filter((id) => enabled.includes(id)));
  return {
    active: enabled.filter((id) => !passiveSet.has(id)),
    passive: enabled.filter((id) => passiveSet.has(id)),
  };
}

/**
 * Promote the retired Launch `-passivemods=` option into `passiveMods` and drop
 * it from structured args, mirroring the WinLiveMaxPlayers promotion. Only a
 * selection that was actually emitted (`enabled`) carries over; IDs outside
 * `mods` (or disabled) are dropped by {@link resolveProfileModBuckets}. Hand-typed
 * extra-arg tokens are left untouched.
 */
export function takeLegacyPassiveMods(input: {
  structuredLaunchArgs: StructuredLaunchArgs | null | undefined;
  mods: readonly string[];
  disabledMods: readonly string[];
  passiveMods: readonly string[];
}): { structuredLaunchArgs: StructuredLaunchArgs; passiveMods: string[] } {
  const structured = normalizeStructuredLaunchArgs(input.structuredLaunchArgs);
  const nextStructured: StructuredLaunchArgs = {};
  const ids: string[] = [];
  for (const [id, state] of Object.entries(structured)) {
    if (isLegacyPassiveModsOptionId(id)) {
      if (state.enabled === true && typeof state.value === "string") {
        ids.push(...parsePassiveModIds([`-passivemods=${state.value}`]));
      }
      continue;
    }
    nextStructured[id] = state;
  }
  return {
    structuredLaunchArgs: nextStructured,
    // Reuse the same bucket rule as launch time: installed, enabled, `mods` order.
    passiveMods: resolveProfileModBuckets({
      mods: input.mods,
      disabledMods: input.disabledMods,
      passiveMods: [...input.passiveMods, ...ids],
    }).passive,
  };
}

/** Cluster trio when both id and dir are set. */
export function yarkClusterArgs(clusterId: string, clusterDir: string): string[] {
  return [`-clusterid=${clusterId}`, `-ClusterDirOverride=${clusterDir}`, "-NoTransferFromFiltering"];
}

/**
 * Case-insensitive conflicts across structured + raw (+ YARK-owned stems in raw).
 */
export function findLaunchArgConflicts(input: {
  structured?: StructuredLaunchArgs | null;
  extraArgs: string[];
}): LaunchArgConflict[] {
  const issues: LaunchArgConflict[] = [];
  issues.push(...findStructuredLaunchValueIssues(input.structured));
  const structuredTokens = buildStructuredLaunchArgList(input.structured);
  const structuredStems = new Set(structuredTokens.map(tokenStem));

  for (const raw of input.extraArgs) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const stem = tokenStem(trimmed);
    if (structuredStems.has(stem)) {
      issues.push({
        field: "extraArgs",
        message: `Raw “${trimmed}” duplicates a structured option.`,
      });
    }
    if (YARK_OWNED_STEMS.has(stem) || /sessionname=/i.test(trimmed)) {
      issues.push({
        field: "extraArgs",
        message: `Raw “${trimmed}” conflicts with a YARK-owned argument.`,
      });
    }
  }

  return issues;
}

/** Redact password-like values in preview tokens. */
export function redactLaunchArgForPreview(token: string): string {
  if (/password|admin|secret/i.test(token)) {
    return token.replace(/=.+$/, "=••••••");
  }
  return token;
}

/** True when an arg is a real `-WinLiveMaxPlayers` / `?WinLiveMaxPlayers` token. */
export function isWinLiveMaxPlayersArg(arg: string): boolean {
  return tokenStem(arg) === "winlivemaxplayers";
}

const WIN_LIVE_MAX_PLAYERS_MAX = 255;

function isWinLiveMaxPlayersOptionId(id: string): boolean {
  const stem = tokenStem(id);
  // 0.12 catalog id is exactly `winlivemaxplayers-integer` (plus a bare stem).
  return stem === "winlivemaxplayers" || stem === "winlivemaxplayers-integer";
}

function parseSlotCap(raw: string): number | null {
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(n) || n < 0 || n > WIN_LIVE_MAX_PLAYERS_MAX) {
    return null;
  }
  return n;
}

/** Integer payload of a `-WinLiveMaxPlayers=` / `?WinLiveMaxPlayers=` token. */
export function parseWinLiveMaxPlayersValue(arg: string): number | null {
  if (!isWinLiveMaxPlayersArg(arg)) {
    return null;
  }
  const eq = arg.indexOf("=");
  if (eq < 0) {
    return null;
  }
  return parseSlotCap(arg.slice(eq + 1).replace(/^["']|["']$/g, ""));
}

export type LegacyWinLiveMaxPlayersTake = {
  maxPlayers: number | null;
  structuredLaunchArgs: StructuredLaunchArgs;
  extraArgs: string[];
};

/**
 * Read a 0.12 Launch/extra `-WinLiveMaxPlayers` cap and strip those tokens.
 * Extra args win when both are present (they were appended last on the 0.12 CLI).
 * `0` is a valid target (profile omits the flag; ASA then defaults to 70).
 */
export function takeLegacyWinLiveMaxPlayers(input: {
  structuredLaunchArgs: StructuredLaunchArgs | null | undefined;
  extraArgs: readonly string[];
}): LegacyWinLiveMaxPlayersTake {
  const structured = normalizeStructuredLaunchArgs(input.structuredLaunchArgs);
  const nextStructured: StructuredLaunchArgs = {};
  let maxPlayers: number | null = null;

  for (const [id, state] of Object.entries(structured)) {
    if (isWinLiveMaxPlayersOptionId(id)) {
      if (state.enabled === true && typeof state.value === "string") {
        const parsed = parseSlotCap(state.value);
        if (parsed !== null) {
          maxPlayers = parsed;
        }
      }
      continue;
    }
    nextStructured[id] = state;
  }

  const extraArgs: string[] = [];
  for (const arg of input.extraArgs) {
    if (isWinLiveMaxPlayersArg(arg)) {
      const parsed = parseWinLiveMaxPlayersValue(arg);
      if (parsed !== null) {
        maxPlayers = parsed;
      }
      continue;
    }
    extraArgs.push(arg);
  }

  return { maxPlayers, structuredLaunchArgs: nextStructured, extraArgs };
}

/** True when an arg is a real `-ServerPlatform` / `?ServerPlatform` token. */
export function argsIncludeServerPlatform(args: readonly string[]): boolean {
  return args.some((arg) => tokenStem(arg) === "serverplatform");
}

/** Catalog entries used only for audit; curated list is the UI source. */
export function assertStructuredCurationCatalogCoverage(): string[] {
  const missing: string[] = [];
  for (const curation of STRUCTURED_LAUNCH_CURATION) {
    const entry = asaLaunchOptionEntries.find((e) => e.id === curation.id);
    if (entry === undefined) missing.push(`missing:${curation.id}`);
    else if (entry.status !== "supported") {
      missing.push(`not-supported:${curation.id}:${entry.status}`);
    }
  }
  return missing;
}
