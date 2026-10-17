/**
 * Build src/shared/ini/ini-setting-meta.json from defaults/*.ini,
 * input overrides, and ownership seed annotations.
 *
 * Usage: node scripts/build-ini-setting-meta.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const GUS_PATH = path.join(ROOT, "src/shared/defaults/GameUserSettings.ini");
const GAME_PATH = path.join(ROOT, "src/shared/defaults/Game.ini");
const OVERRIDES_PATH = path.join(ROOT, "src/shared/ini/ini-setting-input-overrides.json");
const OWNERSHIP_SEED_PATH = path.join(ROOT, "src/shared/ini/ini-setting-ownership-seed.json");
const ENUMS_PATH = path.join(ROOT, "src/shared/ini/ini-setting-meta-enums.json");
const OUT_PATH = path.join(ROOT, "src/shared/ini/ini-setting-meta.json");

const META_ENUMS = JSON.parse(fs.readFileSync(ENUMS_PATH, "utf8"));
const OWNERS = new Set(META_ENUMS.owners);
const ABSENCE_POLICIES = new Set(META_ENUMS.absencePolicies);
const ENFORCEMENTS = new Set(META_ENUMS.enforcements);
const CONFIDENCES = new Set(META_ENUMS.provenanceConfidences);
const APPLICABILITY_GAMES = new Set(META_ENUMS.applicabilityGames);

const DEFAULT_OWNERSHIP = {
  owner: "iniVisual",
  absencePolicy: "allowed",
  enforcement: "advisory",
  applicability: { game: "asa" },
  provenance: {
    source: "defaults-catalog",
    reviewedAt: null,
    confidence: "inferred",
  },
};

function clean(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function settingId(file, section, key) {
  return `${file}:${section}:${key}`;
}

function parseCommentMeta(commentLines) {
  let defaultValue;
  let valueType;
  const descParts = [];
  for (const raw of commentLines) {
    const line = raw.replace(/^#\s?/, "");
    const def = line.match(/^Default value:\s*(.*)$/i);
    if (def) {
      defaultValue = clean(def[1]);
      continue;
    }
    const vt = line.match(/^Value type:\s*(.*)$/i);
    if (vt) {
      valueType = clean(vt[1]);
      continue;
    }
    const c = clean(line);
    if (c) descParts.push(c);
  }
  return {
    defaultValue,
    valueType,
    description: descParts.join(" "),
  };
}

/** True for template / indexed placeholders that are not concrete settings. */
function isTemplateKey(key) {
  return /[<>]|\[/.test(key);
}

function isUnusableDefault(value) {
  const t = clean(value);
  if (!t) return false; // empty string is a valid stored default (e.g. ActiveMods=)
  if (/^n\/a$/i.test(t)) return true;
  if (/=N\/A$/i.test(t)) return true;
  if (/<(string|float|integer|attribute|stat_id|type)[^>]*>/i.test(t)) return true;
  return false;
}

/**
 * Commented INI assignment: #Key=value
 * Key must be identifier-like (no spaces) so prose comments with "=" are not matched.
 */
function matchCommentedAssign(line) {
  return /^#([A-Za-z_][\w.\[\]<>]*)=(.*)$/.exec(line);
}

/**
 * Parse annotated defaults. Comment blocks attach to the next assignment.
 * Commented template assignments consume their comment block without bleeding.
 */
function parseIniFile(filePath, fileTag) {
  const text = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let section = "";
  let comments = [];
  const settings = [];

  for (const line of lines) {
    const sec = line.match(/^\[([^\]]+)\]\s*$/);
    if (sec) {
      section = sec[1];
      comments = [];
      continue;
    }

    if (/^\s*$/.test(line)) {
      continue;
    }

    if (line.startsWith("#")) {
      const commentedAssign = matchCommentedAssign(line);
      if (commentedAssign && section) {
        const key = commentedAssign[1].trim();
        const value = clean(commentedAssign[2]);
        const meta = parseCommentMeta(comments);
        comments = [];
        // Skip templates / N/A placeholders; still consumed comments above.
        if (
          !isTemplateKey(key) &&
          !isUnusableDefault(value) &&
          !(meta.defaultValue !== undefined && isUnusableDefault(meta.defaultValue))
        ) {
          settings.push({
            file: fileTag,
            section,
            key,
            value,
            ...meta,
          });
        }
        continue;
      }
      comments.push(line);
      continue;
    }

    const kv = line.match(/^([A-Za-z_][\w.\[\]<>]*)=(.*)$/);
    if (kv && section) {
      const key = kv[1].trim();
      const value = clean(kv[2]);
      const meta = parseCommentMeta(comments);
      comments = [];
      if (isTemplateKey(key)) continue;
      settings.push({
        file: fileTag,
        section,
        key,
        value,
        ...meta,
      });
      continue;
    }

    comments = [];
  }

  return settings;
}

