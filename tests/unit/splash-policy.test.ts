import { describe, expect, it } from "vitest";
import {
  SPLASH_MIN_MS,
  applySplashVersion,
  buildSplashDocument,
  escapeHtml,
  remainingSplashHoldMs,
  shouldShowSplash,
  stripSvgProlog,
} from "../../src/main/splash-policy";

describe("shouldShowSplash", () => {
  it("shows by default", () => {
    expect(shouldShowSplash({})).toBe(true);
  });

  it("skips when YARK_SKIP_SPLASH=1", () => {
    expect(shouldShowSplash({ YARK_SKIP_SPLASH: "1" })).toBe(false);
  });

  it("skips isolated E2E profiles", () => {
    expect(shouldShowSplash({ YARK_E2E_USER_DATA: "C:\\asa-e2e\\profiles\\smoke" })).toBe(false);
    expect(shouldShowSplash({ YARK_E2E_USER_DATA: "   " })).toBe(true);
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
});
