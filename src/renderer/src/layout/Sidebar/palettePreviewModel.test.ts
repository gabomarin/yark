import { afterEach, describe, expect, it } from "vitest";
import {
  applyPalettePreview,
  applyShellArt,
  buildPaletteFromColor,
  clearPalettePreview,
  hexToOklch,
  readStoredPaletteColor,
  readStoredShellArt,
  surfaceLiftBases,
  writeStoredPaletteColor,
  writeStoredShellArt,
} from "./palettePreviewModel";

describe("palette preview (temp PUX-004)", () => {
  afterEach(() => {
    clearPalettePreview();
    window.localStorage.clear();
  });

  it("converts sRGB to OKLCH", () => {
    const red = hexToOklch("#ff0000");
    expect(red).not.toBeNull();
    expect(red?.lightness).toBeCloseTo(0.628, 2);
    expect(red?.hue).toBeCloseTo(29.2, 0);
    expect(hexToOklch("#0c1427")?.hue).toBeCloseTo(265.6, 0);
    expect(hexToOklch("nope")).toBeNull();
  });

  it("builds a 12-step ramp and a deeper canvas from the picked hue", () => {
    const palette = buildPaletteFromColor("#ff0000");
    expect(palette).not.toBeNull();
    expect(palette?.gray).toHaveLength(12);
    for (const step of palette?.gray ?? []) expect(step).toMatch(/^oklch\(/);
    // Same hue across the ramp, and the canvas sits below step 1.
    expect(palette?.gray[0]).toContain(" 29)");
    expect(palette?.background).toContain(" 29)");
    expect(palette?.gray[11]).toContain("0.95");
  });

  it("keeps a near-grey pick close to neutral", () => {
    const chromaOf = (step: string | undefined) => Number.parseFloat((step ?? "").split(" ")[1] ?? "0");
    const muted = buildPaletteFromColor("#1c1c1c");
    const vivid = buildPaletteFromColor("#7f1d1d");
    expect(chromaOf(muted?.gray[10])).toBeLessThan(chromaOf(vivid?.gray[10]));
    expect(chromaOf(muted?.gray[10])).toBeLessThan(0.005);
  });

  it("can reach the picked colour's own chroma at full intensity", () => {
    const chromaOf = (step: string | undefined) => Number.parseFloat((step ?? "").split(" ")[1] ?? "0");
    const picked = hexToOklch("#3b8cff");
    const ramp = buildPaletteFromColor("#3b8cff", undefined, 1);
    // The ladder peaks at the control/border steps, so the peak carries the pick.
    expect(chromaOf(ramp?.gray[7])).toBeCloseTo(picked?.chroma ?? 0, 3);
    expect(chromaOf(ramp?.gray[7])).toBeGreaterThan(
      chromaOf(buildPaletteFromColor("#3b8cff", undefined, 0.5)?.gray[7]),
    );
    expect(chromaOf(ramp?.gray[0])).toBeLessThan(chromaOf(ramp?.gray[7]));
  });

  it("scales the tint with the intensity knob", () => {
    const chromaOf = (step: string | undefined) => Number.parseFloat((step ?? "").split(" ")[1] ?? "0");
    const neutral = buildPaletteFromColor("#7f1d1d", undefined, 0);
    const picked = buildPaletteFromColor("#7f1d1d");
    const boosted = buildPaletteFromColor("#7f1d1d", undefined, 1);
    expect(chromaOf(neutral?.gray[7])).toBe(0);
    expect(chromaOf(neutral?.background)).toBe(0);
    expect(chromaOf(picked?.gray[7])).toBeGreaterThan(0);
    expect(chromaOf(boosted?.gray[7])).toBeCloseTo(chromaOf(picked?.gray[7]) * 2, 3);
    // A muted pick stays less tinted than a vivid one at the same intensity.
    expect(chromaOf(buildPaletteFromColor("#111111", undefined, 1)?.gray[7])).toBeLessThan(chromaOf(boosted?.gray[7]));
  });

  it("darkens the ramp with the darkness knob but keeps step 12 readable", () => {
    const lightnessOf = (step: string | undefined) =>
      Number.parseFloat(((step ?? "").split(" ")[0] ?? "oklch(0").replace("oklch(", ""));
    const light = buildPaletteFromColor("#7f1d1d", 0);
    const dark = buildPaletteFromColor("#7f1d1d", 1);
    expect(lightnessOf(dark?.gray[0])).toBeLessThan(lightnessOf(light?.gray[0]));
    expect(lightnessOf(dark?.background)).toBeLessThan(lightnessOf(light?.background));
    expect(lightnessOf(dark?.gray[11])).toBeCloseTo(lightnessOf(light?.gray[11]), 5);
  });

  it("applies the ramp, then resets cleanly", () => {
    applyPalettePreview("#0c1427");
    const root = document.documentElement;
    expect(root.dataset.palettePreview).toBe("#0c1427");
    expect(root.style.getPropertyValue("--ark-gray-2")).toMatch(/^oklch\(/);
    expect(root.style.getPropertyValue("--ark-background")).toMatch(/^oklch\(/);

    applyPalettePreview(null);
    expect(root.dataset.palettePreview).toBeUndefined();
    expect(root.style.getPropertyValue("--ark-gray-2")).toBe("");
    expect(root.style.getPropertyValue("--ark-background")).toBe("");
  });

  it("ignores an unusable stored colour", () => {
    window.localStorage.setItem("yark.appearance.palettePreviewColor.v1", "not-a-color");
    expect(readStoredPaletteColor()).toBeNull();
    writeStoredPaletteColor("#123456");
    expect(readStoredPaletteColor()).toBe("#123456");
    writeStoredPaletteColor(null);
    expect(readStoredPaletteColor()).toBeNull();
  });

  it("takes the plates from an explicit plate colour", () => {
    const hueOf = (value: string): number | null => {
      const match = /oklch\([\d.]+ [\d.]+ ([\d.]+)\)/.exec(value);
      return match === null ? null : Number(match[1]);
    };
    const pick = hexToOklch("#6f8a6a");
    expect(pick).not.toBeNull();
    const moss = surfaceLiftBases(null, 0.65, 0.55, 0, "#6f8a6a").panel;
    expect(hueOf(moss)).toBe(Math.round(pick?.hue ?? -1));
    /* Warmth rotates a surface pick; an explicit plate colour is already the answer. */
    expect(surfaceLiftBases(null, 0.65, 0.55, 1, "#6f8a6a").panel).toBe(moss);
    /* Intensity dilutes a surface pick; it must not dilute a picked plate colour. */
    expect(surfaceLiftBases(null, 0.65, 0.1, 0, "#6f8a6a").panel).toBe(moss);
  });

  it("switches the shell brand art motif", () => {
    applyShellArt("drop");
    expect(document.documentElement.dataset.shellArt).toBe("drop");
    applyShellArt("off");
    expect(document.documentElement.dataset.shellArt).toBe("off");
    expect(readStoredShellArt()).toBe("grain");
    writeStoredShellArt("tek");
    expect(readStoredShellArt()).toBe("tek");
    window.localStorage.setItem("yark.appearance.palettePreviewShellArt.v1", "not-a-motif");
    expect(readStoredShellArt()).toBe("grain");
    applyShellArt("grain");
  });
});
