/**
 * Build src/shared/asa-launch-options-catalog.json from ark.wiki.gg
 * "Server configuration" → Command line options (`{{Server config variable}}`).
 *
 * ASA column on the wiki renders Check_mark / Missing from `inASA` (Yes / No / Unknown).
 * The committed JSON is the runtime source of truth — this script is offline regeneration only.
 *
 * Usage: node scripts/build-asa-launch-options-catalog.cjs
 * Optional: ASA_LAUNCH_OPTIONS_WIKI_JSON=/path/to/api-parse.json (skip network)
 */
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "src/shared/asa-launch-options-catalog.json");
const SOURCE_URL =
  "https://ark.wiki.gg/wiki/Server_configuration#Command_line_options";
const API_URL =
  "https://ark.wiki.gg/api.php?action=parse&page=Server_configuration&prop=wikitext&format=json&formatversion=2";
const CATALOG_VERSION = "0.2.0";

/** @type {Array<{ id: string; pattern: RegExp; token: string; notes: string }>} */
const YARK_OWNED = [
  {
    id: "map-session",
    pattern: /SessionName=/i,
    token: '"Map"?SessionName=',
    notes: "Always composed first from profile.map + profile.sessionName.",
  },
  {
    id: "port",
    pattern: /^-port(=|$)/i,
    token: "-port=",
    notes: "Always composed from profile.gamePort.",
  },
  {
    id: "server-platform",
    pattern: /^-ServerPlatform(=|$)/i,
    token: "-ServerPlatform=",
    notes: "Defaults to ALL unless raw extraArgs already sets ServerPlatform.",
  },
  {
    id: "mods",
    pattern: /^-mods(=|$)/i,
    token: "-mods=",
    notes: "Composed from profile.mods minus disabledMods.",
  },
  {
    id: "clusterid",
    pattern: /^-clusterid(=|$)/i,
    token: "-clusterid=",
    notes: "Emitted with cluster dir + NoTransferFromFiltering when clustered.",
  },
  {
    id: "cluster-dir",
    pattern: /^-ClusterDirOverride(=|$)/i,
    token: "-ClusterDirOverride=",
    notes: "Emitted with clusterid when both cluster fields are set.",
  },
  {
    id: "no-transfer-from-filtering",
    pattern: /^-NoTransferFromFiltering$/i,
    token: "-NoTransferFromFiltering",
    notes: "Emitted with the cluster trio when clustered.",
  },
];

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "YARK-server-manager-catalog-builder/0.1 (+https://github.com/gabomarin/yark)",
          Accept: "application/json",
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location).then(resolve, reject);
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    req.on("error", reject);
  });
}

function extractTemplates(section) {
  const blocks = [];
  const re = /\{\{Server config variable\n/g;
  let m;
  while ((m = re.exec(section))) {
    let i = m.index + m[0].length;
    let depth = 1;
    let j = i;
    while (j < section.length && depth > 0) {
      const open = section.indexOf("{{", j);
      const close = section.indexOf("}}", j);
      if (close < 0) break;
      if (open >= 0 && open < close) {
        depth += 1;
        j = open + 2;
      } else {
        depth -= 1;
        j = close + 2;
        if (depth === 0) {
          blocks.push(section.slice(m.index, close + 2));
          break;
        }
      }
    }
  }
  return blocks;
}

function parseTemplateFields(body) {
  const inner = body
    .replace(/^\{\{Server config variable\n/, "")
    .replace(/\}\}$/, "");
  const fields = {};
  let cur = null;
  const buf = [];
  const flush = () => {
    if (cur) fields[cur] = buf.join("\n").trim();
  };
  for (const line of inner.split("\n")) {
    const mm = line.match(/^\|\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (mm) {
      flush();
      cur = mm[1];
      buf.length = 0;
      buf.push(mm[2]);
    } else if (cur) {
      buf.push(line);
    }
  }
  flush();
  return fields;
}

function stripInline(text) {
  return String(text || "")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,3}/g, "")
    .replace(/<\/?br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convert wiki HTML tables into compact prose so option lists are not dropped. */
function htmlTablesToProse(html) {
  const chunks = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let match;
  while ((match = tableRe.exec(html))) {
    const rows = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(match[0]))) {
      const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        stripInline(c[1]),
      );
      if (cells.length < 2) continue;
      const key = cells[0];
      const desc = cells.slice(1).join(" — ");
      if (!key || !desc) continue;
      if (/^(eventname|argument|option|name|value|description)$/i.test(key)) continue;
      if (/^description$/i.test(desc)) continue;
      rows.push(`${key} — ${desc}`);
    }
    if (rows.length > 0) {
      chunks.push(`Options: ${rows.join("; ")}`);
    }
  }
  return chunks;
}

