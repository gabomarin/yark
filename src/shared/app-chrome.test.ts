import { describe, expect, it } from "vitest";
import { BOOTSTRAP_BACKGROUND, bootstrapBackgroundFor, bootstrapBackgroundFromStored } from "./app-chrome";
import { DEFAULT_THEME_ID, THEME_IDS } from "./settings/appearance";

describe("app chrome bootstrap colours", () => {
  it("has a canvas for every theme id", () => {
    for (const id of THEME_IDS) {
      expect(bootstrapBackgroundFor(id), id).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps the default theme's canvas as the shared constant", () => {
    expect(BOOTSTRAP_BACKGROUND).toBe(bootstrapBackgroundFor(DEFAULT_THEME_ID));
  });

  it("reads the stored preference and falls back to the default theme", () => {
    expect(bootstrapBackgroundFromStored(null)).toBe(BOOTSTRAP_BACKGROUND);
    expect(bootstrapBackgroundFromStored("")).toBe(BOOTSTRAP_BACKGROUND);
    expect(bootstrapBackgroundFromStored("not json")).toBe(BOOTSTRAP_BACKGROUND);
    expect(bootstrapBackgroundFromStored('{"theme":"nope"}')).toBe(BOOTSTRAP_BACKGROUND);
    expect(bootstrapBackgroundFromStored('{"theme":"light"}')).toBe(bootstrapBackgroundFor("light"));
  });
});
