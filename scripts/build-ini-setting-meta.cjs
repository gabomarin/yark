/**
 * Build src/shared/ini-setting-meta.json from defaults/*.ini only.
 *
 * Usage: node scripts/build-ini-setting-meta.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const GUS_PATH = path.join(ROOT, "src/shared/defaults/GameUserSettings.ini");
const GAME_PATH = path.join(ROOT, "src/shared/defaults/Game.ini");
const OVERRIDES_PATH = path.join(ROOT, "src/shared/ini-setting-input-overrides.json");
const OUT_PATH = path.join(ROOT, "src/shared/ini-setting-meta.json");

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
    /(?:valid values?\s+(?:are\s+)?from|from|between)\s*(-?\d+(?:\.\d+)?)\s*(?:to|and)\s*(-?\d+(?:\.\d+)?)/i.exec(
      text,
    );
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
    const input = { type: "number", integer: true, step: 1 };
    const n = Number(defaultValue);
    if (Number.isFinite(n) && n >= 0) input.min = 0;
    return input;
  }

  return {
    type: "number",
    step: suggestStep("float", undefined, undefined, defaultValue),
  };
}

function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_PATH)) return {};
  const raw = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf8"));
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (key.startsWith("$")) continue;
    if (value && typeof value === "object") out[key] = value;
  }
  return out;
}

function main() {
  const overrides = loadOverrides();
  const parsed = [
    ...parseIniFile(GUS_PATH, "gameUserSettings"),
    ...parseIniFile(GAME_PATH, "game"),
  ];

  const settings = [];
  const report = {
    total: 0,
    withInput: 0,
    rangeFromComments: 0,
    suggestCurate: [],
  };

  for (const row of parsed) {
    let defaultValue;
    if (row.defaultValue !== undefined && !isUnusableDefault(row.defaultValue)) {
      defaultValue = clean(row.defaultValue);
    } else {
      defaultValue = clean(row.value);
    }

    const id = settingId(row.file, row.section, row.key);
    const typeClass = classifyValueType(row.valueType, defaultValue);
    let input = inferInput({ ...row, defaultValue }, typeClass);
    if (overrides[id]) {
      input = overrides[id];
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
    });
    report.total += 1;
    report.withInput += 1;
    if (input.type === "range") report.rangeFromComments += 1;
    if (
      input.type === "number" &&
      isMultiplierLike(row.key, row.description, row.valueType)
    ) {
      report.suggestCurate.push(id);
    }
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
        suggestCurateMultipliers: report.suggestCurate.length,
      },
      null,
      2,
    ),
  );
}

main();
