const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DOCS_HTML = path.join(ROOT, "docs", "ark-wiki-gg-server-configuration.html");
const AGENT_MD =
  "C:\\Users\\Gabriel\\.cursor\\projects\\f-projects-ark-server-gbo\\agent-tools\\fe305625-55df-48be-8456-9a3584a59d0c.txt";
const TEMP_HTML = path.join(process.env.TEMP || "/tmp", "ark-wiki-gg.html");

function resolveInput() {
  if (fs.existsSync(DOCS_HTML)) {
    return { path: DOCS_HTML, kind: "html" };
  }
  if (fs.existsSync(TEMP_HTML)) {
    return { path: TEMP_HTML, kind: "html" };
  }
  if (fs.existsSync(AGENT_MD)) {
    return { path: AGENT_MD, kind: "markdown" };
  }
  throw new Error(
    `No wiki source found. Expected one of:\n- ${DOCS_HTML}\n- ${TEMP_HTML}\n- ${AGENT_MD}`,
  );
}

function strip(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function cellHasCheck(td) {
  if (/[✓✔☑]/u.test(td)) return true;
  if (/class="[^"]*(?:tick|check|yes|green)[^"]*"/i.test(td)) return true;
  if (/src="[^"]*(?:Yes|Tick|Check|Green|tick|check)[^"]*"/i.test(td)) return true;
  if (/title="[^"]*(?:yes|supported|available)[^"]*"/i.test(td)) return true;
  if (/File:(?:Yes|Tick|Check)/i.test(td)) return true;
  return false;
}

function cellHasCross(td) {
  if (/[✗✘×✖]/u.test(td)) return true;
  if (/class="[^"]*(?:cross|no|red)[^"]*"/i.test(td)) return true;
  if (/File:(?:No|Cross|X)\b/i.test(td)) return true;
  return false;
}

function parseHtml(html) {
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]);
  const relevant = tables.filter((t) => /ASA/i.test(t) && /ASE/i.test(t));
  console.log("tables", tables.length, "asa/ase", relevant.length);

  const rows = [];
  for (const t of relevant) {
    const trs = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((x) => x[1]);
    if (trs.length === 0) continue;
    const headerCells = [...trs[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((x) =>
      strip(x[1]),
    );
    const asaIdx = headerCells.findIndex((h) => /^ASA$/i.test(h));
    const aseIdx = headerCells.findIndex((h) => /^ASE$/i.test(h));
    if (asaIdx < 0) continue;

    let argIdx = headerCells.findIndex((h) =>
      /argument|option|variable|setting|command/i.test(h),
    );
    if (argIdx < 0) {
      argIdx = headerCells.findIndex((_h, i) => i !== asaIdx && i !== aseIdx);
    }
    const defIdx = headerCells.findIndex((h) => /default/i.test(h));
    const descIdx = headerCells.findIndex((h) => /description/i.test(h));
    const typeIdx = headerCells.findIndex((h) => /type|value type/i.test(h));

    for (let i = 1; i < trs.length; i++) {
      const cells = [...trs[i].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((x) => x[1]);
      if (cells.length < 3) continue;
      const asaTd = cells[asaIdx] || "";
      const aseTd = aseIdx >= 0 ? cells[aseIdx] || "" : "";
      const asa = cellHasCheck(asaTd);
      const ase = aseIdx >= 0 ? cellHasCheck(aseTd) : null;
      const asaCross = cellHasCross(asaTd);
      const aseCross = aseIdx >= 0 ? cellHasCross(aseTd) : null;
      const arg = strip(cells[argIdx] || "");
      if (!arg || arg.length > 220) continue;
      rows.push({
        asa,
        ase,
        asaCross,
        aseCross,
        arg,
        default: defIdx >= 0 ? strip(cells[defIdx] || "") : "",
        type: typeIdx >= 0 ? strip(cells[typeIdx] || "") : "",
        desc: descIdx >= 0 ? strip(cells[descIdx] || "").slice(0, 220) : "",
        headers: headerCells.join(" | "),
        asaRaw: asaTd.slice(0, 160),
        aseRaw: aseTd.slice(0, 160),
      });
    }
  }
  return rows;
}

function parseMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const rows = [];
  let headers = null;
  let asaIdx = -1;
  let aseIdx = -1;
  let argIdx = -1;
  let defIdx = -1;
  let descIdx = -1;
  let typeIdx = -1;

  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^[-:\s]+$/.test(c))) continue;

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
        argIdx = cells.findIndex((_h, i) => i !== asaIdx && i !== aseIdx);
      }
      defIdx = cells.findIndex((h) => /default/i.test(h));
      descIdx = cells.findIndex((h) => /description/i.test(h));
      typeIdx = cells.findIndex((h) => /type|value type/i.test(h));
      continue;
    }
    if (!headers || argIdx < 0) continue;

    const argCell = cells[argIdx] || "";
    const m = argCell.match(/`([^`]+)`/);
    const arg = strip(m ? m[1] : argCell);
    if (!arg || arg.length > 220) continue;

    const asaTd = asaIdx >= 0 ? cells[asaIdx] || "" : "";
    const aseTd = aseIdx >= 0 ? cells[aseIdx] || "" : "";
    rows.push({
      asa: cellHasCheck(asaTd),
      ase: aseIdx >= 0 ? cellHasCheck(aseTd) : null,
      asaCross: cellHasCross(asaTd),
      aseCross: aseIdx >= 0 ? cellHasCross(aseTd) : null,
      arg,
      default: defIdx >= 0 ? strip(cells[defIdx] || "") : "",
      type: typeIdx >= 0 ? strip(cells[typeIdx] || "") : "",
      desc: descIdx >= 0 ? strip(cells[descIdx] || "").slice(0, 220) : "",
      headers: headers.join(" | "),
      asaRaw: asaTd.slice(0, 160),
      aseRaw: aseTd.slice(0, 160),
    });
  }
  console.log(
    "markdown tables with ASA/ASE headers parsed via streaming rows; row count",
    rows.length,
  );
  return rows;
}

const input = resolveInput();
console.log("wiki source:", input.kind, input.path);
const raw = fs.readFileSync(input.path, "utf8");
const rows = input.kind === "html" ? parseHtml(raw) : parseMarkdown(raw);

const asaAny = rows.filter((r) => r.asa);
const asaOnly = rows.filter((r) => r.asa && r.ase === false);
const both = rows.filter((r) => r.asa && r.ase === true);
const aseOnly = rows.filter((r) => !r.asa && r.ase === true);

console.log(
  JSON.stringify(
    {
      total: rows.length,
      asaAny: asaAny.length,
      asaOnly: asaOnly.length,
      both: both.length,
      aseOnly: aseOnly.length,
      uniqueHeaders: [...new Set(rows.map((r) => r.headers))],
      note:
        input.kind === "markdown"
          ? "Markdown conversion often has empty ASA/ASE icon columns; counts may be near zero."
          : undefined,
    },
    null,
    2,
  ),
);

console.log("sample first row cells asa/ase raw:");
console.log(JSON.stringify(rows.slice(0, 3), null, 2));

const outPath = path.join(__dirname, "..", "docs", "wiki-asa-settings-raw.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ rows, asaAny, asaOnly, both, aseOnly, source: input }, null, 2));
console.log("wrote", outPath);
