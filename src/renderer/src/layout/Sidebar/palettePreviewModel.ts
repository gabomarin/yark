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
const ART_STORAGE_KEY = "yark.appearance.palettePreviewShellArt.v1";
const PLATE_COLOR_STORAGE_KEY = "yark.appearance.palettePreviewPlateColor.v1";

export const DEFAULT_PALETTE_DARKNESS = 0.5;
export const DEFAULT_PALETTE_INTENSITY = 0.5;

/** ± lightness applied to step 1 when the darkness slider sits at either end. */
const DARKNESS_SWING = 0.12;

/** Intensity 0 → true neutral greys; 0.5 keeps half the picked colour's tint; 1 goes all the way to it. */
const INTENSITY_MULTIPLIER = 1;

/** Safety stop only — a pure sRGB primary is ~0.32 chroma and would read as neon chrome. */
const MAX_PICKED_CHROMA = 0.3;

/** Radix dark scale, steps 1..12. Fixed length so step lookups are non-optional. */
type RadixDarkScale = readonly [
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

/**
 * Plate hues to try: only hue and chroma are read (the ladder owns lightness), so these
 * are deliberately unremarkable colours that carry a direction - stone, moss, teal,
 * violet, rose, amber.
 */
export const PLATE_SWATCHES = [
  "#8f7f63",
  "#6f8a6a",
  "#5f8a93",
  "#8578b0",
  "#9c6f7d",
  "#a3814f",
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
  ...Array.from({ length: 12 }, (_unused, index) => `--ark-gray-${index + 1}`),
];

function previewCssVariables(palette: PalettePreview): Record<string, string> {
  const variables: Record<string, string> = {
    "--ark-background": palette.background,
    "--ark-gray-indicator": palette.gray[7],
    "--ark-gray-track": palette.gray[7],
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

function readStoredHex(key: string): string | null {
  const stored = window.localStorage.getItem(key);
  if (stored === null || parseHex(stored) === null) return null;
  return stored;
}

function writeStoredHex(key: string, hex: string | null): void {
  if (hex === null) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, hex);
}

export function readStoredPaletteColor(): string | null {
  return readStoredHex(STORAGE_KEY);
}

export function writeStoredPaletteColor(hex: string | null): void {
  writeStoredHex(STORAGE_KEY, hex);
}

/**
 * Explicit plate colour: the panel/raised/control/border steps take this hue and chroma
 * instead of the surface pick, so the plates can be judged on their own (cool hull with
 * green panels, say). `null` = derive them from the surface pick again.
 */
export function readStoredPlateColor(): string | null {
  return readStoredHex(PLATE_COLOR_STORAGE_KEY);
}

export function writeStoredPlateColor(hex: string | null): void {
  writeStoredHex(PLATE_COLOR_STORAGE_KEY, hex);
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
 * TEMP (PUX-004) — brand-art candidates on the shell surface, so the motif can be
 * judged on the real chrome instead of on a mock. One `[data-shell-art="…"]` rule per
 * tile in `AppShellLayout.module.css`; `hex` is the shipped tile and needs no rule.
 */
export const SHELL_ART_OPTIONS = [
  { value: "hex", label: "Hex" },
  { value: "drop", label: "Drop" },
  { value: "tek", label: "Tek" },
  { value: "strata", label: "Strata" },
  { value: "beams", label: "Beams" },
  { value: "obelisk", label: "Obelisk" },
  { value: "grain", label: "Grain" },
  { value: "off", label: "Off" },
] as const;

export type ShellArtOption = (typeof SHELL_ART_OPTIONS)[number]["value"];

const SHELL_ART_VALUES: readonly string[] = SHELL_ART_OPTIONS.map((option) => option.value);

export function applyShellArt(option: ShellArtOption): void {
  document.documentElement.dataset.shellArt = option;
}

export function readStoredShellArt(): ShellArtOption {
  const stored = window.localStorage.getItem(ART_STORAGE_KEY);
  return stored !== null && SHELL_ART_VALUES.includes(stored)
    ? (stored as ShellArtOption)
    : "grain";
}

export function writeStoredShellArt(option: ShellArtOption): void {
  window.localStorage.setItem(ART_STORAGE_KEY, option);
}

/* ------------------------------------------------------- INI editor chrome */

const INI_CHROME_STORAGE_KEY = "yark.appearance.palettePreviewIniChrome.v1";

/**
 * TEMP (PUX-004) — INI editor section-header treatments, so both can be judged on the
 * real table (with mod subheaders in it). `b` is flat (solid band, no wash) and is the
 * shipped default; `a` is the same neutral band with the older soft wash - no rail in
 * either, since a rail on every band dilutes the app's selection notch.
 * Styling: `IniEditorChrome.module.css`.
 */
export const INI_CHROME_OPTIONS = [
  { value: "b", label: "B · flat band" },
  { value: "a", label: "A · soft wash" },
] as const;

export type IniChromeOption = (typeof INI_CHROME_OPTIONS)[number]["value"];

const INI_CHROME_VALUES: readonly string[] = INI_CHROME_OPTIONS.map((option) => option.value);

export function applyIniChrome(option: IniChromeOption): void {
  document.documentElement.dataset.iniChrome = option;
}

export function readStoredIniChrome(): IniChromeOption {
  const stored = window.localStorage.getItem(INI_CHROME_STORAGE_KEY);
  return stored !== null && INI_CHROME_VALUES.includes(stored)
    ? (stored as IniChromeOption)
    : "b";
}

export function writeStoredIniChrome(option: IniChromeOption): void {
  window.localStorage.setItem(INI_CHROME_STORAGE_KEY, option);
}

/* ------------------------------------------------- surface separation knobs */

const PANEL_LIFT_STORAGE_KEY = "yark.appearance.palettePreviewPanelLift.v1";
const HAIRLINE_LIFT_STORAGE_KEY = "yark.appearance.palettePreviewHairlineLift.v1";

/** Both knobs are "mix this much white into the shipped value" (0 = shipped). */
const DEFAULT_SURFACE_LIFT = 0;

/**
 * Lifts the panel fill (`--ark-gray-3`) and the hairline (`--ark-gray-7`) toward
 * white, so an operator can see how much separation a card actually needs before
 * the WCAG 1.4.11 gap closes (the accent/neutral previews own the rest of the
 * ramp; this runs after them and only touches those two steps).
 */
/**
 * The values the lift mixes from: the palette preview's own ramp when one is
 * active, otherwise the shipped greys. Never `radixPalette` directly, or the
 * knobs would replace a chosen palette's tint with plain grey.
 */
export function surfaceLiftBases(
  color: string | null,
  darkness: number = DEFAULT_PALETTE_DARKNESS,
  intensity: number = DEFAULT_PALETTE_INTENSITY,
  warmth: number = DEFAULT_PLATE_WARMTH,
  plateColor: string | null = null,
): { panel: string; hairline: string } {
  return {
    panel: plateStep(2, color, plateColor, darkness, intensity, warmth),
    hairline: plateStep(6, color, plateColor, darkness, intensity, warmth),
  };
}

export function applySurfacePreview(
  panelLift: number = DEFAULT_SURFACE_LIFT,
  hairlineLift: number = DEFAULT_SURFACE_LIFT,
  bases: { panel: string; hairline: string } | null = null,
): void {
  const root = document.documentElement;
  /* No picked palette: the shipped steps already own these values (the hairline lift is
   * baked into `radixPalette`), so drop the override instead of re-deriving it -
   * `platePaletteContext(null)` cannot know the shipped tint. At 0 with a pick this
   * re-applies the base verbatim: removing it would drop the tint back to theme grey. */
  if (bases === null) {
    root.style.removeProperty("--ark-gray-3");
    root.style.removeProperty("--ark-gray-7");
    return;
  }
  const mix = (base: string, lift: number): string =>
    lift <= 0
      ? base
      : `color-mix(in srgb, ${base} ${Math.round((1 - lift) * 100)}%, white)`;
  root.style.setProperty("--ark-gray-3", mix(bases.panel, panelLift));
  root.style.setProperty("--ark-gray-7", mix(bases.hairline, hairlineLift));
}

export function readStoredPanelLift(): number {
  return readStoredUnit(PANEL_LIFT_STORAGE_KEY, DEFAULT_SURFACE_LIFT);
}

export function writeStoredPanelLift(value: number): void {
  window.localStorage.setItem(PANEL_LIFT_STORAGE_KEY, String(value));
}

export function readStoredHairlineLift(): number {
  return readStoredUnit(HAIRLINE_LIFT_STORAGE_KEY, DEFAULT_SURFACE_LIFT);
}

export function writeStoredHairlineLift(value: number): void {
  window.localStorage.setItem(HAIRLINE_LIFT_STORAGE_KEY, String(value));
}

/** Inverse of `hexToOklch` for a sampled sRGB triple - used by the tint readout. */
export function rgbToOklch(
  r: number,
  g: number,
  b: number,
): { lightness: number; chroma: number; hue: number } {
  const [lr, lg, lb] = [r, g, b].map(srgbChannelToLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    lightness,
    chroma: Math.sqrt(a * a + bb * bb),
    hue: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

/* ------------------------------------------------------------ plate warmth */

const PLATE_WARMTH_STORAGE_KEY = "yark.appearance.palettePreviewPlateWarmth.v1";

const DEFAULT_PLATE_WARMTH = 0;

/** Warm stone hue the plates rotate toward at warmth = 1 (amber-grey, never "brown"). */
const PLATE_WARM_HUE = 58;

/** Steps that read as plates: panel/raised/control/hover, borders (0-based). */
const PLATE_STEP_INDEXES = [2, 3, 4, 5, 6, 8] as const;

function hueDistance(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/**
 * Rotates the *plate* steps toward a warm stone hue while the hull (steps 1-2) and the
 * text steps stay where the palette put them: the cool-hull/warm-plate seam is what
 * keeps a dark operational UI from reading as one monochrome blue. `warmth` 0 writes the
 * palette's own values back, so the knob is reversible without drift.
 */
function plateStepValue(
  index: number,
  pick: { hue: number; chroma: number },
  darkness: number,
  intensity: number,
  warmth: number,
): string {
  const lightness = lightnessForStep(index, darkness);
  const baseChroma = chromaForStep(index, pick.chroma, intensity);
  if (!PLATE_STEP_INDEXES.includes(index as (typeof PLATE_STEP_INDEXES)[number])) {
    return `oklch(${lightness.toFixed(3)} ${baseChroma.toFixed(4)} ${Math.round(pick.hue)})`;
  }
  const hue = pick.hue + hueDistance(pick.hue, PLATE_WARM_HUE) * warmth;
  const chroma = baseChroma + warmth * 0.004;
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(4)} ${Math.round((hue + 360) % 360)})`;
}

/** The hue/chroma the plates are derived from: the palette's pick, or a neutral grey. */
function platePaletteContext(color: string | null): { hue: number; chroma: number } {
  const oklch = color === null ? null : hexToOklch(color);
  return { hue: oklch?.hue ?? 266, chroma: Math.min(oklch?.chroma ?? 0, MAX_PICKED_CHROMA) };
}

/**
 * One plate step, from whichever colour owns the plates: an explicit plate colour wins,
 * otherwise the surface pick rotated toward `warmth`.
 *
 * An explicit plate colour already carries the chroma the operator asked to see, so
 * neither `warmth` (which rotates a surface pick) nor `intensity` (which dilutes one)
 * scales it - the ladder's chroma profile is the only thing shaping it.
 */
function plateStep(
  index: number,
  color: string | null,
  plateColor: string | null,
  darkness: number,
  intensity: number,
  warmth: number,
): string {
  const picked = plateColor === null ? null : hexToOklch(plateColor);
  if (picked === null) {
    return plateStepValue(index, platePaletteContext(color), darkness, intensity, warmth);
  }
  return plateStepValue(
    index,
    { hue: picked.hue, chroma: Math.min(picked.chroma, MAX_PICKED_CHROMA) },
    darkness,
    1,
    0,
  );
}

export function applyPlateWarmth(
  warmth: number,
  color: string | null,
  darkness: number = DEFAULT_PALETTE_DARKNESS,
  intensity: number = DEFAULT_PALETTE_INTENSITY,
  plateColor: string | null = null,
): void {
  const root = document.documentElement;
  /* Without a pick or an explicit plate colour there is no tint to apply, and the
   * shipped steps win: writing the neutral fallback here would paint the app grey while
   * the tokens are tinted. */
  if (color === null && plateColor === null) {
    for (const index of PLATE_STEP_INDEXES) {
      root.style.removeProperty(`--ark-gray-${index + 1}`);
    }
    return;
  }
  for (const index of PLATE_STEP_INDEXES) {
    root.style.setProperty(
      `--ark-gray-${index + 1}`,
      plateStep(index, color, plateColor, darkness, intensity, warmth),
    );
  }
}

export function readStoredPlateWarmth(): number {
  return readStoredUnit(PLATE_WARMTH_STORAGE_KEY, DEFAULT_PLATE_WARMTH);
}

export function writeStoredPlateWarmth(value: number): void {
  window.localStorage.setItem(PLATE_WARMTH_STORAGE_KEY, String(value));
}