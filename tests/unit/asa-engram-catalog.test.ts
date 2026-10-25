import { describe, expect, it } from "vitest";
import { asaEngramCatalog, asaEngramEntries, lookupAsaEngram } from "@shared/asa/asa-engram-catalog";

const CLASS_RE = /^EngramEntry_[A-Za-z0-9_]+_C$/;

/** ASE classes for maps that are not in ASA. They stay out of the picker. */
const OMITTED = [
  "EngramEntry_Saddle_Tropeognathus_C",
  "EngramEntry_Saddle_Amarga_C",
  "EngramEntry_Saddle_Andrewsarchus_C",
  "EngramEntry_SpaceDolphin_Saddle_C",
  "EngramEntry_Canoe_C",
  "EngramEntry_Boulder_Fire_C",
  "EngramEntry_LoadoutMannequin_C",
  "EngramEntry_Milkglider_Saddle_C",
  "EngramEntry_Minigun_C",
  "EngramEntry_NetGun_Ammo_C",
  "EngramEntry_TekBow_C",
  "EngramEntry_TekCanteen_C",
  "EngramEntry_TekCropPlot_C",
  "EngramEntry_TekHoverSail_C",
  "EngramEntry_TekPistol_C",
  "EngramEntry_TekSecuirtyConsole_C",
  "EngramEntry_TekExosuit_C",
] as const;

describe("asa-engram-catalog", () => {
  it("lists official ASA classes once, including the four fills", () => {
    expect(asaEngramCatalog.count).toBe(729);
    expect(asaEngramEntries).toHaveLength(729);
    const classes = asaEngramEntries.map((entry) => entry.className);
    expect(new Set(classes).size).toBe(729);
    for (const entry of asaEngramEntries) {
      expect(entry.className).toMatch(CLASS_RE);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(Number.isInteger(entry.level)).toBe(true);
      expect(Number.isInteger(entry.points)).toBe(true);
    }
    const labels = asaEngramEntries.map((entry) => entry.label);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);

    expect(lookupAsaEngram("engramentry_campfire_c")).toMatchObject({
      label: "Campfire",
      level: 2,
      points: 3,
    });
    expect(lookupAsaEngram("EngramEntry_Saddle_Jackalope_C")).toMatchObject({
      label: "Burrowbuck Saddle",
      level: 33,
      points: 15,
      pack: "ARK: Survival Ascended Engrams",
    });
    expect(lookupAsaEngram("EngramEntry_Saddle_Cerberus_C")).toMatchObject({
      label: "Cerberax Saddle",
      level: 74,
      points: 40,
    });
    expect(lookupAsaEngram("EngramEntry_Saddle_Boaratos_C")).toMatchObject({
      label: "Boaratos Saddle",
      level: 66,
      points: 35,
      pack: "Astraeos Engrams",
    });
    expect(lookupAsaEngram("EngramEntry_TOF_Galleon_C")).toMatchObject({
      label: "Galleon",
      level: 76,
      points: 18,
      pack: "Tides of Fortune Engrams",
    });
    expect(lookupAsaEngram("EngramEntry_NotReal_C")).toBeUndefined();

    for (const className of OMITTED) {
      expect(lookupAsaEngram(className)).toBeUndefined();
    }
  });
});
