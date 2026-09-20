import { DEFAULT_THEME } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { createAppCssVariablesResolverForAppearance, createAppThemeForAppearance } from "./theme";
import { APP_THEME_LIST, DEFAULT_APP_THEME, THEMES, resolveAppTheme } from "./themes";
import { radixPalette } from "./tokens";

describe("theme registry (#PUX-004 Track B)", () => {
  it("ships the dark theme as a named registry entry", () => {
    expect(THEMES.dark.id).toBe("dark");
    expect(THEMES.dark.label).toBe("Dark");
    expect(THEMES.dark.colorScheme).toBe("dark");
    expect(DEFAULT_APP_THEME).toBe(THEMES.dark);
    expect(APP_THEME_LIST.map((theme) => theme.id)).toEqual(["dark"]);
  });

  it("falls back to the default theme for an unknown or missing id", () => {
    expect(resolveAppTheme("light").id).toBe("dark");
    expect(resolveAppTheme(null).id).toBe("dark");
    expect(resolveAppTheme(undefined).id).toBe("dark");
  });

  it("carries the palette as data, so a second theme is an entry and not a second design system", () => {
    // The registry entry owns the palette: `theme.ts` reads it instead of the
    // shipped import, which is what makes a new theme a data change.
    expect(THEMES.dark.palette).toBe(radixPalette);

    const vars = createAppCssVariablesResolverForAppearance(DEFAULT_APP_THEME, "compact")(DEFAULT_THEME).variables;
    expect(vars["--ark-gray-2"]).toBe(radixPalette.gray[1]);
    expect(vars["--ark-background"]).toBe(radixPalette.background);
    // Roles stay shared and keep pointing at the palette steps.
    expect(vars["--app-color-surface-chrome"]).toBe("var(--ark-gray-2)");
    expect(vars["--app-color-bg"]).toBe("var(--ark-background)");
  });

  it("derives every --ark-* value from the palette, so a theme stays data", () => {
    // Guards the claim in themes.ts: if a value is hardcoded in the builder, a
    // second theme would silently inherit dark-oriented steps.
    const vars = createAppCssVariablesResolverForAppearance(DEFAULT_APP_THEME, "compact")(DEFAULT_THEME).variables;
    const paletteValues = new Set<string>([
      ...radixPalette.blue,
      ...radixPalette.blueAlpha,
      ...radixPalette.gray,
      ...radixPalette.grayAlpha,
      radixPalette.background,
      radixPalette.blueContrast,
      radixPalette.blueSurface,
      radixPalette.grayContrast,
      radixPalette.graySurface,
    ]);

    const hardcoded = Object.entries(vars)
      .filter(([key]) => key.startsWith("--ark-"))
      .filter(([, value]) => !paletteValues.has(value))
      .map(([key]) => key);

    expect(hardcoded).toEqual([]);
  });

  it("feeds the entry palette into the Mantine colour scales", () => {
    const theme = createAppThemeForAppearance(DEFAULT_APP_THEME, "compact");

    expect(theme.colors?.dark?.[0]).toBe(radixPalette.gray[11]);
    expect(theme.colors?.blue?.[5]).toBe(radixPalette.blue[8]);
  });

  it("composes with density: colours follow the theme, scales follow density", () => {
    const compact = createAppThemeForAppearance(DEFAULT_APP_THEME, "compact");
    const comfortable = createAppThemeForAppearance(DEFAULT_APP_THEME, "comfortable");

    expect(compact.colors?.dark).toEqual(comfortable.colors?.dark);
    expect(compact.spacing?.md).not.toBe(comfortable.spacing?.md);
    expect(compact.defaultRadius).toBe(comfortable.defaultRadius);
  });
});
