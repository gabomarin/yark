import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RENDERER_SRC = path.join(process.cwd(), "src", "renderer", "src");
const THEME_FILE = path.join(RENDERER_SRC, "shared", "theme", "theme.ts");

/** Extensions that can reference a CSS custom property. */
const SCANNED_EXTENSIONS = [".css", ".ts", ".tsx"] as const;

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    const file = path.join(entry.parentPath, entry.name);
    // Skip test files so this guard never scans its own examples.
    if (entry.isFile() && !/\.test\.tsx?$/.test(file) && SCANNED_EXTENSIONS.some((ext) => file.endsWith(ext))) {
      out.push(file);
    }
  }
  return out;
}

function definedAppTokens(): Set<string> {
  const source = fs.readFileSync(THEME_FILE, "utf8");
  const names = source.matchAll(/"(--app-[a-z0-9-]+)"/g);
  return new Set(Array.from(names, (match) => match[1] as string));
}

function usedAppTokens(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of walkFiles(RENDERER_SRC)) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/var\(\s*(--app-[a-z0-9-]+)/g)) {
      const name = match[1] as string;
      used.set(name, [...(used.get(name) ?? []), path.relative(RENDERER_SRC, file)]);
    }
  }
  return used;
}

/**
 * `var(--app-typo, #hex)` silently renders the fallback and drifts from the
 * palette (MaintenancePanel did exactly that with `--app-color-control`).
 * Unknown names with no fallback drop the declaration entirely
 * (DownloadsPage's `--app-font-caption` did that).
 */
describe("app token usage", () => {
  it("only references --app-* tokens the resolver actually defines", () => {
    const defined = definedAppTokens();
    const unknown = Array.from(usedAppTokens())
      .filter(([name]) => !defined.has(name))
      .map(([name, files]) => `${name} (${files.join(", ")})`);

    expect(unknown, `Undefined --app-* tokens: ${unknown.join(" | ")}`).toEqual([]);
  });

  it("never guards an --app-* token with a fallback", () => {
    // The resolver always defines these, so a fallback can only hide a typo or
    // freeze a hardcoded value (DeleteServerModal did both).
    const offenders: string[] = [];
    for (const file of walkFiles(RENDERER_SRC)) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/var\(\s*--app-[a-z0-9-]+\s*,[^)]*\)/g)) {
        offenders.push(`${path.relative(RENDERER_SRC, file)}: ${match[0]}`);
      }
    }
    expect(offenders, `Fallbacks on --app-* tokens: ${offenders.join(" | ")}`).toEqual([]);
  });
});
