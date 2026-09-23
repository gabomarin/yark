import { readFileSync } from "node:fs";
import { DEFAULT_THEME, defaultVariantColorsResolver } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { createAppCssVariablesResolverForAppearance, createAppThemeForAppearance } from "./theme";
import {
  ALL_APP_THEMES,
  APP_THEME_LIST,
  DEFAULT_APP_THEME,
  THEME_FAMILIES,
  THEMES,
  resolveThemeSelection,
  themeVariantsForFamily,
} from "./themes";
import { darkPalette } from "./tokens";
import { plasmaBreezeTypography } from "./plasmaBreezeTokens";

/**
 * The map the dark theme resolved to before the per-theme payload split
 * (#PUX-004 B3). It is the safety net for that refactor: splitting the semantic
 * colours, shadows and Mantine ladders onto the registry must not move a single
 * value of the shipped theme.
 */
const darkResolverSnapshot: unknown = JSON.parse(
  readFileSync("src/renderer/src/shared/theme/darkResolverSnapshot.json", "utf8"),
);

describe("theme registry (#PUX-004 Track B, #PUX-005-B)", () => {
  it("names both families and keeps fluent dark as the default", () => {
    expect(APP_THEME_LIST.map((theme) => theme.scheme)).toEqual(["dark", "light"]);
    expect(DEFAULT_APP_THEME.family).toBe("fluent");
    expect(DEFAULT_APP_THEME.scheme).toBe("dark");
    expect(THEMES.light.colorScheme).toBe("light");
    expect(Object.keys(THEME_FAMILIES)).toEqual(["fluent", "plasma-breeze"]);
    expect(THEME_FAMILIES.fluent.light.scheme).toBe("light");
    expect(THEME_FAMILIES.fluent.dark.recipeSet).toBe("fluent");
  });

  it("registers Plasma Breeze Light and Dark as variants of one family", () => {
    expect(themeVariantsForFamily("plasma-breeze").map((theme) => theme.label)).toEqual([
      "Breeze Dark",
      "Breeze Light",
    ]);
    expect(THEME_FAMILIES["plasma-breeze"].light.family).toBe("plasma-breeze");
    expect(THEME_FAMILIES["plasma-breeze"].dark.family).toBe("plasma-breeze");
    expect(THEME_FAMILIES["plasma-breeze"].dark.recipeSet).toBe("plasma-breeze");
    // Family-level typography is shared by both variants unless documented otherwise.
    expect(THEME_FAMILIES["plasma-breeze"].light.typography).toBe(plasmaBreezeTypography);
    expect(THEME_FAMILIES["plasma-breeze"].dark.typography).toBe(plasmaBreezeTypography);
    // Independently authored palettes, not an inversion of one another.
    expect(THEME_FAMILIES["plasma-breeze"].dark.palette).not.toBe(THEME_FAMILIES["plasma-breeze"].light.palette);
  });

  it("resolves family and scheme independently, with a safe default", () => {
    expect(resolveThemeSelection({ family: "fluent", scheme: "light" }).scheme).toBe("light");
    expect(resolveThemeSelection({ family: "plasma-breeze", scheme: "light" }).label).toBe("Breeze Light");
    expect(resolveThemeSelection({ family: "glassy", scheme: "dark" } as never)).toBe(DEFAULT_APP_THEME);
    expect(resolveThemeSelection({ family: "fluent", scheme: "sepia" } as never)).toBe(THEMES.dark);
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

  it("uses the family typography profile for the resolver's font tokens", () => {
    const breeze = createAppCssVariablesResolverForAppearance(THEME_FAMILIES["plasma-breeze"].light, "compact")(
      DEFAULT_THEME,
    ).variables;
    expect(breeze["--app-font-display"]).toBe(plasmaBreezeTypography.display);
    expect(breeze["--app-font-mono"]).toBe(plasmaBreezeTypography.mono);
    expect(breeze["--app-font-display"]).toMatch(/Noto Sans/);

    const fluent = createAppThemeForAppearance(THEMES.dark, "compact");
    expect(fluent.fontFamily).toBe(THEME_FAMILIES.fluent.dark.typography.body);
    const breezeTheme = createAppThemeForAppearance(THEME_FAMILIES["plasma-breeze"].dark, "compact");
    expect(breezeTheme.fontFamily).toBe(plasmaBreezeTypography.body);
    expect(breezeTheme.fontFamily).not.toBe(fluent.fontFamily);
  });

  it("carries the family radius ladder into the resolver and Mantine (#PUX-005-B)", () => {
    const breeze = createAppCssVariablesResolverForAppearance(THEME_FAMILIES["plasma-breeze"].light, "comfortable")(
      DEFAULT_THEME,
    ).variables;
    // Breeze: controls 4px, large surfaces 6px (largeRadius = smallRadius * 2).
    expect(breeze["--app-radius-sm"]).toBe("4px");
    expect(breeze["--app-radius-md"]).toBe("6px");
    expect(breeze["--app-radius-lg"]).toBe("8px");

    // Fluent keeps its original ladder, so the shipped theme is unchanged.
    const fluent = createAppCssVariablesResolverForAppearance(THEMES.dark, "comfortable")(DEFAULT_THEME).variables;
    expect(fluent["--app-radius-md"]).toBe("8px");

    // Density still scales the family ladder (6 * 0.82 -> 5).
    const breezeCompact = createAppThemeForAppearance(THEME_FAMILIES["plasma-breeze"].dark, "compact");
    expect(breezeCompact.radius?.md).toBe("5px");
    expect(breezeCompact.radius?.sm).toBe("3px");
  });

  it("gives Breeze flat line-edit and knob chrome, leaving Fluent alone (#PUX-005-B)", () => {
    const breezeDark = createAppThemeForAppearance(THEME_FAMILIES["plasma-breeze"].dark, "compact");
    const inputStyles = breezeDark.components?.Input?.styles as
      | { input?: { backgroundColor?: string; borderColor?: string } }
      | undefined;
    expect(inputStyles?.input?.backgroundColor).toBe("var(--ark-gray-2)");
    expect(inputStyles?.input?.borderColor).toBe("var(--app-color-border-control)");

    const switchStyles = breezeDark.components?.Switch?.styles as { thumb?: { border?: string } } | undefined;
    expect(switchStyles?.thumb?.border).toContain("var(--app-color-border-subtle)");

    const breezeLight = createAppThemeForAppearance(THEME_FAMILIES["plasma-breeze"].light, "compact");
    const lightInput = breezeLight.components?.Input?.styles as { input?: { backgroundColor?: string } } | undefined;
    expect(lightInput?.input?.backgroundColor).toBe("var(--ark-gray-1)");

    // Fluent keeps Mantine's input chrome: no override.
    expect(createAppThemeForAppearance(THEMES.dark, "compact").components?.Input?.styles).toBeUndefined();
  });

  it("keeps Breeze muted copy dimmer than body text (#PUX-005-B)", () => {
    // Step 11 is muted, step 12 is body text. Dark had them inverted, which made
    // "dimmed" copy near-white; these anchors pin the corrected order.
    expect(THEME_FAMILIES["plasma-breeze"].dark.palette.gray[10]).toBe("#a6aeb6");
    expect(THEME_FAMILIES["plasma-breeze"].dark.palette.gray[11]).toBe("#fcfcfc");
    expect(THEME_FAMILIES["plasma-breeze"].light.palette.gray[10]).toBe("#555b62");
    expect(THEME_FAMILIES["plasma-breeze"].light.palette.gray[11]).toBe("#232629");
  });

  it("labels the Breeze accent filled variant white (KDE) without touching semantic colors (#PUX-005-B)", () => {
    const input = {
      color: "blue",
      theme: DEFAULT_THEME,
      variant: "filled" as const,
      gradient: undefined,
      autoContrast: true,
    };
    const breeze = createAppThemeForAppearance(THEME_FAMILIES["plasma-breeze"].dark, "compact");
    expect(breeze.variantColorResolver).toBeDefined();
    expect(breeze.variantColorResolver!(input).color).toBe("var(--mantine-color-white)");

    // Only the accent is touched: semantic colors resolve exactly as Mantine would
    // (fossil/attention still rely on autoContrast for their dark label).
    const red = { ...input, color: "red" };
    expect(breeze.variantColorResolver!(red).color).toBe(defaultVariantColorsResolver(red).color);

    // Fluent keeps Mantine's default resolver, so its shipped look is unchanged.
    expect(createAppThemeForAppearance(THEMES.dark, "compact").variantColorResolver).toBeUndefined();
  });

  it.each(ALL_APP_THEMES)("derives every --ark-* value from the $label palette", (theme) => {
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

  it.each(ALL_APP_THEMES)("feeds the $label palette and ladders into Mantine", (theme) => {
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
