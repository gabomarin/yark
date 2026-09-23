import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_BACKGROUND,
  BRAND_PLATE_BACKGROUND,
  ERROR_SCREEN_BACKGROUND,
  ERROR_SCREEN_MUTED,
  ERROR_SCREEN_TEXT,
  bootstrapBackgroundFor,
  bootstrapBackgroundFromStored,
} from "./app-chrome";
import { DEFAULT_THEME_SCHEME, THEME_SCHEMES } from "./settings/appearance";

describe("app chrome bootstrap colours", () => {
  it("has a canvas for every color scheme", () => {
    for (const scheme of THEME_SCHEMES) {
      expect(bootstrapBackgroundFor(scheme), scheme).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps the default theme's canvas as the shared constant", () => {
    expect(BOOTSTRAP_BACKGROUND).toBe(bootstrapBackgroundFor(DEFAULT_THEME_SCHEME));
  });

  it("reads the stored preference and falls back to the default theme", () => {
    expect(bootstrapBackgroundFromStored(null)).toBe(BOOTSTRAP_BACKGROUND);
    expect(bootstrapBackgroundFromStored("")).toBe(BOOTSTRAP_BACKGROUND);
    expect(bootstrapBackgroundFromStored("not json")).toBe(BOOTSTRAP_BACKGROUND);
    expect(bootstrapBackgroundFromStored('{"theme":"nope"}')).toBe(BOOTSTRAP_BACKGROUND);
    expect(bootstrapBackgroundFromStored('{"theme":"light"}')).toBe(bootstrapBackgroundFor("light"));
  });
});

/*
 * The plate cannot be imported by a static HTML document and the theme authors it as a CSS
 * variable, so the three literals could drift apart on a rebrand without anything failing.
 */
describe("brand plate literals", () => {
  const read = (relative: string): string => readFileSync(join(process.cwd(), relative), "utf8");

  it("keeps the splash document on the exported constant", () => {
    expect(read("src/main/splash/splash.html")).toContain(BRAND_PLATE_BACKGROUND);
  });

  it("keeps the theme's rendered variable on the exported constant", () => {
    const snapshot = JSON.parse(read("src/renderer/src/shared/theme/darkResolverSnapshot.json")) as {
      variables: Record<string, string>;
    };
    expect(snapshot.variables["--app-brand-plate"]).toBe(BRAND_PLATE_BACKGROUND);
  });

  it("keeps the crash-screen literals on the rendered dark ramp", () => {
    const snapshot = JSON.parse(read("src/renderer/src/shared/theme/darkResolverSnapshot.json")) as {
      variables: Record<string, string>;
    };
    // The boundary cannot read these at runtime, so the drift this catches is silent otherwise:
    // a literal that no longer matches the ramp looks wrong on the one screen nobody hunts for.
    expect(ERROR_SCREEN_BACKGROUND).toBe(BOOTSTRAP_BACKGROUND);
    expect(ERROR_SCREEN_TEXT).toBe(snapshot.variables["--app-color-text"]);
    expect(ERROR_SCREEN_MUTED).toBe(snapshot.variables["--ark-gray-11"]);
  });
});