/**
 * Clean wiki markup/noise while preserving mentioned facts (including table rows).
 */
function normalizeWikiInfo(text) {
  let s = String(text || "");
  const tableProse = htmlTablesToProse(s);
  s = s.replace(/<table[\s\S]*?<\/table>/gi, " ");
  s = stripInline(s)
    .replace(/\bARK:\s*Survival Ascended:\s*/gi, "ASA: ")
    .replace(/\bARK:\s*Survival Evolved:\s*/gi, "ASE: ")
    .replace(/\bASA:\s*ASA:/gi, "ASA:")
    .replace(/\s+/g, " ")
    .trim();
  if (tableProse.length > 0) {
    s = [s, ...tableProse].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  return s;
}

function splitSummaryDetails(full) {
  const text = String(full || "").trim();
  if (!text) {
    return { summary: "No description on the wiki row.", details: "" };
  }
  const sentence = text.match(/^(.{24,160}?[.!?])(?:\s+|$)([\s\S]*)$/);
  if (sentence) {
    return { summary: sentence[1].trim(), details: sentence[2].trim() };
  }
  if (text.length <= 140) {
    return { summary: text, details: "" };
  }
  const cut = text.lastIndexOf(" ", 140);
  const at = cut > 60 ? cut : 140;
  return {
    summary: `${text.slice(0, at).trim()}…`,
    details: text.slice(at).trim(),
  };
}

function firstTableOptionCode(rawInfo) {
  const html = String(rawInfo || "");
  const codes = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html))) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      stripInline(c[1]),
    );
    if (cells.length < 1) continue;
    const key = cells[0];
    if (!key || /^(eventname|argument|option|name|value|description)$/i.test(key)) {
      continue;
    }
    if (/^[A-Za-z][\w.-]*$/.test(key)) codes.push(key);
  }
  if (codes.includes("WinterWonderland")) return "WinterWonderland";
  if (codes.includes("None")) {
    const other = codes.find((c) => c !== "None");
    if (other) return other;
  }
  return codes[0] ?? null;
}

function sampleForPlaceholder(placeholder, token, numericDefault, tableFirstValue) {
  const raw = String(placeholder || "").replace(/^<|>$/g, "").trim();
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  const tokenLower = String(token || "").toLowerCase();

  if (/^path$/i.test(key) || /diroverride|clusterdir=/i.test(tokenLower)) {
    return "C:\\ARK\\Cluster";
  }
  if (/savedir|directory_?name/i.test(key) || /altsavedirectory/i.test(tokenLower)) {
    return "ClusterSave";
  }
  if (/path|dir|directory|folder/i.test(key)) {
    return "C:\\ARK\\Cluster";
  }
  if (/url/i.test(key) || /url=/i.test(tokenLower)) {
    return "https://metrics.example.com/asa";
  }
  if (/cluster/i.test(key) || /clusterid=/i.test(tokenLower)) {
    return "my-cluster";
  }
  if (
    /ipv4|ip_?address|^ip$/i.test(key) ||
    /-ip=/i.test(tokenLower) ||
    /serverip|publicip/i.test(tokenLower)
  ) {
    return "203.0.113.10";
  }
  if (/port/i.test(key) || /-port=/i.test(tokenLower)) {
    return "7777";
  }
  if (/session/i.test(key) || /sessionname/i.test(tokenLower)) {
    return "MyASAServer";
  }
  if (/^map$/i.test(key)) {
    return "TheIsland_WP";
  }
  if (/plat/i.test(key) || /serverplatform/i.test(tokenLower)) {
    return "ALL";
  }
  if (/lang/i.test(key)) {
    return "en";
  }
  if (/modid/i.test(key) || /-mods=/i.test(tokenLower)) {
    return "928988";
  }
  if (/event/i.test(key)) {
    return tableFirstValue || "None";
  }
  if (/biome|tag|zone/i.test(key)) {
    return raw && !/^[<\s]/.test(raw) ? raw.replace(/\s+/g, "") : "newBiomesStructuresZones";
  }
  if (/float|multiplier|chance/i.test(key)) {
    return numericDefault ?? "1.0";
  }
  if (/integer|int|count|players|seconds|minutes|epoch|time|amount|gb|number/i.test(key)) {
    return numericDefault ?? (/epoch|time/i.test(key) ? "1704067200" : "35");
  }
  if (/name/i.test(key)) {
    return "MyASAServer";
  }
  if (tableFirstValue) return tableFirstValue;
  if (numericDefault) return numericDefault;
  return "sample";
}

