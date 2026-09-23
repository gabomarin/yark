import { readFileSync } from "node:fs";
import { DEFAULT_THEME } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { createAppCssVariablesResolverForAppearance, createAppThemeForAppearance } from "./theme";
import {
  APP_THEME_LIST,
  DEFAULT_APP_THEME,
  THEME_FAMILIES,
  THEMES,
  resolveAppTheme,
  resolveThemeSelection,
} from "./themes";
import { darkPalette } from "./tokens";

/**
 * The map the dark theme resolved to before the per-theme payload split
 * (#PUX-004 B3). It is the safety net for that refactor: splitting the semantic
 * colours, shadows and Mantine ladders onto the registry must not move a single
 * value of the shipped theme.
 */
const darkResolverSnapshot: unknown = JSON.parse(
  readFileSync("src/renderer/src/shared/theme/darkResolverSnapshot.json", "utf8"),
);

describe("theme registry (#PUX-004 Track B)", () => {
  it("names both shipped themes and keeps dark as the default", () => {
    expect(APP_THEME_LIST.map((theme) => theme.id)).toEqual(["dark", "light"]);
    expect(DEFAULT_APP_THEME.id).toBe("dark");
    expect(THEMES.light.colorScheme).toBe("light");
    expect(Object.keys(THEME_FAMILIES)).toEqual(["fluent"]);
    expect(THEME_FAMILIES.fluent.light.scheme).toBe("light");
    expect(THEME_FAMILIES.fluent.dark.recipeSet).toBe("fluent");
  });

  it("resolves family and scheme independently, with a safe default", () => {
    expect(resolveThemeSelection({ family: "fluent", scheme: "light" }).scheme).toBe("light");
    expect(resolveThemeSelection({ family: "glassy", scheme: "dark" } as never)).toBe(DEFAULT_APP_THEME);
    expect(resolveThemeSelection({ family: "fluent", scheme: "sepia" } as never)).toBe(DEFAULT_APP_THEME);
  });

  it("resolves an unknown or missing id to the default theme", () => {
    expect(resolveAppTheme("vaporwave").id).toBe("dark");
    expect(resolveAppTheme(null).id).toBe("dark");
    expect(resolveAppTheme(undefined).id).toBe("dark");
    expect(resolveAppTheme("light").id).toBe("light");
  });

  it("keeps the shipped dark theme identical after the per-theme payload split", () => {
    const resolved = createAppCssVariablesResolverForAppearance(THEMES.dark, "comfortable")(DEFAULT_THEME);
    // All three maps are asserted: the roles, the scheme maps and the dark map. The
    // fixture is regenerated only when a change is intentional, so a drift shows up
    // as a diff instead of passing silently.
    expect({ variables: resolved.variables, light: resolved.light, dark: resolved.dark }).toEqual(darkResolverSnapshot);
  });

  it("carries the palette as data, so a theme is an entry and not a second design system", () => {
    expect(THEMES.dark.palette).toBe(darkPalette);

    const vars = createAppCssVariablesResolverForAppearance(DEFAULT_APP_THEME, "compact")(DEFAULT_THEME).variables;
    // Roles stay shared and keep pointing at the active palette's steps.
    expect(vars["--app-color-surface-chrome"]).toBe("var(--ark-gray-2)");
    expect(vars["--app-color-bg"]).toBe("var(--ark-background)");
    expect(vars["--app-color-ok"]).toBe(THEMES.dark.colors.ok);
    expect(vars["--app-color-ok"]).not.toBe(THEMES.light.colors.ok);
  });

  it.each(APP_THEME_LIST)("derives every --ark-* value from the $label palette", (theme) => {
    const vars = createAppCssVariablesResolverForAppearance(theme, "compact")(DEFAULT_THEME).variables;
    const paletteValues = new Set<string>([
      ...theme.palette.blue,
      ...theme.palette.blueAlpha,
      ...theme.palette.gray,
      ...theme.palette.grayAlpha,
      theme.palette.background,
      theme.palette.blueContrast,
      theme.palette.blueSurface,
      theme.palette.grayContrast,
      theme.palette.graySurface,
    ]);

    const hardcoded = Object.entries(vars)
      .filter(([key]) => key.startsWith("--ark-"))
      .filter(([, value]) => !paletteValues.has(value))
      .map(([key]) => key);

    expect(hardcoded).toEqual([]);
  });

  it.each(APP_THEME_LIST)("feeds the $label palette and ladders into Mantine", (theme) => {
    const mantine = createAppThemeForAppearance(theme, "compact");

    expect(mantine.colors?.dark?.[0]).toBe(theme.palette.gray[11]);
    expect(mantine.colors?.blue?.[5]).toBe(theme.palette.blue[8]);
    expect(mantine.colors?.ok).toEqual(theme.ladders.ok);
    expect(mantine.colors?.red).toEqual(theme.ladders.red);
  });

  it("composes with density: colours follow the theme, scales follow density", () => {
    const compact = createAppThemeForAppearance(DEFAULT_APP_THEME, "compact");
    const comfortable = createAppThemeForAppearance(DEFAULT_APP_THEME, "comfortable");

    expect(compact.colors?.dark).toEqual(comfortable.colors?.dark);
    expect(compact.spacing?.md).not.toBe(comfortable.spacing?.md);
    expect(compact.defaultRadius).toBe(comfortable.defaultRadius);
  });
});
