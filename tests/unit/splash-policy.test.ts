import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  SPLASH_MAX_DATA_URL_CHARS,
  SPLASH_MIN_MS,
  applySplashVersion,
  buildSplashDocument,
  escapeHtml,
  privateSplashDirName,
  remainingSplashHoldMs,
  shouldShowSplash,
  splashDocumentDataUrl,
  splashDocumentDataUrlIfSafe,
  stripSvgProlog,
  stripSvgSmiAnimations,
  writePrivateSplashDocument,
} from "../../src/main/splash-policy";

describe("shouldShowSplash", () => {
  it("shows by default", () => {
    expect(shouldShowSplash({})).toBe(true);
  });

  it("skips when YARK_SKIP_SPLASH=1", () => {
    expect(shouldShowSplash({ YARK_SKIP_SPLASH: "1" })).toBe(false);
  });

  it("skips isolated E2E profiles unless YARK_E2E_FULL_UI=true", () => {
    expect(shouldShowSplash({ YARK_E2E_USER_DATA: "C:\\asa-e2e\\profiles\\smoke" })).toBe(false);
    expect(shouldShowSplash({ YARK_E2E_USER_DATA: "   " })).toBe(true);
    expect(
      shouldShowSplash({
        YARK_E2E_USER_DATA: "C:\\yark_dev_profile",
        YARK_E2E_FULL_UI: "true",
      }),
    ).toBe(true);
    expect(
      shouldShowSplash({
        YARK_E2E_USER_DATA: "C:\\yark_dev_profile",
        YARK_E2E_FULL_UI: "false",
      }),
    ).toBe(false);
  });
});

describe("remainingSplashHoldMs", () => {
  it("holds for a short 1.5s floor", () => {
    expect(SPLASH_MIN_MS).toBe(1_500);
    expect(remainingSplashHoldMs(1_000, 1_000)).toBe(1_500);
    expect(remainingSplashHoldMs(1_000, 2_000)).toBe(500);
    expect(remainingSplashHoldMs(1_000, 2_500)).toBe(0);
  });
});

describe("applySplashVersion", () => {
  it("injects a v-prefixed escaped version", () => {
    expect(applySplashVersion("ver __YARK_VERSION__", "1.2.3")).toBe("ver v1.2.3");
  });

  it("escapes HTML in the version label", () => {
    expect(escapeHtml(`<b>"&'`)).toBe("&lt;b&gt;&quot;&amp;&#39;");
    expect(applySplashVersion("__YARK_VERSION__", `<img>`)).toBe("v&lt;img&gt;");
  });

  it("clears the placeholder when version is blank", () => {
    expect(applySplashVersion("(__YARK_VERSION__)", "  ")).toBe("()");
  });
});

describe("buildSplashDocument", () => {
  it("inlines the brand SVG without its XML prolog", () => {
    const svg = `<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.0//EN" "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd">\n<svg viewBox="0 0 10 10"></svg>`;
    expect(stripSvgProlog(svg)).toBe(`<svg viewBox="0 0 10 10"></svg>`);
    expect(
      buildSplashDocument(`<div>__YARK_SPLASH_SVG__</div><p>__YARK_VERSION__</p>`, svg, "0.11.0"),
    ).toBe(`<div><svg viewBox="0 0 10 10"></svg></div><p>v0.11.0</p>`);
  });

  it("strips SMIL animate so reduced-motion CSS can own the glow", () => {
    const svg = `<svg><g class="yark-glow-soft" opacity="0.20"><animate attributeName="opacity" values="0.20;0.85;0.20" dur="2.6s" repeatCount="indefinite"/><circle/></g><g><animate attributeName="opacity" values="0.28;1;0.28" dur="2.6s">ignored</animate></g></svg>`;
    expect(stripSvgSmiAnimations(svg)).toBe(
      `<svg><g class="yark-glow-soft" opacity="0.20"><circle/></g><g></g></svg>`,
    );
    expect(buildSplashDocument(`__YARK_SPLASH_SVG__`, svg, "")).not.toMatch(/<animate\b/i);
  });
});

describe("splashDocumentDataUrl", () => {
  it("encodes HTML as a base64 data URL under Chromium's max length", () => {
    const url = splashDocumentDataUrl("<p>YARK</p>");
    expect(url.startsWith("data:text/html;charset=utf-8;base64,")).toBe(true);
    expect(Buffer.from(url.split(",")[1] ?? "", "base64").toString("utf8")).toBe("<p>YARK</p>");
    expect(splashDocumentDataUrlIfSafe("<p>YARK</p>")).toBe(url);
    expect(url.length).toBeLessThan(SPLASH_MAX_DATA_URL_CHARS);
  });

  it("refuses data URLs that would exceed Chromium's navigation limit", () => {
    const oversized = "x".repeat(SPLASH_MAX_DATA_URL_CHARS);
    expect(splashDocumentDataUrlIfSafe(oversized)).toBeUndefined();
  });
});

describe("writePrivateSplashDocument", () => {
  const root = mkdtempSync(join(tmpdir(), "yark-splash-test-"));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes exclusively into a unique private directory", () => {
    const filePath = writePrivateSplashDocument("<html>ok</html>", root, "abc");
    expect(filePath).toBe(join(root, privateSplashDirName("abc"), "splash.html"));
    expect(readFileSync(filePath, "utf8")).toBe("<html>ok</html>");
  });

  it("fails closed when the target directory already exists", () => {
    mkdirSync(join(root, privateSplashDirName("taken")));
    expect(() => writePrivateSplashDocument("x", root, "taken")).toThrow();
  });
});
