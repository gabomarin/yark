/**
 * TEMP (PUX-004) — palette preview.
 *
 * Generates a Radix-style dark neutral ramp (steps 1..12) from any picked
 * colour, so an operator can see how the app would read with a different
 * palette. It only overrides `--ark-*` custom properties (the resolver derives
 * every `--app-color-*` surface, border, text and Mantine `dark-*` slot from
 * them), so no feature CSS changes.
 *
 * Delete this file together with `PalettePreviewSwitcher.tsx` once the palette
 * is decided; nothing else imports it.
 */

const STORAGE_KEY = "yark.appearance.palettePreviewColor.v1";
const DARKNESS_STORAGE_KEY = "yark.appearance.palettePreviewDarkness.v1";
const INTENSITY_STORAGE_KEY = "yark.appearance.palettePreviewIntensity.v1";
const ART_STORAGE_KEY = "yark.appearance.shellArtVisible.v1";

export const DEFAULT_PALETTE_DARKNESS = 0.5;
export const DEFAULT_PALETTE_INTENSITY = 0.5;

/** ± lightness applied to step 1 when the darkness slider sits at either end. */
const DARKNESS_SWING = 0.12;

/** Intensity 0 → true neutral greys; 0.5 keeps half the picked colour's tint; 1 goes all the way to it. */
const INTENSITY_MULTIPLIER = 1;

/** Safety stop only — a pure sRGB primary is ~0.32 chroma and would read as neon chrome. */
const MAX_PICKED_CHROMA = 0.3;

/** Radix dark scale, steps 1..12. Fixed length so step lookups are non-optional. */
export type RadixDarkScale = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

export interface PalettePreview {
  /** Radix dark scale, steps 1..12. */
  gray: RadixDarkScale;
  /** App canvas, a step deeper than the ramp's step 1 so the sidebar still separates. */
  background: string;
}

/**
 * Lightness ladder for the Dark radix neutrals (step 1 darkest, step 12 text).
 * The app maps chrome = step 2, panel = step 3, control = step 5, control hover
 * = step 6, borders = steps 7 / 9, text = step 11.
 */
const NEUTRAL_LIGHTNESS = [
  0.17, 0.21, 0.26, 0.3, 0.34, 0.38, 0.45, 0.57, 0.63, 0.68, 0.8, 0.95,
] as const;

/** Chroma per step: enough to carry the picked hue, never enough to read as a colour. */
const NEUTRAL_CHROMA = [
  0.004, 0.006, 0.009, 0.011, 0.013, 0.014, 0.016, 0.018, 0.018, 0.017, 0.013, 0.006,
] as const;

/**
 * The chroma ladder as a 0..1 profile (peak at the control/border steps). The
 * intensity slider scales the picked colour's own chroma by it, so intensity 1
 * puts the picked chroma on the mid steps instead of stopping at the neutral
 * ladder's ~0.018 ceiling.
 */
const CHROMA_PROFILE: readonly number[] = NEUTRAL_CHROMA.map(
  (value) => value / Math.max(...NEUTRAL_CHROMA),
);

/** Quick swatches for the picker; any other colour works too. */
export const PALETTE_SWATCHES = [
  "#0c1427",
  "#101113",
  "#121113",
  "#101211",
  "#111110",
  "#111111",
] as const;

function srgbChannelToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return null;
  const int = Number.parseInt(match[1] as string, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** sRGB hex → OKLCH. Returns null for anything that is not a 6-digit hex. */
export function hexToOklch(
  hex: string,
): { lightness: number; chroma: number; hue: number } | null {
  const rgb = parseHex(hex);
  if (rgb === null) return null;
  const [r, g, b] = rgb.map(srgbChannelToLinear) as [number, number, number];

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const hue = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { lightness, chroma: Math.sqrt(a * a + bb * bb), hue };
}

function toScale12(values: readonly string[]): RadixDarkScale {
  if (values.length !== 12) {
    throw new Error(`palette scale needs 12 steps, got ${values.length}`);
  }
  return values as unknown as RadixDarkScale;
}

/**
 * Shifts the whole ramp darker (darkness → 1) or lighter (darkness → 0) around
 * `DEFAULT_PALETTE_DARKNESS`. The shift tapers to zero by step 12 so text and
 * muted copy stay readable at any darkness.
 */
function lightnessForStep(index: number, darkness: number): number {
  const shift =
    (DEFAULT_PALETTE_DARKNESS - darkness) * 2 * DARKNESS_SWING;
  const taper = 1 - index / (NEUTRAL_LIGHTNESS.length - 1);
  const base = NEUTRAL_LIGHTNESS[index] as number;
  return Math.min(0.99, Math.max(0.05, base + shift * taper));
}

/** Chroma for one step, from the picked colour's own chroma × the intensity knob. */
function chromaForStep(index: number, pickedChroma: number, intensity: number): number {
  return pickedChroma * (CHROMA_PROFILE[index] as number) * intensity * INTENSITY_MULTIPLIER;
}

/**
 * Builds a dark neutral ramp from one colour. The picked colour's hue carries
 * through; `darkness` (0..1) moves the ramp between lighter and darker
 * neutrals and `intensity` (0..1) scales how much of the picked colour's own
 * chroma lands on the ramp (1 = the picked colour itself on the mid steps).
 */
export function buildPaletteFromColor(
  hex: string,
  darkness: number = DEFAULT_PALETTE_DARKNESS,
  intensity: number = DEFAULT_PALETTE_INTENSITY,
): PalettePreview | null {
  const oklch = hexToOklch(hex);
  if (oklch === null) return null;
  const pickedChroma = Math.min(oklch.chroma, MAX_PICKED_CHROMA);
  const hue = Math.round(oklch.hue);

  const gray = toScale12(
    NEUTRAL_LIGHTNESS.map(
      (_unused, index) =>
        `oklch(${lightnessForStep(index, darkness).toFixed(3)} ${chromaForStep(
          index,
          pickedChroma,
          intensity,
        ).toFixed(4)} ${hue})`,
    ),
  );
  return {
    gray,
    background: `oklch(${(lightnessForStep(0, darkness) * 0.72).toFixed(3)} ${chromaForStep(
      0,
      pickedChroma,
      intensity,
    ).toFixed(4)} ${hue})`,
  };
}

/** Every property the preview can set, so a reset can strip all of them. */
const PREVIEW_VARIABLE_NAMES: readonly string[] = [
  "--ark-background",
  "--ark-gray-indicator",
  "--ark-gray-track",
  "--ark-blue-ini-category",
  ...Array.from({ length: 12 }, (_unused, index) => `--ark-gray-${index + 1}`),
];

function previewCssVariables(palette: PalettePreview): Record<string, string> {
  const variables: Record<string, string> = {
    "--ark-background": palette.background,
    "--ark-gray-indicator": palette.gray[7],
    "--ark-gray-track": palette.gray[7],
    "--ark-blue-ini-category": `color-mix(in srgb, ${palette.background} 78%, ${palette.gray[1]})`,
  };
  palette.gray.forEach((value, index) => {
    variables[`--ark-gray-${index + 1}`] = value;
  });
  return variables;
}

export function clearPalettePreview(): void {
  const root = document.documentElement;
  delete root.dataset.palettePreview;
  for (const name of PREVIEW_VARIABLE_NAMES) root.style.removeProperty(name);
}

/** Applies the generated ramp, or clears the overrides when `hex` is null/unknown. */
export function applyPalettePreview(
  hex: string | null,
  darkness: number = DEFAULT_PALETTE_DARKNESS,
  intensity: number = DEFAULT_PALETTE_INTENSITY,
): void {
  clearPalettePreview();
  if (hex === null) return;
  const palette = buildPaletteFromColor(hex, darkness, intensity);
  if (palette === null) return;
  const root = document.documentElement;
  root.dataset.palettePreview = hex;
  for (const [name, value] of Object.entries(previewCssVariables(palette))) {
    root.style.setProperty(name, value);
  }
}

export function readStoredPaletteColor(): string | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === null || parseHex(stored) === null) return null;
  return stored;
}

export function writeStoredPaletteColor(hex: string | null): void {
  if (hex === null) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, hex);
}

export function readStoredPaletteDarkness(): number {
  return readStoredUnit(DARKNESS_STORAGE_KEY, DEFAULT_PALETTE_DARKNESS);
}

export function writeStoredPaletteDarkness(darkness: number): void {
  window.localStorage.setItem(DARKNESS_STORAGE_KEY, String(darkness));
}

export function readStoredPaletteIntensity(): number {
  return readStoredUnit(INTENSITY_STORAGE_KEY, DEFAULT_PALETTE_INTENSITY);
}

export function writeStoredPaletteIntensity(intensity: number): void {
  window.localStorage.setItem(INTENSITY_STORAGE_KEY, String(intensity));
}

function readStoredUnit(key: string, fallback: number): number {
  const stored = window.localStorage.getItem(key);
  if (stored === null) return fallback;
  const value = Number.parseFloat(stored);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/**
 * TEMP (PUX-004) — hides the brand art on the shell surface and the canvas
 * pseudo-elements, so the palette can be judged with and without it. Styling
 * lives in `AppShellLayout.module.css` under `[data-shell-art="off"]`.
 */
export function applyShellArt(visible: boolean): void {
  const root = document.documentElement;
  if (visible) {
    delete root.dataset.shellArt;
    return;
  }
  root.dataset.shellArt = "off";
}

export function readStoredShellArtVisible(): boolean {
  return window.localStorage.getItem(ART_STORAGE_KEY) !== "0";
}

export function writeStoredShellArtVisible(visible: boolean): void {
  window.localStorage.setItem(ART_STORAGE_KEY, visible ? "1" : "0");
}
