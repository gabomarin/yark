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
      backgroundImage: true,
    });
  });

  it("falls back independently when family or scheme is unknown", () => {
    expect(
      normalizeAppearanceSettings({ themeFamily: "not-a-family", scheme: "sepia", panels: "auto" } as never),
    ).toEqual(DEFAULT_APPEARANCE_SETTINGS);
  });

  it("writes the new selection contract", () => {
    expect(
      encodeAppearanceSettings({
        themeFamily: "fluent",
        scheme: "light",
        panels: "auto",
        backgroundImage: true,
      }),
    ).toBe('{"themeFamily":"fluent","scheme":"light","panels":"auto","backgroundImage":true}');
  });

  it("accepts Glassy independently of the scheme", () => {
    expect(normalizeAppearanceSettings({ themeFamily: "glassy", scheme: "light", panels: "auto" })).toEqual({
      themeFamily: "glassy",
      scheme: "light",
      panels: "auto",
      backgroundImage: true,
    });
  });

  it("accepts the Plasma Breeze family independently of the scheme (#PUX-005-B)", () => {
    expect(normalizeAppearanceSettings({ themeFamily: "plasma-breeze", scheme: "light", panels: "auto" })).toEqual({
      themeFamily: "plasma-breeze",
      scheme: "light",
      panels: "auto",
      backgroundImage: true,
    });
    expect(
      encodeAppearanceSettings({
        themeFamily: "plasma-breeze",
        scheme: "dark",
        panels: "drawers",
        backgroundImage: false,
      }),
    ).toBe('{"themeFamily":"plasma-breeze","scheme":"dark","panels":"drawers","backgroundImage":false}');
  });

  it("keeps a stored background image choice and defaults a missing one to on", () => {
    expect(parseAppearanceSettings('{"themeFamily":"glassy","scheme":"dark","panels":"auto"}')).toMatchObject({
      backgroundImage: true,
    });
    expect(
      parseAppearanceSettings('{"themeFamily":"glassy","scheme":"dark","panels":"auto","backgroundImage":false}'),
    ).toMatchObject({ backgroundImage: false });
  });
});