function classifyValueType(vt, value) {
  const t = String(vt || "").toLowerCase();
  if (/^boolean\b/.test(t) || t === "bool") return "boolean";
  if (/integer|\bint\b/.test(t)) return "integer";
  if (/float|double|number|multiplier|percentage|seconds|hours|minutes/.test(t)) {
    return "float";
  }
  if (/string|text|url|list|mod id|comma/.test(t)) return "string";
  const v = String(value || "").trim();
  if (/^(true|false)$/i.test(v)) return "boolean";
  if (/^-?\d+$/.test(v)) return "integer";
  if (/^-?\d+\.\d+$/.test(v)) return "float";
  if (t) return "other";
  return "string";
}

function extractRange(description, valueType) {
  const text = `${description || ""} ${valueType || ""}`;
  const fromTo =
    /(?:valid values?\s+(?:are\s+)?from|from|between)\s*(-?\d+(?:\.\d+)?)\s*(?:to|and)\s*(-?\d+(?:\.\d+)?)/i.exec(text);
  if (fromTo) {
    const min = Number(fromTo[1]);
    const max = Number(fromTo[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
      return { min, max };
    }
  }
  return null;
}

function suggestStep(kind, min, max, defaultValue) {
  if (kind === "integer") return 1;
  const def = String(defaultValue || "");
  if (/\.\d{2,}/.test(def)) return 0.01;
  if (min !== undefined && max !== undefined) {
    const span = max - min;
    if (span <= 2) return 0.01;
    if (span <= 20) return 0.1;
  }
  return 0.1;
}

function isMultiplierLike(key, description, valueType) {
  return (
    /multiplier|scale|offset/i.test(key) ||
    /multiplier|scales /i.test(description || "") ||
    /multiplier/i.test(valueType || "")
  );
}

function inferInput(setting, typeClass) {
  if (typeClass === "boolean") {
    return { type: "boolean" };
  }
  if (typeClass === "string" || typeClass === "other") {
    return { type: "text" };
  }

  const range = extractRange(setting.description, setting.valueType);
  const defaultValue = setting.defaultValue ?? setting.value;

  if (range) {
    return {
      type: "range",
      min: range.min,
      max: range.max,
      step: suggestStep(typeClass, range.min, range.max, defaultValue),
    };
  }

  if (typeClass === "integer") {
    // Do not infer min from a non-negative default — some integers use
    // negative sentinels (e.g. ChatLogMaxAgeInDays = -1 for infinite).
    return { type: "number", integer: true, step: 1 };
  }

  return {
    type: "number",
    step: suggestStep("float", undefined, undefined, defaultValue),
  };
}

function loadJsonObject(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (key.startsWith("$")) continue;
    if (value && typeof value === "object") out[key] = value;
  }
  return out;
}

function loadOverrides() {
  return loadJsonObject(OVERRIDES_PATH);
}

