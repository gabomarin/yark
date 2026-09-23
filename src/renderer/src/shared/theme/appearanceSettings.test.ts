import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  encodeAppearanceSettings,
  normalizeAppearanceSettings,
  parseAppearanceSettings,
} from "@shared/settings/appearance";

describe("appearance theme selection", () => {
  it("migrates the former combined theme id into family and scheme", () => {
    expect(parseAppearanceSettings('{"theme":"light","panels":"drawers"}')).toEqual({
      themeFamily: "fluent",
      scheme: "light",
      panels: "drawers",
    });
  });

  it("falls back independently when family or scheme is unknown", () => {
    expect(
      normalizeAppearanceSettings({ themeFamily: "glassy", scheme: "sepia", panels: "auto" } as never),
    ).toEqual(
      DEFAULT_APPEARANCE_SETTINGS,
    );
  });

  it("writes the new selection contract", () => {
    expect(encodeAppearanceSettings({ themeFamily: "fluent", scheme: "light", panels: "auto" })).toBe(
      '{"themeFamily":"fluent","scheme":"light","panels":"auto"}',
    );
  });
});
