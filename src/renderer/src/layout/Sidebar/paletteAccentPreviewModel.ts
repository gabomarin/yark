/**
 * TEMP (PUX-004) — accent preview.
 *
 * Companion to the neutral-ramp preview: pick an accent and this generates the
 * 12-step Radix-style ramp (plus its alpha ramp) and mirrors it onto Mantine's
 * `blue` slots, so an operator can judge the accent everywhere at once — filled
 * primaries, rails, focus rings, links, switches — before the brand decision.
 *
 * Overrides are CSS custom properties only, so no feature CSS or theme code
 * changes. Delete with `PalettePreviewSwitcher.tsx` once the accent is decided.
 */

import { hexToOklch, rgbToOklch } from "./palettePreviewModel";

const ACCENT_STORAGE_KEY = "yark.appearance.palettePreviewAccent.v1";

/** Candidate accents (current blue first). Any hex works through the picker. */
export const ACCENT_SWATCHES = ["#3b8cff", "#5b7cfa", "#7c5cff", "#22b8cf", "#2dd4bf", "#f5a524"] as const;

/** Steps 1..12 lightness ladder for a dark accent scale; step 9 is the pick. */
const ACCENT_LIGHTNESS_PROFILE = [0.18, 0.24, 0.32, 0.4, 0.46, 0.52, 0.6, 0.68, 1, 1, 1, 1] as const;

/** Chroma profile per step, relative to the picked colour's own chroma. */
const ACCENT_CHROMA_PROFILE = [0.14, 0.2, 0.36, 0.52, 0.66, 0.78, 0.88, 0.96, 1, 1, 0.86, 0.34] as const;

/** Radix-style alpha ladder for the accent ramp. */
const ACCENT_ALPHA_PROFILE = [0.06, 0.11, 0.2, 0.26, 0.32, 0.39, 0.47, 0.55, 0.63, 0.71, 0.85, 0.96] as const;

interface AccentPreview {
  /** 12 steps, 1..12. */
  steps: readonly string[];
  /** 12 alpha steps, a1..a12. */
  alphas: readonly string[];
}

/**
 * Builds an accent ramp from one colour. Step 9 is the picked colour verbatim so
 * `--app-color-accent` (and every filled primary) shows exactly what was picked;
 * the steps around it fan out in lightness and chroma. Returns null for anything
 * that is not a 6-digit hex.
 */
function buildAccentFromColor(hex: string): AccentPreview | null {
  const oklch = hexToOklch(hex);
  if (oklch === null) return null;
  const baseLightness = oklch.lightness;
  const chroma = Math.max(oklch.chroma, 0.08);
  const hue = Math.round(oklch.hue);

  const steps = ACCENT_LIGHTNESS_PROFILE.map((profileLightness, index) => {
    if (index === 8) return hex;
    const lightness =
      index < 8 ? Math.max(0.05, baseLightness * profileLightness) : Math.min(0.98, baseLightness + (index - 8) * 0.12);
    const stepChroma = chroma * (ACCENT_CHROMA_PROFILE[index] as number);
    return `oklch(${lightness.toFixed(3)} ${stepChroma.toFixed(4)} ${hue})`;
  });

  const alphas = ACCENT_ALPHA_PROFILE.map(
    (alpha) => `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`,
  );

  return { steps, alphas };
}

/**
 * Mantine slot order for the theme's `blue` scale: the app maps radix steps onto
 * Mantine shades as 12,11,8,7,6,9,10,5,3,1 (1-based steps).
 */
const MANTINE_BLUE_ORDER = [12, 11, 8, 7, 6, 9, 10, 5, 3, 1] as const;

/** Every property the accent preview can set, so a reset can strip all of them. */
const ACCENT_VARIABLE_NAMES: readonly string[] = [
  ...Array.from({ length: 12 }, (_unused, index) => `--ark-blue-${index + 1}`),
  ...Array.from({ length: 12 }, (_unused, index) => `--ark-blue-a${index + 1}`),
  "--ark-blue-indicator",
  ...Array.from({ length: 10 }, (_unused, index) => `--mantine-color-blue-${index}`),
  "--mantine-color-blue-filled",
  "--mantine-color-blue-filled-hover",
  "--mantine-color-blue-light",
  "--mantine-color-blue-light-hover",
  "--mantine-color-blue-light-color",
  "--mantine-color-blue-text",
  "--mantine-color-blue-contrast",
];

