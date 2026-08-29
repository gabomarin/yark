import { DEFAULT_THEME } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { createAppCssVariablesResolverForDensity, createAppThemeForDensity } from "./theme";
import { getAppTokens } from "./tokens";

const SOLID_SURFACE_VARS = [
  "--app-color-surface-chrome",
  "--app-color-surface-panel",
  "--app-color-surface-control",
  "--app-color-surface-control-hover",
  "--app-color-border-subtle",
  "--app-color-border-control",
  "--app-color-text-soft",
  "--app-color-muted-soft",
  "--app-color-panel",
  "--app-color-panel-cool",
  "--app-color-panel-cool-emphasis",
  "--app-surface-border",
  "--app-surface-flat",
  "--app-surface-chrome",
  "--app-list-selected-bg",
] as const;

describe("surface and radius tokens (#468)", () => {
  it("uses tool-chrome radius on comfortable and compact", () => {
    expect(getAppTokens("comfortable").radius).toEqual({
      sm: 6,
      md: 8,
      lg: 10,
      control: 6,
    });
    expect(getAppTokens("compact").radius).toEqual({
      sm: 5,
      md: 7,
      lg: 8,
      control: 5,
    });
  });

  it("defaults Card, Paper, Badge, Alert, and NavLink to sm radius", () => {
    const theme = createAppThemeForDensity("comfortable");
    expect(theme.defaultRadius).toBe("sm");
    expect(theme.components?.Card?.defaultProps).toMatchObject({ radius: "sm" });
    expect(theme.components?.Paper?.defaultProps).toMatchObject({ radius: "sm" });
    expect(theme.components?.Badge?.defaultProps).toMatchObject({ radius: "sm" });
    expect(theme.components?.Alert?.defaultProps).toMatchObject({ radius: "sm" });
    expect(theme.components?.NavLink?.defaultProps).toMatchObject({ radius: "sm" });
  });

  it("defines solid surface tokens without color-mix or cool gradients", () => {
    const resolved = createAppCssVariablesResolverForDensity("comfortable")(DEFAULT_THEME);
    for (const key of SOLID_SURFACE_VARS) {
      const value = resolved.variables[key];
      expect(value, key).toBeTruthy();
      expect(value, key).not.toMatch(/color-mix/);
      expect(value, key).not.toMatch(/linear-gradient/);
    }
    expect(resolved.variables["--app-surface-cool"]).toBe("none");
    expect(resolved.variables["--app-surface-cool-emphasis"]).toBe("none");
    expect(resolved.dark["--mantine-color-body"]).toBe("var(--app-color-bg)");
    expect(resolved.dark["--mantine-color-dark-7"]).toBe("var(--app-color-surface-panel)");
    expect(resolved.dark["--mantine-color-dark-6"]).toBe("var(--app-color-surface-control)");
    expect(resolved.dark["--mantine-color-dark-8"]).toBe("var(--app-color-surface-chrome)");
  });
});