function buildExample(token, valueType, fields, tableFirstValue) {
  const raw = String(token || "").trim();
  // Space-separated alternatives ("-d3d10 -dx10 -sm4") → one pasteable token.
  if (valueType === "flag") {
    return raw.split(/\s+/)[0] || raw;
  }

  const compact = raw.replace(/\s+/g, "");
  const wikiDefault = stripInline(fields.default || "");
  const numericDefault = /^\d+(\.\d+)?$/.test(wikiDefault) ? wikiDefault : null;

  if (/SessionName=/i.test(compact) && !compact.startsWith("-")) {
    return `"TheIsland_WP"?SessionName="MyASAServer"`;
  }
  if (/^-ServerPlatform=/i.test(compact)) {
    return "-ServerPlatform=ALL";
  }
  if (/^-mods=/i.test(compact)) {
    return "-mods=928988,929420";
  }

  let example = compact
    .replace(/\[,[^\]]*\]/g, "")
    .replace(/\[\.\.\.\]/g, "")
    .replace(/\[[+\w<>./:-]*\]/g, "")
    // Nested optional markers (e.g. `[,<ModId2>[...]]`) can leave stray brackets.
    .replace(/[\[\]]/g, "");

  example = example.replace(/<[^>]+>/g, (ph) =>
    sampleForPlaceholder(ph, compact, numericDefault, tableFirstValue),
  );

  if (example.endsWith("=")) {
    example += sampleForPlaceholder("value", compact, numericDefault, tableFirstValue);
  }

  return example;
}

