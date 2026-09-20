/**
 * TEMP (PUX-004) — palette presets for the appearance preview.
 *
 * `SHIPPED_PROPOSAL` mirrors what is baked into `radixPalette` / `accentPalette`
 * (`tokens.ts`) and is applied on first load, so a dev run and the installed app show
 * the same picture — the tool must never paint a palette the app does not have. The
 * other two are comparison points: "paleo tech" (logo-derived; its deeper `#2a72e8`
 * accent closes the documented white-on-accent gap at 4.50:1) and "Darcula"
 * (IntelliJ-ish neutral dark, not a brand direction).
 *
 * Delete with the rest of the preview tooling once the appearance pass is closed.
 */

import {
  applyPalettePreview,
  applyPlateWarmth,
  applySurfacePreview,
  surfaceLiftBases,
  writeStoredHairlineLift,
  writeStoredPaletteColor,
  writeStoredPaletteDarkness,
  writeStoredPaletteIntensity,
  writeStoredPanelLift,
  writeStoredPlateColor,
  writeStoredPlateWarmth,
} from "./palettePreviewModel";
import { applyAccentPreview, writeStoredAccentColor } from "./paletteAccentPreviewModel";

export interface PaletteProposal {
  key: string;
  label: string;
  /** Surface hue base: the whole neutral ramp is generated from it. */
  surface: string;
  darkness: number;
  intensity: number;
  panelLift: number;
  hairlineLift: number;
  /** Warm stone plates on a cool hull (0 = keep the palette's own temperature). */
  plateWarmth: number;
  /** Plates take this hue/chroma instead of the surface pick; `null` = derive them. */
  plateColor: string | null;
  /** Accent for filled primaries; `null` leaves the shipped `accentPalette` alone. */
  accent: string | null;
}

/** Logo-derived: navy hull, warm basalt plates, azure accent. */
const PALEO_TECH_PROPOSAL: PaletteProposal = {
  key: "paleo",
  label: "paleo tech",
  surface: "#0c1427",
  darkness: 0.5,
  intensity: 0.55,
  panelLift: 0.08,
  hairlineLift: 0.14,
  plateWarmth: 0.55,
  plateColor: null,
  accent: "#2a72e8",
};

/**
 * Darcula-flavoured (IntelliJ/Android Studio): neutral-dark hull, blue-grey chrome
 * (#3c3f41), cool plates, and the deep selection blue as the accent. Not logo-derived -
 * a comparison point, not a brand direction.
 */
const DARCULA_PROPOSAL: PaletteProposal = {
  key: "darcula",
  label: "Darcula",
  surface: "#3c3f41",
  darkness: 0.5,
  intensity: 0.85,
  panelLift: 0.06,
  hairlineLift: 0.12,
  plateWarmth: 0,
  plateColor: null,
  accent: "#2b5b9e",
};

/**
 * The baked shipped palette (PUX-004 decision): surface `#10407d` at darkness 0.65 /
 * intensity 0.55, hairline step lifted 8%, no plate warmth, shipped accent. Its numbers
 * must stay in step with `radixPalette` in `tokens.ts`, or "preview off" stops matching
 * the installed app.
 */
export const SHIPPED_PROPOSAL: PaletteProposal = {
  key: "shipped",
  label: "shipped",
  surface: "#10407d",
  darkness: 0.65,
  intensity: 0.55,
  panelLift: 0,
  hairlineLift: 0.08,
  plateWarmth: 0,
  plateColor: null,
  accent: null,
};

/** Every preset the panel can apply; `SHIPPED_PROPOSAL` is the one applied on load. */
export const PROPOSALS: readonly PaletteProposal[] = [
  SHIPPED_PROPOSAL,
  PALEO_TECH_PROPOSAL,
  DARCULA_PROPOSAL,
];

/** True when the operator has already touched any preview control. */
export function hasStoredProposal(): boolean {
  return Object.keys(window.localStorage).some((key) =>
    key.includes("palettePreview"),
  );
}

export function applyProposal(proposal: PaletteProposal): void {
  const {
    surface,
    darkness,
    intensity,
    panelLift,
    hairlineLift,
    plateWarmth,
    plateColor,
    accent,
  } = proposal;
  applyPalettePreview(surface, darkness, intensity);
  applyPlateWarmth(plateWarmth, surface, darkness, intensity, plateColor);
  applySurfacePreview(
    panelLift,
    hairlineLift,
    surfaceLiftBases(surface, darkness, intensity, plateWarmth, plateColor),
  );
  applyAccentPreview(accent);
  writeStoredPaletteColor(surface);
  writeStoredPaletteDarkness(darkness);
  writeStoredPaletteIntensity(intensity);
  writeStoredPanelLift(panelLift);
  writeStoredHairlineLift(hairlineLift);
  writeStoredPlateWarmth(plateWarmth);
  writeStoredPlateColor(plateColor);
  writeStoredAccentColor(accent);
}
