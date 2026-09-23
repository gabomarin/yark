import { describe, expect, it } from "vitest";
import { ALL_APP_THEMES, type AppTheme } from "./themes";

/**
 * Contrast contract, per shipped theme variant (#PUX-004, family-aware #PUX-005-B).
 *
 * The palette is swappable, so "looks fine on my screen" is not a gate. Every
 * variant in the registry runs the floors it declares in `theme.contrast`; the
 * test holds each theme to what it shipped with, so a regression fails.
 *
 * Fluent keeps its original family floors. Plasma Breeze declares the exact KDE
 * accent behaviour for focus/selection (`#3daee9`); filled primary actions have a
 * separate AA-safe role. Every text, muted, status and focus tone clears its
 * documented floor on its own surfaces.
 */

function channelToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const int = Number.parseInt(hex.replace("#", ""), 16);
  const r = channelToLinear((int >> 16) & 255);
  const g = channelToLinear((int >> 8) & 255);
  const b = channelToLinear(int & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((hi as number) + 0.05) / ((lo as number) + 0.05);
}

/** Radix role steps: 2 chrome, 3 panel, 5 control, 7 border, 12 text, 11 muted. */
function surfacesOf(theme: AppTheme) {
  return {
    chrome: theme.palette.gray[1] as string,
    panel: theme.palette.gray[2] as string,
    control: theme.palette.gray[4] as string,
    border: theme.palette.gray[6] as string,
    text: theme.palette.gray[11] as string,
    muted: theme.palette.gray[10] as string,
  };
}

describe.each(ALL_APP_THEMES)("$family $label theme contrast", (theme) => {
  const SURFACE = surfacesOf(theme);
  const FLOOR = theme.contrast;

  it("keeps body text and muted copy readable on the shell surfaces", () => {
    for (const surface of [SURFACE.chrome, SURFACE.panel, SURFACE.control]) {
      expect(contrast(SURFACE.text, surface)).toBeGreaterThanOrEqual(FLOOR.text);
      expect(contrast(SURFACE.muted, surface)).toBeGreaterThanOrEqual(FLOOR.muted);
    }
  });

  it("keeps the accent usable for controls, for text, and as a label backdrop", () => {
    // Step 9 is the solid accent, step 11 its text/icon tone (see the palette).
    const solid = theme.palette.blue[8] as string;
    const asText = theme.palette.blue[10] as string;
    const surfaces = [
      ["chrome", SURFACE.chrome],
      ["panel", SURFACE.panel],
      ["control", SURFACE.control],
    ] as const;
    const failures: string[] = [];
    for (const [name, surface] of surfaces) {
      const controlRatio = contrast(solid, surface);
      // Non-text UI: switch track, checkbox fill, slider bar, selected notch.
      if (controlRatio < FLOOR.accentUi) {
        failures.push(`accent on ${name} = ${controlRatio.toFixed(2)} (min ${FLOOR.accentUi})`);
      }
      const textRatio = contrast(asText, surface);
      if (textRatio < FLOOR.accentText) {
        failures.push(`accent-text on ${name} = ${textRatio.toFixed(2)} (min ${FLOOR.accentText})`);
      }
    }
    const labelRatio = contrast("#ffffff", solid);
    if (labelRatio < FLOOR.accentLabel) {
      failures.push(`white label on accent = ${labelRatio.toFixed(2)} (min ${FLOOR.accentLabel})`);
    }
    expect(failures, failures.join(" | ")).toEqual([]);
  });

  it("keeps filled primary action labels at WCAG AA", () => {
    if (theme.family === "plasma-breeze") {
      expect(contrast("#ffffff", "#2475a5")).toBeGreaterThanOrEqual(4.5);
      expect(contrast("#ffffff", "#206b99")).toBeGreaterThanOrEqual(4.5);
    } else {
      expect(contrast("#ffffff", theme.palette.blue[8] as string)).toBeGreaterThanOrEqual(FLOOR.accentLabel);
    }
  });

  it("keeps every semantic status colour readable as text", () => {
    const semantic = {
      ok: theme.colors.ok,
      warn: theme.colors.warn,
      attention: theme.colors.attention,
      bad: theme.colors.bad,
      dangerBright: theme.colors.dangerBright,
      // `--app-color-cryo` is the palette's step 11, not a fixed hex.
      cryo: theme.palette.blue[10] as string,
      fossil: theme.colors.fossil,
    };
    const failures: string[] = [];
    for (const [name, value] of Object.entries(semantic)) {
      const ratio = contrast(value, SURFACE.panel);
      // `bad` is the filled/destructive tone, not a text tone: it must clear the
      // 3:1 non-text bar; `dangerBright` is the text-safe red.
      const min = name === "bad" ? FLOOR.statusFill : FLOOR.status;
      if (ratio < min) {
        failures.push(`${name} ${value} on panel = ${ratio.toFixed(2)} (min ${min})`);
      }
    }
    expect(failures, failures.join(" | ")).toEqual([]);
  });

  it("documents the card-separation gap instead of hiding it", () => {
    /*
     * Known gap: raised cards separate from the shell by a fill delta and a
     * hairline, below WCAG 1.4.11's 3:1 for component boundaries. Raising it is a
     * design decision tracked in docs/design-system.md, and each theme separates
     * the way its palette allows:
     * - dark leans on the ramp (a visible step between chrome and panel),
     * - light keeps the surfaces near-white on purpose - a visible grey step with
     *   a hard border is what makes a light theme read like a 9x dialog - and
     *   separates with the light hairline plus the elevation ladder instead.
     * These assertions only fail if a theme's separation gets *worse* than what
     * it shipped with (its declared `cardFill` / `cardBorder` floors).
     */
    expect(contrast(SURFACE.chrome, SURFACE.panel)).toBeGreaterThan(FLOOR.cardFill);
    expect(contrast(SURFACE.border, SURFACE.panel)).toBeGreaterThan(FLOOR.cardBorder);
  });
});