function inferValueType(token) {
  if (!/=/.test(token)) return "flag";
  if (/\[,/i.test(token) || /,\s*\[/i.test(token) || /\[\.\.\.\]/.test(token)) {
    return "csv";
  }
  if (/<(amount|port|num|number|count|players|gb|seconds|minutes)[^>]*>/i.test(token)) {
    return "number";
  }
  if (/<[a-z_]+name>/i.test(token) || /<eventname>/i.test(token) || /<lang_code>/i.test(token)) {
    return "enum";
  }
  return "string";
}

function tokenId(token) {
  return token
    .replace(/^\?/, "q-")
    .replace(/^-/, "")
    .replace(/[<>=",?\s/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function findYarkOwned(token) {
  return YARK_OWNED.find((row) => row.pattern.test(token)) ?? null;
}

function classifyStatus(fields, owned) {
  if (owned) return "yarkOwned";
  if (String(fields.status || "").toLowerCase() === "deprecated") return "unsupported";
  const asa = String(fields.inASA || "").trim();
  if (asa === "Yes") return "supported";
  if (asa === "No") return "unsupported";
  return "uncertain";
}

function defaultSemantics(fields, valueType) {
  const d = stripInline(fields.default || "");
  if (d) return `If omitted, ASA uses ${d}.`;
  if (valueType === "flag") return "If omitted, this option stays off.";
  return "If omitted, ASA keeps its built-in default.";
}

/** Curated operator copy for noisy / misleading wiki rows (ASA-first). */
const OPERATOR_COPY_OVERRIDES = {
  "-ActiveEvent=<eventname>": {
    summary:
      "Legacy event switch — leave it off; use CurseForge event mods with -mods instead.",
    details:
      "ASA treats this as obsolete: prefer event mods on the Mods panel / -mods=. Only one name can be set, and most historic events no longer work (WinterWonderland was the last with partial support). Putting ActiveEvent in GameUserSettings.ini has no effect.",
    example: "-ActiveEvent=None",
    defaultSemantics: "If omitted, no forced ActiveEvent is applied (recommended).",
    description:
      "Legacy event switch — leave it off; use CurseForge event mods with -mods instead. ASA treats this as obsolete: prefer event mods on the Mods panel / -mods=. Only one name can be set, and most historic events no longer work (WinterWonderland was the last with partial support). Putting ActiveEvent in GameUserSettings.ini has no effect.",
  },
};

function buildCopyFields(token, valueType, fields, owned) {
  const override = OPERATOR_COPY_OVERRIDES[String(token || "").trim()];
  if (override && !owned) {
    return {
      summary: override.summary,
      details: override.details,
      description: override.description,
      example: override.example,
      defaultSemantics: override.defaultSemantics,
    };
  }

  const rawInfo = fields.info || "";
  const full = owned?.notes
    ? owned.notes
    : normalizeWikiInfo(rawInfo) || "No description on the wiki row.";
  const { summary, details } = splitSummaryDetails(full);
  const tableFirst = firstTableOptionCode(rawInfo);
  const example = buildExample(token, valueType, fields, tableFirst);
  return {
    summary,
    details,
    description: full,
    example,
    defaultSemantics: undefined,
  };
}

function buildEntries(rows, reviewedAt) {
  /** @type {Map<string, object>} */
  const byId = new Map();
  for (const fields of rows) {
    const token = String(fields.name || "").trim();
    if (!token) continue;
    const owned = findYarkOwned(token);
    const valueType = inferValueType(token);
    const status = classifyStatus(fields, owned);
    const id = owned?.id ?? tokenId(token);
    const copy = buildCopyFields(token, valueType, fields, owned);
    const entry = {
      id,
      token,
      aliases: [],
      valueType,
      category: "Command line",
      summary: copy.summary,
      details: copy.details,
      description: copy.description,
      example: copy.example,
      defaultSemantics: owned?.notes
        ? owned.notes
        : copy.defaultSemantics ?? defaultSemantics(fields, valueType),
      status,
      conflicts: owned ? [`extraArgs:${token.split("=")[0]}`] : [],
      wikiAsa: String(fields.inASA || "Unknown"),
      wikiAse: String(fields.inASE || "Unknown"),
      wikiDeprecated: String(fields.status || "").toLowerCase() === "deprecated",
      wikiSincePatch: stripInline(fields.version || "") || null,
      sources: [
        {
          label: "ark.wiki.gg Server configuration — Command line options",
          url: SOURCE_URL,
        },
      ],
      reviewedAt,
      notes: owned
        ? "YARK-owned lifecycle/profile argument — excluded from user-selectable options."
        : status === "uncertain"
          ? "Wiki ASA column is Unknown (neither Check nor Missing) — keep for audit only."
          : status === "unsupported" && String(fields.inASA) === "No"
            ? "Wiki ASA column is Missing — not advertised as ASA-supported."
            : undefined,
    };
    const prev = byId.get(id);
    if (
      !prev ||
      (entry.description.length > prev.description.length && prev.status === entry.status)
    ) {
      byId.set(id, entry);
    }
  }

  for (const owned of YARK_OWNED) {
    if (byId.has(owned.id)) continue;
    const token = owned.token;
    const valueType = inferValueType(token);
    const copy = buildCopyFields(token, valueType, { info: owned.notes, default: "" }, owned);
    byId.set(owned.id, {
      id: owned.id,
      token,
      aliases: [],
      valueType,
      category: "Lifecycle",
      summary: copy.summary,
      details: copy.details,
      description: copy.description,
      example: copy.example,
      defaultSemantics: owned.notes,
      status: "yarkOwned",
      conflicts: [`extraArgs:${token.split("=")[0]}`],
      wikiAsa: "n/a",
      wikiAse: "n/a",
      wikiDeprecated: false,
      wikiSincePatch: null,
      sources: [
        {
          label: "YARK launch-args.ts",
          url: "https://github.com/gabomarin/yark/blob/main/src/backend/domains/instances/launch-args.ts",
        },
      ],
      reviewedAt,
      notes: "Synthetic YARK-owned entry — not sourced from the wiki Argument table.",
    });
  }

  return [...byId.values()].sort((a, b) => a.token.localeCompare(b.token));
}

async function loadWikitext() {
  const override = process.env.ASA_LAUNCH_OPTIONS_WIKI_JSON;
  if (override) {
    const raw = fs.readFileSync(override, "utf8");
    return JSON.parse(raw).parse.wikitext;
  }
  const raw = await fetchText(API_URL);
  return JSON.parse(raw).parse.wikitext;
}

async function main() {
  const wikitext = await loadWikitext();
  const start = wikitext.indexOf("== Command line options ==");
  const end = wikitext.indexOf("==Configuration Files==");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Could not locate Command line options section in wikitext");
  }
  const section = wikitext.slice(start, end);
  const templates = extractTemplates(section);
  const rows = templates.map(parseTemplateFields);
  const reviewedAt = new Date().toISOString().slice(0, 10);
  const entries = buildEntries(rows, reviewedAt);

  const counts = { supported: 0, unsupported: 0, uncertain: 0, yarkOwned: 0 };
  for (const e of entries) counts[e.status] += 1;

  const catalog = {
    version: CATALOG_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      url: SOURCE_URL,
      page: "Server_configuration",
      section: "Command_line_options",
      note: "ASA Check/Missing icons come from template field inASA (Yes/No/Unknown). Catalog is reviewed offline; wiki is not trusted at runtime.",
    },
    ownershipRules: {
      yarkOwnedExcludedFromSelectable: true,
      uncertainNotSelectable: true,
      unsupportedNotSelectable: true,
      composerOrder: [
        '"Map"?SessionName=',
        "-port=",
        "-ServerPlatform=ALL (default)",
        "-mods=",
        "-clusterid= / -ClusterDirOverride= / -NoTransferFromFiltering",
        "extraArgs…",
      ],
    },
    counts,
    entries,
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${entries.length} entries → ${path.relative(ROOT, OUT_PATH)} (${JSON.stringify(counts)})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