function accentCssVariables(preview: AccentPreview, hex: string): Record<string, string> {
  const variables: Record<string, string> = {};
  preview.steps.forEach((value, index) => {
    variables[`--ark-blue-${index + 1}`] = value;
  });
  preview.alphas.forEach((value, index) => {
    variables[`--ark-blue-a${index + 1}`] = value;
  });
  variables["--ark-blue-indicator"] = hex;
  MANTINE_BLUE_ORDER.forEach((step, index) => {
    variables[`--mantine-color-blue-${index}`] = preview.steps[step - 1] as string;
  });
  const oklch = hexToOklch(hex);
  const hoverLightness = Math.min(0.98, (oklch?.lightness ?? 0.6) + 0.07);
  const hoverChroma = Math.max(oklch?.chroma ?? 0.15, 0.08);
  const hoverHue = Math.round(oklch?.hue ?? 0);
  variables["--mantine-color-blue-filled"] = hex;
  variables["--mantine-color-blue-filled-hover"] =
    `oklch(${hoverLightness.toFixed(3)} ${hoverChroma.toFixed(4)} ${hoverHue})`;
  variables["--mantine-color-blue-light"] = `color-mix(in srgb, ${hex} 22%, transparent)`;
  variables["--mantine-color-blue-light-hover"] = `color-mix(in srgb, ${hex} 32%, transparent)`;
  variables["--mantine-color-blue-light-color"] = preview.steps[10] as string;
  variables["--mantine-color-blue-text"] = preview.steps[10] as string;
  variables["--mantine-color-blue-contrast"] = "#ffffff";
  return variables;
}

function clearAccentPreview(): void {
  const root = document.documentElement;
  delete root.dataset.accentPreview;
  for (const name of ACCENT_VARIABLE_NAMES) root.style.removeProperty(name);
}

export function applyAccentPreview(hex: string | null): void {
  clearAccentPreview();
  if (hex === null) return;
  const preview = buildAccentFromColor(hex);
  if (preview === null) return;
  const root = document.documentElement;
  root.dataset.accentPreview = hex;
  for (const [name, value] of Object.entries(accentCssVariables(preview, hex))) {
    if (value !== undefined) root.style.setProperty(name, value);
  }
}

export function readStoredAccentColor(): string | null {
  const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
  return stored === null || hexToOklch(stored) === null ? null : stored;
}

export function writeStoredAccentColor(hex: string | null): void {
  if (hex === null) {
    window.localStorage.removeItem(ACCENT_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ACCENT_STORAGE_KEY, hex);
}

/* ---------------------------------------------------------------- readout */

export interface SurfaceTint {
  /** OKLCH chroma of the effective panel fill: identity without reading as a colour. */
  chroma: number;
  hue: number;
}

export interface ContrastRow {
  label: string;
  ratio: number;
  /** AA text bar, or the 3:1 control bar for fills/cards. */
  min: number;
  /** True when the row is a documented open gap rather than a gate. */
  knownGap?: boolean;
}

/**
 * Live contrast readout for the effective theme: resolves the `--app-color-*`
 * roles through a throwaway element (var() chains only resolve in used values)
 * and returns the ratios a palette decision has to satisfy.
 */
export function readContrastRows(): { rows: ContrastRow[]; tint: SurfaceTint } {
  const resolve = (value: string): string => {
    const probe = document.createElement("span");
    probe.style.color = value;
    probe.style.position = "fixed";
    probe.style.opacity = "0";
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  };

  /*
   * Luminance through a 1x1 canvas: it normalises every CSS colour syntax the
   * previews produce (`oklch()`, `color-mix()`, `var()` chains) to sRGB bytes,
   * which a string parser cannot do.
   */
  const probeCanvas = document.createElement("canvas");
  probeCanvas.width = 1;
  probeCanvas.height = 1;
  const context = probeCanvas.getContext("2d", { willReadFrequently: true });

  const sampleSrgb = (css: string): [number, number, number] => {
    if (context === null) return [0, 0, 0];
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000000";
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
  };

  const luminance = (css: string): number => {
    const channels = sampleSrgb(css).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  const ratio = (a: string, b: string): number => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (high + 0.05) / (low + 0.05);
  };

  const panel = resolve("var(--app-color-panel)");
  const chrome = resolve("var(--app-color-surface-chrome)");
  const text = resolve("var(--app-color-text)");
  const muted = resolve("var(--app-color-muted)");
  const accent = resolve("var(--app-color-accent)");
  const accentText = resolve("var(--app-color-accent-text)");
  const border = resolve("var(--app-color-border-subtle)");
  const canvas = resolve("var(--app-color-bg)");

  const round = (value: number): number => Math.round(value * 100) / 100;

  const panelTint = rgbToOklch(...sampleSrgb(panel));
  const tint: SurfaceTint = { chroma: panelTint.chroma, hue: Math.round(panelTint.hue) };

  const rows: ContrastRow[] = [
    { label: "Text / panel", ratio: round(ratio(text, panel)), min: 4.5 },
    { label: "Muted / panel", ratio: round(ratio(muted, panel)), min: 4.5 },
    { label: "Accent text / panel", ratio: round(ratio(accentText, panel)), min: 4.5 },
    {
      label: "White / accent fill",
      ratio: round(ratio("rgb(255, 255, 255)", accent)),
      min: 3,
      knownGap: true,
    },
    { label: "Panel / chrome", ratio: round(ratio(panel, chrome)), min: 1.1, knownGap: true },
    { label: "Panel / canvas", ratio: round(ratio(panel, canvas)), min: 1.1, knownGap: true },
    { label: "Hairline / panel", ratio: round(ratio(border, panel)), min: 1.7, knownGap: true },
  ];

  return { rows, tint };
}
