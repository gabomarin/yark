import { describe, expect, it } from "vitest";
import {
  UI_DENSITY_COMPACT_SCALE,
  getAppTokens,
} from "../../src/renderer/src/shared/theme/tokens";

describe("UI density tokens (#62)", () => {
  it("keeps comfortable spacing at the baseline scale", () => {
    const comfortable = getAppTokens("comfortable");
    expect(comfortable.spacing).toEqual({
      xxs: 4,
      xs: 8,
      sm: 12,
      md: 16,
      lg: 20,
      xl: 28,
    });
    expect(comfortable.radius).toEqual({
      sm: 10,
      md: 14,
      lg: 18,
      control: 12,
    });
    expect(comfortable.fontSizes).toEqual({
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
    });
    expect(comfortable.headings).toEqual({
      h1: 34,
      h2: 26,
      h3: 22,
      h4: 18,
      h5: 16,
      h6: 14,
    });
    expect(comfortable.pageTitle).toBe(28);
  });

  it("scales compact spacing, radius, and fontSizes by ~0.82", () => {
    const comfortable = getAppTokens("comfortable");
    const compact = getAppTokens("compact");

    for (const key of Object.keys(comfortable.spacing) as Array<
      keyof typeof comfortable.spacing
    >) {
      expect(compact.spacing[key]).toBe(
        Math.max(1, Math.round(comfortable.spacing[key] * UI_DENSITY_COMPACT_SCALE)),
      );
    }
    for (const key of Object.keys(comfortable.radius) as Array<
      keyof typeof comfortable.radius
    >) {
      expect(compact.radius[key]).toBe(
        Math.max(1, Math.round(comfortable.radius[key] * UI_DENSITY_COMPACT_SCALE)),
      );
    }
    for (const key of Object.keys(comfortable.fontSizes) as Array<
      keyof typeof comfortable.fontSizes
    >) {
      expect(compact.fontSizes[key]).toBe(
        Math.max(1, Math.round(comfortable.fontSizes[key] * UI_DENSITY_COMPACT_SCALE)),
      );
    }
    for (const key of Object.keys(comfortable.headings) as Array<
      keyof typeof comfortable.headings
    >) {
      expect(compact.headings[key]).toBe(
        Math.max(1, Math.round(comfortable.headings[key] * UI_DENSITY_COMPACT_SCALE)),
      );
    }
    expect(compact.pageTitle).toBe(
      Math.max(1, Math.round(comfortable.pageTitle * UI_DENSITY_COMPACT_SCALE)),
    );

    expect(compact.spacing).toEqual({
      xxs: 3,
      xs: 7,
      sm: 10,
      md: 13,
      lg: 16,
      xl: 23,
    });
    expect(compact.pageTitle).toBe(23);
  });

  it("does not change colors between densities", () => {
    expect(getAppTokens("compact").colors).toEqual(getAppTokens("comfortable").colors);
  });
});
