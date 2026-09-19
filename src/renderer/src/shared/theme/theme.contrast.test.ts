import { describe, expect, it } from "vitest";
import { accentPalette, appTokens, radixPalette } from "./tokens";

/**
 * Contrast contract for the shipped default theme (#PUX-004).
 *
 * The palette is swappable, so "looks fine on my screen" is not a gate. These
 * numbers are the shipped dark Paleo-Tech ramp; a palette change that breaks
 * them fails here instead of shipping unreadable states.
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

const SURFACE = {
  chrome: radixPalette.gray[1],
  panel: radixPalette.gray[2],
  control: radixPalette.gray[4],
  border: radixPalette.gray[6],
  text: radixPalette.gray[11],
  muted: appTokens.colors.muted,
} as const;

/** AA for normal-size text. */
const TEXT_MIN = 4.5;

describe("default theme contrast", () => {
  it("keeps body text and muted copy readable on the shell surfaces", () => {
    for (const surface of [SURFACE.chrome, SURFACE.panel, SURFACE.control]) {
      expect(contrast(SURFACE.text, surface)).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(contrast(SURFACE.muted, surface)).toBeGreaterThanOrEqual(TEXT_MIN);
    }
  });

  it("keeps the accent usable for controls, for text, and as a label backdrop", () => {
    // Step 9 is the solid accent, step 11 its text/icon tone (see accentPalette).
    const solid = accentPalette.steps[8];
    const asText = accentPalette.steps[10];
    const surfaces = [
      ["chrome", SURFACE.chrome],
      ["panel", SURFACE.panel],
      ["control", SURFACE.control],
    ] as const;
    const failures: string[] = [];
    for (const [name, surface] of surfaces) {
      const controlRatio = contrast(solid, surface);
      // Non-text UI: switch track, checkbox fill, slider bar, selected notch.
      if (controlRatio < 3) {
        failures.push(`accent on ${name} = ${controlRatio.toFixed(2)} (min 3)`);
      }
      const textRatio = contrast(asText, surface);
      if (textRatio < TEXT_MIN) {
        failures.push(`accent-text on ${name} = ${textRatio.toFixed(2)} (min ${TEXT_MIN})`);
      }
    }
    // Known gap (open): a white label on the solid accent is 3.29:1, below AA text. It is the
    // label every filled primary shares (New server, Continue, Apply, and now the lifecycle
    // Start/Resume), so closing it is one global decision about the accent, not a per-button fix.
    // Reaching 4.5 needs a darker solid or black labels — a brand decision, not a
    // token bug, so this only fails if it gets *worse* than the 3:1 control bar.
    const labelRatio = contrast("#ffffff", solid);
    if (labelRatio < 3) {
      failures.push(`white label on accent = ${labelRatio.toFixed(2)} (min 3)`);
    }
    expect(failures, failures.join(" | ")).toEqual([]);
  });

  it("keeps every semantic status colour readable as text", () => {    const semantic = {
      ok: appTokens.colors.ok,
      warn: appTokens.colors.warn,
      attention: appTokens.colors.attention,
      bad: appTokens.colors.bad,
      dangerBright: appTokens.colors.dangerBright,
      cryo: appTokens.colors.cryo,
      fossil: appTokens.colors.fossil,
    };
    const failures: string[] = [];
    for (const [name, value] of Object.entries(semantic)) {
      const ratio = contrast(value, SURFACE.panel);
      // `bad` is the filled/destructive tone, not a text tone: it must clear the
      // 3:1 non-text bar; `dangerBright` is the text-safe red.
      const min = name === "bad" ? 3 : TEXT_MIN;
      if (ratio < min) {
        failures.push(`${name} ${value} on panel = ${ratio.toFixed(2)} (min ${min})`);
      }
    }
    expect(failures, failures.join(" | ")).toEqual([]);
  });

  it("documents the card-separation gap instead of hiding it", () => {
    // Known gap: raised cards separate from the shell by a ~1.15:1 fill and a
    // ~1.80:1 hairline, below WCAG 1.4.11's 3:1 for component boundaries. Raising
    // it is a design decision tracked in docs/design-system.md; this assertion
    // only fails if the separation gets *worse*.
    expect(contrast(SURFACE.chrome, SURFACE.panel)).toBeGreaterThan(1.1);
    expect(contrast(SURFACE.border, SURFACE.panel)).toBeGreaterThan(1.6);
  });
});
