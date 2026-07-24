import { describe, expect, it } from "vitest";
import {
  applyBreedingPreset,
  applyDifficultyLevel,
  applyExperienceProfile,
  applyProgressionPreset,
  applyWizardDraftToIni,
  configurationWizardSchema,
  draftFromIniPayload,
  wizardChanges,
} from "../../src/renderer/src/features/server-workspace/configurationWizardModel";

const payload = {
  gameUserSettings: [
    "[ServerSettings]",
    "serverPVE=False",
    "ServerHardcore=False",
    "XPMultiplier=1.0",
    "HarvestAmountMultiplier=1.0",
    "TamingSpeedMultiplier=1.0",
    "OverrideOfficialDifficulty=5.0",
    "ShowMapPlayerLocation=True",
    "CustomSettingThatMustSurvive=abc",
    "",
  ].join("\n"),
  game: [
    "[/Script/ShooterGame.ShooterGameMode]",
    "EggHatchSpeedMultiplier=1.0",
    "BabyMatureSpeedMultiplier=1.0",
    "MatingIntervalMultiplier=1.0",
    "BabyCuddleIntervalMultiplier=1.0",
    "AnotherCustomSetting=42",
    "",
  ].join("\n"),
};

describe("configuration wizard model", () => {
  it("reads current values without requiring exact section casing", () => {
    const draft = draftFromIniPayload(payload);

    expect(draft.pve).toBe(false);
    expect(draft.tamingRate).toBe(1);
    expect(draft.maxWildDinoLevel).toBe(150);
    expect(draft.maturationRate).toBe(1);
    expect(draft.singlePlayerSettings).toBe(false);
    expect(draft.difficultyOffset).toBe(1);
    expect(draft.overrideOfficialDifficulty).toBe(5);
  });

  it("applies a profile only to the draft", () => {
    const initial = draftFromIniPayload(payload);
    const next = applyExperienceProfile(initial, "friends");

    expect(next.profile).toBe("friends");
    expect(next.pve).toBe(true);
    expect(next.tamingRate).toBe(3);
    expect(payload.gameUserSettings).toContain("TamingSpeedMultiplier=1.0");
  });

  it("applies semantic progression presets as a coordinated group", () => {
    const initial = draftFromIniPayload(payload);
    const next = applyProgressionPreset(initial, "fast");

    expect(next.xpRate).toBe(2);
    expect(next.harvestRate).toBe(3);
    expect(next.tamingRate).toBe(5);
    expect(next.eggHatchRate).toBe(initial.eggHatchRate);
  });

  it("coordinates breeding speed and its inverse wait intervals", () => {
    const initial = draftFromIniPayload(payload);
    const next = applyBreedingPreset(initial, "veryFast");

    expect(next.eggHatchRate).toBe(20);
    expect(next.maturationRate).toBe(20);
    expect(next.matingIntervalMultiplier).toBe(0.1);
    expect(next.cuddleIntervalMultiplier).toBe(0.1);
    expect(next.tamingRate).toBe(initial.tamingRate);
  });

  it("normalizes difficulty only after an explicit level choice", () => {
    const initial = draftFromIniPayload({
      ...payload,
      gameUserSettings: payload.gameUserSettings
        .replace("OverrideOfficialDifficulty=5.0", "OverrideOfficialDifficulty=0.0")
        .concat("DifficultyOffset=0.2\n"),
    });
    const next = applyDifficultyLevel(initial, 180);
    const changes = wizardChanges(initial, next);

    expect(next.difficultyOffset).toBe(1);
    expect(next.overrideOfficialDifficulty).toBe(6);
    expect(
      changes.filter((change) => change.label === "Dificultad del mundo"),
    ).toHaveLength(1);
    expect(changes.find((change) => change.label === "Dificultad del mundo")?.after)
      .toBe("Nivel 180 · dificultad 6");
  });

  it("keeps custom difficulty stable across read-write-read cycles", () => {
    const initial = draftFromIniPayload(payload);
    const custom = applyDifficultyLevel(initial, 185);

    expect(custom.overrideOfficialDifficulty).toBe(6.1667);

    const firstWrite = applyWizardDraftToIni(payload, custom);
    expect(firstWrite.gameUserSettings).toContain("OverrideOfficialDifficulty=6.1667");

    const reloaded = draftFromIniPayload(firstWrite);
    expect(reloaded.overrideOfficialDifficulty).toBe(custom.overrideOfficialDifficulty);

    const secondWrite = applyWizardDraftToIni(firstWrite, custom);
    expect(secondWrite.gameUserSettings).toBe(firstWrite.gameUserSettings);
    expect(secondWrite.game).toBe(firstWrite.game);
  });

  it("preserves raw difficulty values when another setting changes", () => {
    const customPayload = {
      ...payload,
      gameUserSettings: payload.gameUserSettings
        .replace("OverrideOfficialDifficulty=5.0", "OverrideOfficialDifficulty=0.0")
        .concat("DifficultyOffset=0.35\n"),
    };
    const initial = draftFromIniPayload(customPayload);
    const next = applyWizardDraftToIni(customPayload, {
      ...initial,
      crosshair: !initial.crosshair,
    });

    expect(next.gameUserSettings).toContain("DifficultyOffset=0.35");
    expect(next.gameUserSettings).toContain("OverrideOfficialDifficulty=0.0");
  });

  it("keeps INI text untouched when there are no semantic draft changes", () => {
    const initial = draftFromIniPayload(payload);
    const next = applyWizardDraftToIni(payload, initial);

    expect(next.gameUserSettings).toBe(payload.gameUserSettings);
    expect(next.game).toBe(payload.game);
  });

  it("accepts an existing non-preset difficulty without forcing normalization", () => {
    const initial = draftFromIniPayload({
      ...payload,
      gameUserSettings: payload.gameUserSettings.replace(
        "OverrideOfficialDifficulty=5.0",
        "OverrideOfficialDifficulty=5.5",
      ),
    });

    expect(initial.maxWildDinoLevel).toBe(165);
    expect(configurationWizardSchema.safeParse(initial).success).toBe(true);
  });

  it("rejects fractional structure pickup seconds", () => {
    const initial = draftFromIniPayload(payload);
    const parsed = configurationWizardSchema.safeParse({
      ...initial,
      structurePickupSeconds: 12.5,
    });

    expect(parsed.success).toBe(false);
  });

  it("writes single-player settings explicitly without profiles changing it", () => {
    const initial = { ...draftFromIniPayload(payload), singlePlayerSettings: true };
    const profiled = applyExperienceProfile(initial, "friends");
    const next = applyWizardDraftToIni(payload, profiled);

    expect(profiled.singlePlayerSettings).toBe(true);
    expect(next.game).toContain("bUseSingleplayerSettings=True");
  });

  it("updates curated settings while preserving unknown content and section casing", () => {
    const draft = applyExperienceProfile(draftFromIniPayload(payload), "friends");
    const next = applyWizardDraftToIni(payload, draft);

    expect(next.gameUserSettings).toContain("TamingSpeedMultiplier=3");
    expect(next.gameUserSettings).toContain("CustomSettingThatMustSurvive=abc");
    expect(next.game).toContain("BabyMatureSpeedMultiplier=5");
    expect(next.game).toContain("AnotherCustomSetting=42");
    expect(next.game.match(/\[\/Script\/ShooterGame\.ShooterGameMode\]/g)).toHaveLength(1);
  });

  it("updates the effective last duplicate occurrence for curated keys", () => {
    const duplicatePayload = {
      ...payload,
      gameUserSettings: [
        "[ServerSettings]",
        "TamingSpeedMultiplier=1.0",
        "TamingSpeedMultiplier=2.0",
        "XPMultiplier=1.0",
        "",
      ].join("\n"),
    };

    const initial = draftFromIniPayload(duplicatePayload);
    expect(initial.tamingRate).toBe(2);

    const next = applyWizardDraftToIni(duplicatePayload, {
      ...initial,
      tamingRate: 3,
    });
    const tamingEntries =
      next.gameUserSettings.match(/TamingSpeedMultiplier=[^\n]+/g) ?? [];

    expect(tamingEntries).toEqual([
      "TamingSpeedMultiplier=1.0",
      "TamingSpeedMultiplier=3",
    ]);
  });

  it("builds a human-readable summary without treating profile selection as an INI change", () => {
    const initial = draftFromIniPayload(payload);
    const next = applyExperienceProfile(initial, "communityPve");
    const changes = wizardChanges(initial, next);

    expect(changes.some((change) => change.field === "profile")).toBe(false);
    expect(changes.some((change) => change.label === "Domesticación")).toBe(true);
    expect(changes.some((change) => change.label === "Modo de juego")).toBe(true);
  });
});