function assertEnum(value, allowed, label, id) {
  if (!allowed.has(value)) {
    throw new Error(`Invalid ${label} "${value}" for ${id}`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertApplicability(applicability, id) {
  if (!isPlainObject(applicability)) {
    throw new Error(`Invalid applicability for ${id}`);
  }
  assertEnum(applicability.game, APPLICABILITY_GAMES, "applicability.game", id);
  if (applicability.modIds !== undefined) {
    if (!Array.isArray(applicability.modIds) || !applicability.modIds.every((m) => typeof m === "string")) {
      throw new Error(`Invalid applicability.modIds for ${id}`);
    }
  }
}

function assertProvenance(provenance, id) {
  if (!isPlainObject(provenance)) {
    throw new Error(`Missing provenance for ${id}`);
  }
  assertEnum(provenance.confidence, CONFIDENCES, "provenance.confidence", id);
  if (typeof provenance.source !== "string" || !provenance.source.trim()) {
    throw new Error(`Missing provenance.source for ${id}`);
  }
  if (provenance.reviewedAt != null && typeof provenance.reviewedAt !== "string") {
    throw new Error(`Invalid provenance.reviewedAt for ${id}`);
  }
  if (provenance.confidence === "verified" && !provenance.reviewedAt) {
    throw new Error(`verified provenance requires reviewedAt for ${id}`);
  }
}

function loadOwnershipSeed() {
  if (!fs.existsSync(OWNERSHIP_SEED_PATH)) {
    return {};
  }
  const raw = JSON.parse(fs.readFileSync(OWNERSHIP_SEED_PATH, "utf8"));
  const seed = {};
  for (const [id, entry] of Object.entries(raw || {})) {
    if (id.startsWith("$")) continue;
    if (!isPlainObject(entry)) {
      throw new Error(`Ownership seed entry must be a non-null object: ${id}`);
    }
    assertEnum(entry.owner, OWNERS, "owner", id);
    assertEnum(entry.absencePolicy, ABSENCE_POLICIES, "absencePolicy", id);
    assertEnum(entry.enforcement, ENFORCEMENTS, "enforcement", id);
    assertProvenance(entry.provenance, id);
    const applicability = entry.applicability ?? { game: "asa" };
    assertApplicability(applicability, id);
    seed[id] = {
      ...entry,
      applicability,
    };
  }
  return seed;
}

function resolveOwnership(id, seed) {
  const override = seed[id];
  if (!override) {
    return { ...DEFAULT_OWNERSHIP, provenance: { ...DEFAULT_OWNERSHIP.provenance } };
  }
  const applicability = override.applicability ?? { game: "asa" };
  assertApplicability(applicability, id);
  assertProvenance(override.provenance, id);
  return {
    owner: override.owner,
    absencePolicy: override.absencePolicy,
    enforcement: override.enforcement,
    applicability: {
      game: applicability.game,
      ...(Array.isArray(applicability.modIds) ? { modIds: applicability.modIds } : {}),
    },
    provenance: {
      source: override.provenance.source,
      reviewedAt: override.provenance.reviewedAt ?? null,
      confidence: override.provenance.confidence,
    },
  };
}

/**
 * Profile/system-owned keys may be absent from defaults (N/A placeholders or
 * ASE-legacy keys). Synthesize minimal catalog rows so ownership stays in the
 * single meta catalog.
 */
function synthesizeOwnedEntry(id, seedEntry) {
  const parts = id.split(":");
  if (parts.length < 3) {
    throw new Error(`Invalid ownership seed id: ${id}`);
  }
  const file = parts[0];
  const key = parts[parts.length - 1];
  const section = parts.slice(1, -1).join(":");
  if (file !== "gameUserSettings" && file !== "game") {
    throw new Error(`Unsupported file in ownership seed id: ${id}`);
  }
  const ownership = resolveOwnership(id, { [id]: seedEntry });
  return {
    id,
    file,
    section,
    key,
    defaultValue: "",
    valueType: "string",
    description:
      seedEntry.description || "YARK-owned setting; managed outside the visual INI catalog (Server Settings / Mods).",
    input: { type: "text" },
    ...ownership,
  };
}

function main() {
  const overrides = loadOverrides();
  const ownershipSeed = loadOwnershipSeed();
  const parsed = [...parseIniFile(GUS_PATH, "gameUserSettings"), ...parseIniFile(GAME_PATH, "game")];
  const catalogIds = new Set();

  const settings = [];
  const report = {
    total: 0,
    withInput: 0,
    rangeFromComments: 0,
    suggestCurate: [],
    ownedOverrides: 0,
    synthesizedOwned: 0,
  };

  for (const row of parsed) {
    let defaultValue;
    if (row.defaultValue !== undefined && !isUnusableDefault(row.defaultValue)) {
      defaultValue = clean(row.defaultValue);
    } else {
      defaultValue = clean(row.value);
    }

    const id = settingId(row.file, row.section, row.key);
    catalogIds.add(id);
    const typeClass = classifyValueType(row.valueType, defaultValue);
    let input = inferInput({ ...row, defaultValue }, typeClass);
    if (overrides[id]) {
      input = overrides[id];
    }

    const ownership = resolveOwnership(id, ownershipSeed);
    if (ownershipSeed[id]) {
      report.ownedOverrides += 1;
    }

    settings.push({
      id,
      file: row.file,
      section: row.section,
      key: row.key,
      defaultValue,
      valueType: row.valueType || null,
      description: row.description || "",
      input,
      ...ownership,
    });
    report.total += 1;
    report.withInput += 1;
    if (input.type === "range") report.rangeFromComments += 1;
    if (input.type === "number" && isMultiplierLike(row.key, row.description, row.valueType)) {
      report.suggestCurate.push(id);
    }
  }

  for (const [id, seedEntry] of Object.entries(ownershipSeed)) {
    if (catalogIds.has(id)) continue;
    settings.push(synthesizeOwnedEntry(id, seedEntry));
    catalogIds.add(id);
    report.synthesizedOwned += 1;
    report.total += 1;
    report.withInput += 1;
    report.ownedOverrides += 1;
  }

  settings.sort((a, b) => {
    const fa = a.file.localeCompare(b.file);
    if (fa !== 0) return fa;
    const sa = a.section.localeCompare(b.section);
    if (sa !== 0) return sa;
    return a.key.localeCompare(b.key);
  });

  fs.writeFileSync(
    OUT_PATH,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), settings }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Wrote ${OUT_PATH}`);
  console.log(
    JSON.stringify(
      {
        settings: report.total,
        gus: settings.filter((s) => s.file === "gameUserSettings").length,
        game: settings.filter((s) => s.file === "game").length,
        rangeInputs: report.rangeFromComments,
        ownershipOverrides: report.ownedOverrides,
        synthesizedOwned: report.synthesizedOwned,
        suggestCurateMultipliers: report.suggestCurate.length,
      },
      null,
      2,
    ),
  );
}

main();
