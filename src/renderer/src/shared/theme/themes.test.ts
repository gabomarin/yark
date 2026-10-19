import { readFileSync } from "node:fs";
import { DEFAULT_THEME, defaultVariantColorsResolver } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { createAppCssVariablesResolverForAppearance, createAppThemeForAppearance } from "./theme";
import {
  ALL_APP_THEMES,
  APP_THEME_LIST,
  DEFAULT_APP_THEME,
  THEME_FAMILIES,
  THEME_FAMILY_LIST,
  THEMES,
  resolveThemeSelection,
  themeVariantsForFamily,
  withoutSceneBackground,
} from "./themes";
import { darkPalette, opaqueMaterials, type AppThemeMaterials } from "./tokens";
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
  it("names the shipped families and keeps fluent dark as the default", () => {
    expect(APP_THEME_LIST.map((theme) => theme.scheme)).toEqual(["dark", "light"]);
    expect(DEFAULT_APP_THEME.family).toBe("fluent");
    expect(DEFAULT_APP_THEME.scheme).toBe("dark");
    expect(THEMES.light.colorScheme).toBe("light");
    expect(Object.keys(THEME_FAMILIES)).toEqual(["fluent", "plasma-breeze", "glassy"]);
    expect(THEME_FAMILY_LIST.map((family) => family.id)).toEqual(["fluent", "plasma-breeze"]);
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
    expect(THEME_FAMILIES.glassy.dark.recipeSet).toBe("fluent");
    expect(THEME_FAMILIES.glassy.dark.label).toBe("Glassy Dark");
    expect(THEME_FAMILIES.glassy.light.label).toBe("Glassy Light");
    expect(THEME_FAMILIES.glassy.dark.palette.blue[8]).toBe("#28d4ec");
    expect(THEME_FAMILIES.glassy.dark.materials.panelBg).toBe("rgba(32,72,90,0.40)");
    expect(THEME_FAMILIES.glassy.dark.materials.panelRaisedBg).toBe("rgba(32,72,90,0.56)");
    expect(THEME_FAMILIES.glassy.dark.materials.floatPanelBg).toBe("rgba(32,72,90,0.56)");
    expect(THEME_FAMILIES.glassy.dark.materials.contentPaneBg).toBe("rgba(32,72,90,0.12)");
    expect(THEME_FAMILIES.glassy.dark.materials.nestedRowBg).toBe("rgba(32,72,90,0.56)");
    expect(THEME_FAMILIES.glassy.dark.materials.alertFill).toBe("var(--app-panel-surface-bg)");
    expect(THEME_FAMILIES.glassy.dark.materials.chipBg).toBe("rgba(46,88,108,0.30)");
    expect(THEME_FAMILIES.glassy.dark.materials.iconButtonBg).toBe("rgba(46,88,108,0.28)");
    expect(THEME_FAMILIES.glassy.dark.materials.iconButtonDefaultBg).toBe("rgba(46,88,108,0.28)");
    expect(THEME_FAMILIES.glassy.dark.materials.borderSubtle).toBe("rgba(95, 197, 220, 0.22)");
    expect(THEME_FAMILIES.glassy.dark.materials.border).toBe("rgba(95, 197, 220, 0.38)");
    expect(THEME_FAMILIES.glassy.dark.materials.borderControl).toBe("rgba(71, 220, 242, 0.55)");
    expect(THEME_FAMILIES.glassy.dark.materials.tabAttachedRadius).toBe(
      "0 0 var(--app-panel-radius) var(--app-panel-radius)",
    );
    expect(THEME_FAMILIES.glassy.dark.materials.menuBg).toBe("rgba(16, 42, 56, 0.46)");
    expect(THEME_FAMILIES.glassy.dark.materials.menuShadow).toBe(
      "0 0 0 1px rgba(95, 197, 220, 0.40), 0 12px 32px rgba(0, 0, 0, 0.50)",
    );
    expect(THEME_FAMILIES.glassy.light.materials.menuBg).toBe("rgba(255,255,255,0.78)");
    expect(THEME_FAMILIES.glassy.light.materials.menuShadow).toBe(
      "0 0 0 1px rgba(22, 32, 40, 0.22), 0 10px 28px rgba(16, 28, 36, 0.22)",
    );
    expect(opaqueMaterials.menuShadow).toBe("var(--popover-shadow, none)");
    expect(THEME_FAMILIES.glassy.light.materials.notificationBg).toBe("rgba(248,250,252,0.82)");
    expect(THEME_FAMILIES.glassy.dark.materials.notificationBg).toBe("rgba(32,72,90,0.56)");
    expect(opaqueMaterials.notificationBg).toBe(
      "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))",
    );
    expect(opaqueMaterials.notificationShadow).toBe("var(--mantine-shadow-lg)");
    expect(THEME_FAMILIES.glassy.dark.materials.downloadsConsoleInset).toBe("var(--app-space-md)");
    expect(opaqueMaterials.downloadsConsoleInset).toBe("var(--app-space-xs)");
    expect(THEME_FAMILIES.glassy.light.materials.floatPanelBg).toBe("rgba(248,250,252,0.82)");
    expect(THEME_FAMILIES.glassy.light.materials.contentPaneBg).toBe("rgba(248,250,252,0.28)");
    expect(opaqueMaterials.floatPanelBg).toBe("var(--app-color-panel)");
    expect(opaqueMaterials.alertFill).toBe("var(--app-color-surface-alert)");
    expect(opaqueMaterials.nestedRowBg).toBe("color-mix(in srgb, var(--app-color-bg) 35%, transparent)");
    expect(opaqueMaterials.chipBg).toBe("var(--app-color-surface-control)");
    expect(opaqueMaterials.glassSheen).toBe("none");
    expect(opaqueMaterials.glassRim).toBe("none");
    expect(THEME_FAMILIES.glassy.dark.materials.glassSheen).toContain("linear-gradient");
    expect(THEME_FAMILIES.glassy.dark.materials.glassRim).toContain("inset 0 1px 0");
    expect(THEME_FAMILIES.glassy.light.materials.border).toBe("rgba(22, 32, 40, 0.14)");
    expect(THEME_FAMILIES.glassy.light.palette.blue[8]).toBe("#0c7490");
    expect(THEME_FAMILIES.glassy.light.materials.iconButtonBg).toBe("rgba(226, 234, 238, 0.70)");
    expect(THEME_FAMILIES.glassy.light.materials.primaryButtonBg).toBe(
      "color-mix(in srgb, var(--app-color-accent) 92%, transparent)",
    );
    expect(THEME_FAMILIES.glassy.light.materials.primaryButtonHover).toBe("var(--ark-blue-8)");
    expect(THEME_FAMILIES.glassy.light.materials.chromeBg).toBe("rgba(248,250,252,0.64)");
    expect(THEME_FAMILIES.glassy.light.materials.sidebarFooterBg).toBe("transparent");
    expect(THEME_FAMILIES.glassy.light.materials.mastBg).toBe("rgba(248,250,252,0.64)");
    expect(THEME_FAMILIES.glassy.light.materials.overviewStageBg).toBe("rgba(248,250,252,0.64)");
    expect(THEME_FAMILIES.glassy.light.materials.overviewStagePad).toBe("var(--app-space-sm)");
    expect(THEME_FAMILIES.glassy.light.materials.overviewStageBorder).toBe(
      "1px solid var(--app-color-border-subtle)",
    );
    expect(THEME_FAMILIES.glassy.light.materials.overviewAsideBg).toBe("rgba(248,250,252,0.64)");
    expect(THEME_FAMILIES.glassy.dark.materials.overviewStageBg).toBe("transparent");
    expect(THEME_FAMILIES.glassy.dark.materials.overviewStagePad).toBe("0px");
    expect(opaqueMaterials.overviewStagePad).toBe("0px");
    expect(opaqueMaterials.overviewAsideBg).toBe("var(--app-float-panel-bg)");
    expect(THEME_FAMILIES.glassy.dark.colors.bad).toBe("#da4453");
    expect(THEME_FAMILIES.glassy.dark.colors.dangerBright).toBe("#da4453");
    expect(THEME_FAMILIES.glassy.dark.palette.gray[10]).toBe("#a8cdd9");
    const glassyVars = createAppCssVariablesResolverForAppearance(
      THEME_FAMILIES.glassy.dark,
      "compact",
    )(DEFAULT_THEME).variables;
    expect(glassyVars["--app-color-panel"]).toBe("rgba(32,72,90,0.40)");
    expect(glassyVars["--app-color-panel-raised"]).toBe("rgba(32,72,90,0.56)");
    expect(glassyVars["--app-color-border-subtle"]).toBe("rgba(95, 197, 220, 0.22)");
    expect(glassyVars["--app-color-border"]).toBe("rgba(95, 197, 220, 0.38)");
    expect(glassyVars["--app-color-border-control"]).toBe("rgba(71, 220, 242, 0.55)");
    expect(glassyVars["--app-tab-attached-radius"]).toBe("0 0 var(--app-panel-radius) var(--app-panel-radius)");
    expect(glassyVars["--app-tab-inactive-bg"]).toBe("rgba(46, 88, 108, 0.18)");
    expect(glassyVars["--app-tab-active-bg"]).toBe("rgba(96, 176, 196, 0.34)");
    expect(THEME_FAMILIES.glassy.light.materials.tabInactiveBg).toBe("rgba(226, 234, 238, 0.42)");
    expect(THEME_FAMILIES.glassy.light.materials.tabActiveBg).toBe("rgba(255, 255, 255, 0.66)");
    expect(opaqueMaterials.tabInactiveBg).toBe("transparent");
    expect(opaqueMaterials.tabActiveBg).toBe(
      "color-mix(in srgb, var(--app-color-accent) 12%, var(--app-color-surface-control-hover))",
    );
    expect(glassyVars["--app-menu-bg"]).toBe("rgba(16, 42, 56, 0.46)");
    expect(glassyVars["--app-panel-radius"]).toBe("var(--app-radius-md)");
    expect(glassyVars["--app-metric-gap"]).toBe("var(--app-space-sm)");
    expect(glassyVars["--app-collection-gap"]).toBe("var(--app-space-sm)");
    expect(glassyVars["--app-collection-radius"]).toBe("var(--app-radius-sm)");
    expect(glassyVars["--app-collection-fuse"]).toBe("0px");
    expect(glassyVars["--app-collection-strip-fill"]).toBe("transparent");
    expect(glassyVars["--app-shell-main-bg"]).toBe("transparent");
    expect(glassyVars["--app-shell-grain-opacity"]).toBe("0");
    expect(glassyVars["--app-shell-scene"]).toContain("the_island");
    expect(glassyVars["--app-shell-scene-grid"]).toMatch(/url\(/);
    expect(glassyVars["--app-shell-scene-grid"]).toMatch(/hexagon|\.svg|svg/i);
    expect(glassyVars["--app-shell-scene-veil"]).toContain("radial-gradient");
    expect(glassyVars["--app-shell-scene-veil"]).not.toContain("repeating-linear-gradient");
    expect(glassyVars["--app-shell-scene-filter"]).toBe("blur(4px) saturate(115%)");
    expect(THEME_FAMILIES.glassy.dark.materials.chromeBg).toBe("rgba(18,56,74,0.22)");
    expect(glassyVars["--app-server-rail-bg"]).toBe("rgba(18,56,74,0.42)");
    expect(THEME_FAMILIES.glassy.light.materials.serverRailBg).toBe("rgba(248,250,252,0.64)");
    expect(opaqueMaterials.serverRailBg).toBe("transparent");
    expect(opaqueMaterials.mastBg).toBe("transparent");
    expect(THEME_FAMILIES.glassy.dark.materials.mastBg).toBe("transparent");
    expect(THEME_FAMILIES.glassy.light.materials.shellScene).toContain("the_island.jpeg");
    expect(THEME_FAMILIES.glassy.light.materials.shellSceneGrid).toMatch(/url\(/);
    expect(THEME_FAMILIES.glassy.light.materials.shellSceneGrid).toMatch(/hexagon|\.svg|svg/i);
    expect(THEME_FAMILIES.glassy.light.materials.shellSceneVeil).toContain("radial-gradient");
    expect(THEME_FAMILIES.glassy.light.materials.shellSceneFilter).toBe(
      "blur(8px) saturate(140%) brightness(0.78)",
    );
    expect(opaqueMaterials.shellScene).toBe("none");
    expect(opaqueMaterials.shellSceneGrid).toBe("none");
    expect(opaqueMaterials.shellSceneVeil).toBe("transparent");
    expect(opaqueMaterials.shellSceneFilter).toBe("none");
    expect(glassyVars["--app-nav-selected-border"]).toBe("1px solid var(--app-color-border)");
    expect(glassyVars["--app-sidebar-edge"]).toBe("color-mix(in srgb, var(--app-color-accent) 45%, transparent)");
    expect(glassyVars["--app-input-well-bg"]).toBe("color-mix(in srgb, var(--ark-gray-2) 72%, transparent)");
    expect(glassyVars["--app-attention-light"]).toBe(
      "color-mix(in srgb, var(--app-color-attention) 12%, transparent)",
    );
    expect(glassyVars["--app-list-vessel-bg"]).toBe("rgba(42, 84, 102, 0.86)");
    expect(glassyVars["--app-icon-button-bg"]).toBe("rgba(46,88,108,0.28)");
    expect(glassyVars["--app-icon-button-filter"]).toBe("var(--app-surface-raised-filter)");
    expect(glassyVars["--app-primary-button-bg"]).toBe("color-mix(in srgb, var(--ark-blue-5) 92%, transparent)");
    expect(glassyVars["--app-primary-button-hover"]).toBe("var(--ark-blue-6)");
    expect(glassyVars["--app-primary-button-color"]).toBe("var(--mantine-color-white)");
    expect(opaqueMaterials.iconButtonBg).toBe("transparent");
    expect(opaqueMaterials.iconButtonDefaultBg).toBe("var(--mantine-color-default)");
    expect(opaqueMaterials.primaryButtonBg).toBe("var(--mantine-primary-color-filled)");
    expect(opaqueMaterials.primaryButtonBorder).toBe("calc(0.0625rem * var(--mantine-scale)) solid transparent");
    expect(opaqueMaterials.primaryButtonColor).toBe("var(--mantine-color-white)");
    expect(opaqueMaterials.buttonDisabledBg).toBe("var(--mantine-color-disabled)");
    expect(opaqueMaterials.buttonDisabledQuietBg).toBe("transparent");
    expect(THEME_FAMILIES.glassy.dark.materials.buttonDisabledBg).toBe(
      "color-mix(in srgb, var(--mantine-color-disabled) 58%, transparent)",
    );
    expect(THEME_FAMILIES.glassy.dark.materials.buttonDisabledQuietBg).toBe("var(--app-button-disabled-bg)");
    expect(THEME_FAMILIES.glassy.light.materials.buttonDisabledBg).toBe(
      THEME_FAMILIES.glassy.dark.materials.buttonDisabledBg,
    );
    const iconVars = createAppThemeForAppearance(THEME_FAMILIES.glassy.dark, "compact").components?.ActionIcon?.vars;
    expect(typeof iconVars).toBe("function");
    expect(iconVars?.(DEFAULT_THEME, { variant: "subtle" }, {})).toMatchObject({
      root: { "--ai-bg": "var(--app-icon-button-bg)" },
    });
    expect(iconVars?.(DEFAULT_THEME, { variant: "filled" }, {})).toMatchObject({
      root: {
        "--ai-bg": "var(--app-primary-button-bg)",
        "--ai-color": "var(--app-primary-button-color)",
      },
    });
    expect(iconVars?.(DEFAULT_THEME, { variant: "filled", color: "red" }, {})).toEqual({ root: {} });
    const buttonVars = createAppThemeForAppearance(THEME_FAMILIES.glassy.dark, "compact").components?.Button?.vars;
    const buttonStyles = createAppThemeForAppearance(THEME_FAMILIES.glassy.dark, "compact").components?.Button?.styles;
    expect(typeof buttonVars).toBe("function");
    expect(typeof buttonStyles).toBe("function");
    expect(buttonVars?.(DEFAULT_THEME, { variant: "transparent", color: "gray" }, {})).toMatchObject({
      root: { "--button-bg": "transparent", "--button-hover": "transparent" },
    });
    expect(buttonStyles?.(DEFAULT_THEME, { variant: "transparent", color: "gray" }, {})).toMatchObject({
      root: { backdropFilter: "none", boxShadow: "none" },
    });
    expect(buttonVars?.(DEFAULT_THEME, { variant: "default" }, {})).toMatchObject({
      root: { "--button-bg": "var(--app-icon-button-default-bg)" },
    });
    expect(buttonVars?.(DEFAULT_THEME, { variant: "filled" }, {})).toMatchObject({
      root: {
        "--button-bg": "var(--app-primary-button-bg)",
        "--button-color": "var(--app-primary-button-color)",
      },
    });
    expect(buttonStyles?.(DEFAULT_THEME, { variant: "filled" }, {})).toMatchObject({
      root: { backdropFilter: "none", boxShadow: "var(--app-icon-button-shadow)" },
    });
    expect(buttonVars?.(DEFAULT_THEME, { variant: "filled", color: "red" }, {})).toEqual({ root: {} });
    expect(THEME_FAMILIES.glassy.light.materials.attentionLight).toBe(opaqueMaterials.attentionLight);
    expect(THEME_FAMILIES.glassy.light.materials.listVesselBg).toBe("rgba(255,255,255,0.88)");
    expect(glassyVars["--app-list-row-border"]).toBe("none");
    expect(glassyVars["--app-server-list-hover"]).toBe("color-mix(in srgb, var(--app-color-accent) 8%, transparent)");
    expect(THEME_FAMILIES.glassy.dark.materials.navSelectedNotch).toBe("0px");
    expect(resolveThemeSelection({ family: "glassy", scheme: "light" }).label).toBe("Glassy Light");
    expect(resolveThemeSelection({ family: "not-a-family", scheme: "dark" } as never)).toBe(DEFAULT_APP_THEME);
    expect(resolveThemeSelection({ family: "fluent", scheme: "sepia" } as never)).toBe(THEMES.dark);

    const cleared = withoutSceneBackground(THEME_FAMILIES.glassy.dark);
    expect(cleared.materials.shellScene).toBe("none");
    expect(cleared.materials.shellSceneGrid).toBe("none");
    expect(cleared.materials.shellSceneVeil).toBe("transparent");
    expect(cleared.materials.shellSceneFilter).toBe("none");
    expect(cleared.materials.panelBg).toBe(THEME_FAMILIES.glassy.dark.materials.panelBg);
    expect(THEME_FAMILIES.glassy.dark.materials.shellScene).toContain("the_island");
    expect(withoutSceneBackground(THEMES.dark)).toBe(THEMES.dark);
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
    const breeze = createAppCssVariablesResolverForAppearance(
      THEME_FAMILIES["plasma-breeze"].light,
      "compact",
    )(DEFAULT_THEME).variables;
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
    const breeze = createAppCssVariablesResolverForAppearance(
      THEME_FAMILIES["plasma-breeze"].light,
      "comfortable",
    )(DEFAULT_THEME).variables;
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
      { input?: { backgroundColor?: string; borderColor?: string } } | undefined;
    expect(inputStyles?.input?.backgroundColor).toBe("var(--ark-gray-2)");
    expect(inputStyles?.input?.borderColor).toBe("var(--app-color-border-control)");

    const switchStyles = breezeDark.components?.Switch?.styles as { thumb?: { border?: string } } | undefined;
    expect(switchStyles?.thumb?.border).toContain("var(--app-color-border-subtle)");

    const breezeLight = createAppThemeForAppearance(THEME_FAMILIES["plasma-breeze"].light, "compact");
    const lightInput = breezeLight.components?.Input?.styles as { input?: { backgroundColor?: string } } | undefined;
    expect(lightInput?.input?.backgroundColor).toBe("var(--ark-gray-1)");

    // Fluent does not restyle the field fill. Both families share the surface filter.
    const fluentInput = createAppThemeForAppearance(THEMES.dark, "compact").components?.Input?.styles as
      { input?: { backgroundColor?: string; backdropFilter?: string } } | undefined;
    expect(fluentInput?.input?.backgroundColor).toBeUndefined();
    expect(fluentInput?.input?.backdropFilter).toBe("var(--app-surface-filter)");
    expect(inputStyles?.input).toMatchObject({ backdropFilter: "var(--app-surface-filter)" });
  });

  it("keeps Breeze muted copy dimmer than body text (#PUX-005-B)", () => {
    // Step 11 is muted, step 12 is body text. Dark had them inverted, which made
    // "dimmed" copy near-white; these anchors pin the corrected order.
    expect(THEME_FAMILIES["plasma-breeze"].dark.palette.gray[10]).toBe("#a6aeb6");
    expect(THEME_FAMILIES["plasma-breeze"].dark.palette.gray[11]).toBe("#fcfcfc");
    expect(THEME_FAMILIES["plasma-breeze"].light.palette.gray[10]).toBe("#555b62");
    expect(THEME_FAMILIES["plasma-breeze"].light.palette.gray[11]).toBe("#232629");
  });

  it("keeps Breeze filled primaries on the accent without touching semantic colors (#PUX-005-B)", () => {
    const input = {
      color: "blue",
      theme: DEFAULT_THEME,
      variant: "filled" as const,
      gradient: undefined,
      autoContrast: true,
    };
    const breeze = createAppThemeForAppearance(THEME_FAMILIES["plasma-breeze"].dark, "compact");
    const defaults = defaultVariantColorsResolver(input);
    expect(breeze.variantColorResolver).toBeDefined();
    expect(breeze.variantColorResolver!(input)).toMatchObject({
      background: defaults.background,
      hover: defaults.hover,
      color: "var(--mantine-color-white)",
    });

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

  it("copies materials onto surface roles without reading the family id", () => {
    // Plain strings so a theme pack can store materials as JSON.
    for (const value of Object.values(opaqueMaterials)) {
      expect(typeof value).toBe("string");
    }

    const frost: AppThemeMaterials = {
      ...opaqueMaterials,
      surfaceFilter: "blur(20px)",
      contentPaneBg: "rgb(0 0 0 / 40%)",
      navSelectedFill: "rgb(0 200 255 / 30%)",
      navSelectedNotch: "0px",
    };
    const fluent = { ...THEME_FAMILIES.fluent.dark, materials: frost };
    const breeze = { ...THEME_FAMILIES["plasma-breeze"].dark, materials: frost };
    const fluentVars = createAppCssVariablesResolverForAppearance(fluent, "comfortable")(DEFAULT_THEME).variables;
    const breezeVars = createAppCssVariablesResolverForAppearance(breeze, "comfortable")(DEFAULT_THEME).variables;

    expect(fluentVars["--app-surface-filter"]).toBe("blur(20px)");
    expect(fluentVars["--app-content-pane-bg"]).toBe("rgb(0 0 0 / 40%)");
    expect(fluentVars["--app-nav-selected-fill"]).toBe("rgb(0 200 255 / 30%)");
    expect(fluentVars["--app-nav-selected-notch"]).toBe("0px");
    expect(breezeVars["--app-surface-filter"]).toBe(fluentVars["--app-surface-filter"]);
    expect(breezeVars["--app-content-pane-bg"]).toBe(fluentVars["--app-content-pane-bg"]);
    expect(breezeVars["--app-nav-selected-fill"]).toBe(fluentVars["--app-nav-selected-fill"]);
    expect(breezeVars["--app-raised-surface-bg"]).toBe(fluentVars["--app-raised-surface-bg"]);
  });

  it("composes with density: colours follow the theme, scales follow density", () => {
    const compact = createAppThemeForAppearance(DEFAULT_APP_THEME, "compact");
    const comfortable = createAppThemeForAppearance(DEFAULT_APP_THEME, "comfortable");

    expect(compact.colors?.dark).toEqual(comfortable.colors?.dark);
    expect(compact.spacing?.md).not.toBe(comfortable.spacing?.md);
    expect(compact.defaultRadius).toBe(comfortable.defaultRadius);
  });
});
