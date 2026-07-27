const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const OUT = path.join(DOCS, "asa-server-settings-catalog.json");

const GUS_PATH = "c:\\Users\\Gabriel\\Downloads\\GameUserSettings.ini";
const GAME_PATH = "c:\\Users\\Gabriel\\Downloads\\Game.ini";
const WIKI_HTML = path.join(DOCS, "ark-wiki-gg-server-configuration.html");
const WIKI_MD =
  "C:\\Users\\Gabriel\\.cursor\\projects\\f-projects-ark-server-gbo\\agent-tools\\fe305625-55df-48be-8456-9a3584a59d0c.txt";

const GUS_KEEP_SECTIONS = new Set([
  "ServerSettings",
  "SessionSettings",
  "MessageOfTheDay",
  "/Script/Engine.GameSession",
]);

const GUS_EXCLUDE_CLIENT_KEYS = /^(LastJoinedSessionPerCategory|LastServerSearch|LastServerSearchResult|LastLocalSession|LastSession|PlayedMaps|PinnedMaps|ServerList|UI|Resolution|Fullscreen|Graphics|Audio|Gamma|Mouse|Controller)/i;

const ambiguousAseAsa = [];

function cleanText(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseIniFile(filePath, fileTag, sectionFilter) {
  const text = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const settings = [];
  let section = "";
  let comments = [];

  function flushComments() {
    comments = [];
  }

  function parseCommentMeta(commentLines) {
    let defaultValue;
    let valueType;
    const descParts = [];
    for (const raw of commentLines) {
      const line = raw.replace(/^#\s?/, "");
      const def = line.match(/^Default value:\s*(.*)$/i);
      if (def) {
        defaultValue = cleanText(def[1]);
        continue;
      }
      const vt = line.match(/^Value type:\s*(.*)$/i);
      if (vt) {
        valueType = cleanText(vt[1]);
        continue;
      }
      const cleaned = cleanText(line);
      if (cleaned) descParts.push(cleaned);
    }
    return {
      defaultValue,
      valueType,
      description: descParts.join(" "),
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sec = line.match(/^\[([^\]]+)\]\s*$/);
    if (sec) {
      section = sec[1];
      flushComments();
      continue;
    }

    if (!line.trim()) {
      // blank lines often separate settings; keep comments until a key appears
      continue;
    }

    if (line.startsWith("#")) {
      // commented assignment vs metadata comment
      const commentedKey = line.match(/^#([A-Za-z_][\w\[\]<>]*)=(.*)$/);
      if (commentedKey && section) {
        const key = commentedKey[1];
        const assignedVal = cleanText(commentedKey[2]);
        const meta = parseCommentMeta(comments);
        const keepSection = !sectionFilter || sectionFilter(section);
        if (keepSection && !GUS_EXCLUDE_CLIENT_KEYS.test(key)) {
          let defaultValue =
            meta.defaultValue !== undefined
              ? meta.defaultValue
              : assignedVal === "N/A"
                ? ""
                : assignedVal;
          // ActiveMods / ActiveMapMod: include with empty default when N/A
          if (/^(ActiveMods|ActiveMapMod)$/i.test(key) && (!defaultValue || defaultValue === "N/A")) {
            defaultValue = "";
          }
          settings.push({
            section,
            key,
            defaultValue: defaultValue === "N/A" ? "" : defaultValue,
            description: meta.description || "",
            valueType: meta.valueType,
            file: fileTag,
            assigned: false,
            rawValue: assignedVal,
          });
        }
        flushComments();
        continue;
      }
      comments.push(line);
      continue;
    }

    const kv = line.match(/^([A-Za-z_][\w\[\]<>]*)=(.*)$/);
    if (kv && section) {
      const key = kv[1];
      const value = cleanText(kv[2]);
      const meta = parseCommentMeta(comments);
      const keepSection = !sectionFilter || sectionFilter(section);
      if (keepSection && !GUS_EXCLUDE_CLIENT_KEYS.test(key)) {
        const defaultValue =
          meta.defaultValue !== undefined ? meta.defaultValue : value;
        settings.push({
          section,
          key,
          defaultValue: defaultValue === "N/A" ? "" : defaultValue,
          description: meta.description || "",
          valueType: meta.valueType,
          file: fileTag,
          assigned: true,
          rawValue: value,
        });
      }
      flushComments();
      continue;
    }

    // unknown line — reset comment block
    flushComments();
  }

  // Prefer assigned over commented duplicates
  const byId = new Map();
  for (const s of settings) {
    const id = `${s.file}|${s.section}|${s.key}`;
    const prev = byId.get(id);
    if (!prev || (s.assigned && !prev.assigned)) byId.set(id, s);
  }
  return [...byId.values()];
}

function stripHtml(s) {
  return cleanText(
    String(s || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function cellHasCheck(td) {
  const t = String(td || "");
  if (/[✓✔☑]/u.test(t)) return true;
  if (/class="[^"]*(?:tick|check|yes|green)[^"]*"/i.test(t)) return true;
  if (/src="[^"]*(?:Yes|Tick|Check|Green|tick|check)[^"]*"/i.test(t)) return true;
  if (/title="[^"]*(?:yes|supported|available)[^"]*"/i.test(t)) return true;
  if (/File:(?:Yes|Tick|Check)/i.test(t)) return true;
  if (/\b(?:yes|true)\b/i.test(stripHtml(t)) && stripHtml(t).length < 8) return true;
  return false;
}

function cellHasCross(td) {
  const t = String(td || "");
  if (/[✗✘×✖]/u.test(t)) return true;
  if (/class="[^"]*(?:cross|no|red)[^"]*"/i.test(t)) return true;
  if (/File:(?:No|Cross|X)\b/i.test(t)) return true;
  if (/\b(?:no|false)\b/i.test(stripHtml(t)) && stripHtml(t).length < 8) return true;
  return false;
}

function inferAsaFromText(desc, sincePatch, arg) {
  const d = `${desc || ""} ${sincePatch || ""} ${arg || ""}`;
  const obsoleteAsa =
    /ARK:\s*Survival Ascended:\s*Obsolete/i.test(d) ||
    /ASA:\s*Obsolete/i.test(d) ||
    /Ascended:\s*Obsolete/i.test(d);
  const asaUnsupported =
    /In ASA .{0,80}not supported/i.test(d) ||
    /ASA is not supported/i.test(d) ||
    /not supported as well/i.test(d) ||
    /not available (?:in|on) ASA/i.test(d) ||
    /Unavailable in ASA/i.test(d);
  const aseOnly =
    /\bSteam only\b/i.test(d) ||
    /ASE only|Survival Evolved only|does not apply to ASA/i.test(d);
  const asaPatch = /^ASA\b/i.test(String(sincePatch || "").trim());
  const mentionsAsaUseful =
    /ARK:\s*Survival Ascended(?!:\s*Obsolete)|\bASA\b(?!:\s*Obsolete)/i.test(d);

  if (obsoleteAsa || asaUnsupported) {
    return { asa: false, reason: "wiki marks obsolete/unsupported for ASA", strong: true };
  }
  if (aseOnly && !mentionsAsaUseful) {
    return { asa: false, reason: "wiki text suggests ASE/Steam-only", strong: true };
  }
  if (asaPatch) {
    return { asa: true, reason: "since-patch ASA", strong: true };
  }
  // Empty ASA/ASE columns: include as ASA without flooding ambiguous list
  return { asa: true, reason: "assumed ASA (empty wiki ASA/ASE columns)", ambiguous: false };
}

function parseWikiMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const rows = [];
  let headers = null;
  let asaIdx = -1;
  let aseIdx = -1;
  let argIdx = -1;
  let defIdx = -1;
  let descIdx = -1;
  let typeIdx = -1;
  let sinceIdx = -1;
  let currentCategory = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(/^#{2,4}\s+(.*)$/);
    if (heading) {
      currentCategory = cleanText(heading[1]);
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^[-:\s]+$/.test(c))) continue; // separator

    const headerish =
      cells.some((c) => /^ASA$/i.test(c)) && cells.some((c) => /^ASE$/i.test(c));
    if (headerish) {
      headers = cells;
      asaIdx = cells.findIndex((h) => /^ASA$/i.test(h));
      aseIdx = cells.findIndex((h) => /^ASE$/i.test(h));
      argIdx = cells.findIndex((h) =>
        /argument|option|variable|setting|command/i.test(h),
      );
      if (argIdx < 0) {
        argIdx = cells.findIndex((_h, idx) => idx !== asaIdx && idx !== aseIdx);
      }
      defIdx = cells.findIndex((h) => /default/i.test(h));
      descIdx = cells.findIndex((h) => /description/i.test(h));
      typeIdx = cells.findIndex((h) => /^(type|value type)$/i.test(h));
      sinceIdx = cells.findIndex((h) => /since/i.test(h));
      continue;
    }
    if (!headers || argIdx < 0) continue;

    const argCell = cells[argIdx] || "";
    const argMatch = argCell.match(/`([^`]+)`/);
    let arg = cleanText(argMatch ? argMatch[1] : argCell);
    if (!arg || arg.length > 220) continue;
    // normalize command-line style to bare key when possible
    const keyGuess = arg
      .replace(/^[?\-]+/, "")
      .replace(/=.*$/, "")
      .replace(/<.*>/g, "")
      .replace(/\[.*\]/g, "")
      .trim();

    const asaTd = asaIdx >= 0 ? cells[asaIdx] || "" : "";
    const aseTd = aseIdx >= 0 ? cells[aseIdx] || "" : "";
    const asaCheck = cellHasCheck(asaTd);
    const asaCross = cellHasCross(asaTd);
    const aseCheck = aseIdx >= 0 ? cellHasCheck(aseTd) : null;
    const aseCross = aseIdx >= 0 ? cellHasCross(aseTd) : null;
    const desc = descIdx >= 0 ? cleanText(cells[descIdx] || "") : "";
    const sincePatch = sinceIdx >= 0 ? cleanText(cells[sinceIdx] || "") : "";
    const def =
      defIdx >= 0
        ? cleanText(cells[defIdx] || "")
        : (desc.match(/Default value:\s*`?([^`;]+)`?/i) || [])[1] || "";
    const valueType =
      typeIdx >= 0
        ? cleanText(cells[typeIdx] || "")
        : (desc.match(/Value type:\s*([^.]*)/i) || [])[1] || "";

    let asa;
    let ambiguous = false;
    let reason = "";
    let strong = false;
    if (asaCheck) {
      asa = true;
      reason = "wiki ASA check";
    } else if (asaCross) {
      asa = false;
      reason = "wiki ASA cross";
    } else {
      const inferred = inferAsaFromText(desc, sincePatch, arg);
      asa = inferred.asa;
      reason = inferred.reason;
      ambiguous = !!inferred.ambiguous;
      strong = !!inferred.strong;
    }

    rows.push({
      arg,
      key: keyGuess || arg,
      asa,
      ase: aseCheck === true ? true : aseCross ? false : null,
      asaCheck,
      asaCross,
      defaultValue: cleanText(String(def).replace(/^`|`$/g, "")),
      description: desc,
      valueType: cleanText(valueType),
      sincePatch,
      category: currentCategory,
      ambiguous,
      reason,
      strong: !!strong,
      isCommandLine: /^[-?]/.test(arg) || /command line/i.test(currentCategory),
    });
  }
  return rows;
}

function parseWikiHtml(html) {
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]);
  const relevant = tables.filter((t) => /ASA/i.test(t) && /ASE/i.test(t));
  const rows = [];
  for (const t of relevant) {
    const trs = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((x) => x[1]);
    if (!trs.length) continue;
    const headerCells = [...trs[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((x) =>
      stripHtml(x[1]),
    );
    const asaIdx = headerCells.findIndex((h) => /^ASA$/i.test(h));
    const aseIdx = headerCells.findIndex((h) => /^ASE$/i.test(h));
    if (asaIdx < 0) continue;
    let argIdx = headerCells.findIndex((h) =>
      /argument|option|variable|setting|command/i.test(h),
    );
    if (argIdx < 0) argIdx = headerCells.findIndex((_h, i) => i !== asaIdx && i !== aseIdx);
    const defIdx = headerCells.findIndex((h) => /default/i.test(h));
    const descIdx = headerCells.findIndex((h) => /description/i.test(h));
    const typeIdx = headerCells.findIndex((h) => /type|value type/i.test(h));
    const sinceIdx = headerCells.findIndex((h) => /since/i.test(h));

    for (let i = 1; i < trs.length; i++) {
      const rawCells = [...trs[i].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((x) => x[1]);
      if (rawCells.length < 3) continue;
      const arg = stripHtml(rawCells[argIdx] || "");
      if (!arg || arg.length > 220) continue;
      const asaTd = rawCells[asaIdx] || "";
      const aseTd = aseIdx >= 0 ? rawCells[aseIdx] || "" : "";
      const asaCheck = cellHasCheck(asaTd);
      const asaCross = cellHasCross(asaTd);
      const desc = descIdx >= 0 ? stripHtml(rawCells[descIdx] || "") : "";
      const sincePatch = sinceIdx >= 0 ? stripHtml(rawCells[sinceIdx] || "") : "";
      let asa = asaCheck ? true : asaCross ? false : null;
      let ambiguous = false;
      let reason = asaCheck ? "wiki ASA check" : asaCross ? "wiki ASA cross" : "";
      if (asa === null) {
        const inferred = inferAsaFromText(desc, sincePatch, arg);
        asa = inferred.asa;
        reason = inferred.reason;
        ambiguous = !!inferred.ambiguous;
      }
      const key = arg
        .replace(/^[?\-]+/, "")
        .replace(/=.*$/, "")
        .replace(/<.*>/g, "")
        .trim();
      rows.push({
        arg,
        key: key || arg,
        asa,
        ase: aseIdx >= 0 ? (cellHasCheck(aseTd) ? true : cellHasCross(aseTd) ? false : null) : null,
        asaCheck,
        asaCross,
        defaultValue: defIdx >= 0 ? stripHtml(rawCells[defIdx] || "") : "",
        description: desc,
        valueType: typeIdx >= 0 ? stripHtml(rawCells[typeIdx] || "") : "",
        sincePatch,
        category: "",
        ambiguous,
        reason,
        isCommandLine: /^[-?]/.test(arg),
      });
    }
  }
  return rows;
}


function cleanWikiDescription(desc) {
  return cleanText(String(desc || "")
    .replace(/Default value:\s*`?[^`]*`?/i, "")
    .replace(/Value type:\s*[^.]*?(?=\s*(?:If\b|Scales\b|Specifies\b|Enables\b|Disables\b|Used\b|States\b|Determines\b|Allows\b|Prevents\b|Overrides\b|Set\b|Same\b|See\b|Note:|Defines\b|Changes\b|Add\b|Rising\b)|$)/i, "")
    .trim());
}

function isPlausibleSettingKey(key) {
  if (!key || key.length < 2 || key.length > 80) return false;
  if (/^(True|False|Effects?|Yes|No|N\/A|CMD)$/i.test(key)) return false;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !/^[A-Za-z_][A-Za-z0-9_]*\[/.test(key)) return false;
  return true;
}

function normalizeKey(k) {
  return String(k || "")
    .replace(/\[.*?\]/g, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .toLowerCase();
}

function guessFileFromWiki(row) {
  const cat = `${row.category || ""} ${row.description || ""}`;
  if (/Game\.ini/i.test(cat) && !/GameUserSettings/i.test(cat)) return "game";
  if (/\[\/script\/shootergame\.shootergamemode\]/i.test(cat)) return "game";
  if (/GameUserSettings|ServerSettings|SessionSettings|MessageOfTheDay/i.test(cat)) {
    return "gameUserSettings";
  }
  if (row.isCommandLine) return "commandLine";
  return "unknown";
}

function guessSectionFromWiki(row) {
  const cat = row.category || "";
  const m = cat.match(/\[([^\]]+)\]/);
  if (m) return m[1];
  if (/ServerSettings/i.test(cat)) return "ServerSettings";
  if (/SessionSettings/i.test(cat)) return "SessionSettings";
  if (/MessageOfTheDay/i.test(cat)) return "MessageOfTheDay";
  if (/GameSession/i.test(cat)) return "/Script/Engine.GameSession";
  if (/shootergamemode/i.test(cat)) return "/script/shootergame.shootergamemode";
  return "";
}

// --- main ---
const gusSettings = parseIniFile(GUS_PATH, "gameUserSettings", (sec) =>
  GUS_KEEP_SECTIONS.has(sec),
);
const gameSettings = parseIniFile(GAME_PATH, "game", (sec) =>
  /^\/script\/shootergame\.shootergamemode$/i.test(sec),
);

const excludedNotes = [
  "GameUserSettings: kept only ServerSettings, SessionSettings, MessageOfTheDay, /Script/Engine.GameSession",
  "Excluded GUS sections: MultiHome, Ragnarok, ModInstaller (and any client sections if present)",
  "Game.ini: kept only [/script/shootergame.shootergamemode]; skipped [ModInstaller]",
  "Client-like keys matching LastJoinedSessionPerCategory etc. excluded",
];

let wikiRows = [];
let wikiSource = "";
if (fs.existsSync(WIKI_HTML)) {
  wikiRows = parseWikiHtml(fs.readFileSync(WIKI_HTML, "utf8"));
  wikiSource = WIKI_HTML;
  excludedNotes.push("Wiki ASA columns read from docs HTML");
} else if (fs.existsSync(WIKI_MD)) {
  wikiRows = parseWikiMarkdown(fs.readFileSync(WIKI_MD, "utf8"));
  wikiSource = WIKI_MD;
  excludedNotes.push(
    "Wiki HTML not present (Cloudflare blocked fetch); used agent-tools markdown.",
    "ASA/ASE icon columns are empty in the markdown conversion — cannot visually confirm check/cross marks.",
    "ASA applicability: include by default for config-file options; exclude when wiki text says Obsolete/unsupported for ASA or Steam/ASE-only; treat Since-patch starting with ASA as ASA-confirmed.",
  );
} else {
  excludedNotes.push("No wiki source found");
}

// Index wiki by normalized key (prefer config-file rows over command-line)
const wikiByKey = new Map();
for (const row of wikiRows) {
  if (!row.key) continue;
  const nk = normalizeKey(row.key);
  if (!nk) continue;
  const prev = wikiByKey.get(nk);
  if (!prev) {
    wikiByKey.set(nk, row);
    continue;
  }
  // Prefer non-command-line / ASA-true rows
  if (prev.isCommandLine && !row.isCommandLine) wikiByKey.set(nk, row);
  else if (prev.asa === false && row.asa === true) wikiByKey.set(nk, row);
}

const userIni = [...gusSettings, ...gameSettings];
const catalogByKey = new Map(); // file|section|key

function upsert(entry) {
  const id = `${entry.file}|${entry.section}|${entry.key}`;
  catalogByKey.set(id, entry);
}

for (const s of userIni) {
  const nk = normalizeKey(s.key);
  const wiki = wikiByKey.get(nk);
  let asa = true;
  let source = "userIni";
  if (wiki) {
    source = "both";
    asa = wiki.asa !== false;
    if (wiki.asa === false) {
      ambiguousAseAsa.push({
        key: s.key,
        section: s.section,
        file: s.file,
        reason: `excluded/not ASA per wiki: ${wiki.reason}`,
        sincePatch: wiki.sincePatch || "",
      });
    }
  } else {
    ambiguousAseAsa.push({
      key: s.key,
      section: s.section,
      file: s.file,
      reason: "present in user INI but not found in wiki tables",
      sincePatch: "",
    });
  }

  // Skip clearly non-ASA from wiki when cross-checked
  if (wiki && wiki.asa === false) {
    continue;
  }

  upsert({
    section: s.section,
    key: s.key,
    defaultValue: s.defaultValue,
    description: s.description || (wiki && wiki.description) || "",
    file: s.file,
    asa: true,
    server: true,
    source,
    category: wiki && wiki.category ? wiki.category : undefined,
    valueType: s.valueType || (wiki && wiki.valueType) || undefined,
  });
}

// Wiki-only ASA settings that look like INI config (not pure command-line)
for (const row of wikiRows) {
  if (!row.asa) continue;
  if (row.isCommandLine) continue;
  if (/DynamicConfig/i.test(row.category || "")) continue;
  if (!isPlausibleSettingKey(row.key)) continue;
  if (!row.description && !row.defaultValue && !row.valueType) continue;
  const file = guessFileFromWiki(row);
  if (file === "commandLine" || file === "unknown") continue;
  const nk = normalizeKey(row.key);
  const already = [...catalogByKey.values()].some((e) => normalizeKey(e.key) === nk);
  if (already) continue;

  const section =
    guessSectionFromWiki(row) ||
    (file === "game" ? "/script/shootergame.shootergamemode" : "ServerSettings");
  if (file === "gameUserSettings" && !GUS_KEEP_SECTIONS.has(section)) continue;

  upsert({
    section,
    key: row.key,
    defaultValue: row.defaultValue === "N/A" ? "" : row.defaultValue || "",
    description: cleanWikiDescription(row.description) || row.description || "",
    file,
    asa: true,
    server: true,
    source: "wiki",
    category: row.category || undefined,
    valueType: cleanText(row.valueType || "") || undefined,
  });
}

const settings = [...catalogByKey.values()].sort((a, b) => {
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  if (a.section !== b.section) return a.section.localeCompare(b.section);
  return a.key.localeCompare(b.key);
});

// Dedupe ambiguous list by key
const ambMap = new Map();
for (const a of ambiguousAseAsa) {
  const id = `${a.file}|${a.key}|${a.reason}`;
  if (!ambMap.has(id)) ambMap.set(id, a);
}
const ambiguousList = [...ambMap.values()];

const gusCount = settings.filter((s) => s.file === "gameUserSettings").length;
const gameCount = settings.filter((s) => s.file === "game").length;
const fromUserIni = settings.filter((s) => s.source === "userIni" || s.source === "both").length;
const bothCount = settings.filter((s) => s.source === "both").length;
const wikiOnlyCount = settings.filter((s) => s.source === "wiki").length;
const userIniOnlyCount = settings.filter((s) => s.source === "userIni").length;

const catalog = {
  settings,
  meta: {
    gusCount,
    gameCount,
    fromUserIni,
    wikiOnly: wikiOnlyCount,
    bothCount,
    userIniOnlyCount,
    wikiSource,
    wikiRowsParsed: wikiRows.length,
    wikiAsaTrue: wikiRows.filter((r) => r.asa).length,
    ambiguousAseAsaCount: ambiguousList.length,
    ambiguousAseAsa: ambiguousList,
    asaConfirmedBySincePatch: wikiRows
      .filter((r) => r.strong && r.asa === true && /since-patch ASA/i.test(r.reason))
      .map((r) => ({ key: r.key, sincePatch: r.sincePatch || "", category: r.category || "" })),
    strongAseAsaExclusions: wikiRows
      .filter((r) => r.asa === false)
      .map((r) => ({
        key: r.key,
        arg: r.arg,
        reason: r.reason,
        sincePatch: r.sincePatch || "",
        category: r.category || "",
        isCommandLine: !!r.isCommandLine,
      })),
    excludedNotes,
    generatedAt: new Date().toISOString(),
  },
};

fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2), "utf8");

console.log("Wrote", OUT);
console.log(
  JSON.stringify(
    {
      total: settings.length,
      gusCount,
      gameCount,
      fromUserIni,
      wikiOnly: wikiOnlyCount,
      bothCount,
      userIniOnlyCount,
      wikiRowsParsed: wikiRows.length,
      ambiguousAseAsaCount: ambiguousList.length,
      sample: settings.slice(0, 5),
    },
    null,
    2,
  ),
);
