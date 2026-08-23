import type {
  BreedingPresetId,
  ConfigurationWizardDraft,
  ExperienceProfileId,
  ProgressionPresetId,
  WorldPresetId,
} from "./configurationWizardTypes";

export interface ExperienceProfile {
  id: Exclude<ExperienceProfileId, "current" | "cluster">;
  name: string;
  description: string;
  /** Short outcome chips for profile cards (operator scan). */
  chips: readonly string[];
  progressionPreset: ProgressionPresetId;
  breedingPreset: BreedingPresetId;
  worldPreset: WorldPresetId;
  values: Omit<ConfigurationWizardDraft, "profile" | "singlePlayerSettings">;
}

export interface WizardPreset<TId extends string> {
  id: TId;
  name: string;
  description: string;
  /** Matches WildCard / official dedicated baselines. */
  official?: boolean;
}

export const PROGRESSION_PRESETS: readonly (WizardPreset<ProgressionPresetId> & {
  values: Pick<
    ConfigurationWizardDraft,
    "xpRate" | "harvestRate" | "tamingRate" | "resourcesRespawnPeriodMultiplier"
  >;
})[] = [
  {
    id: "base",
    name: "Base",
    description: "Relaxed progression close to base multipliers.",
    official: true,
    values: {
      xpRate: 1,
      harvestRate: 1,
      tamingRate: 1,
      resourcesRespawnPeriodMultiplier: 1,
    },
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Less waiting without losing the sense of progression.",
    values: {
      xpRate: 2,
      harvestRate: 2,
      tamingRate: 3,
      // Lower = nodes come back sooner.
      resourcesRespawnPeriodMultiplier: 0.5,
    },
  },
  {
    id: "fast",
    name: "Fast",
    description: "Built for communities that play several times a week.",
    values: {
      xpRate: 2,
      harvestRate: 3,
      tamingRate: 5,
      resourcesRespawnPeriodMultiplier: 0.35,
    },
  },
  {
    id: "veryFast",
    name: "Very fast",
    description: "Accelerated progress for short sessions or competitive recovery.",
    values: {
      xpRate: 5,
      harvestRate: 5,
      tamingRate: 10,
      resourcesRespawnPeriodMultiplier: 0.2,
    },
  },
];

/**
 * Breeding + imprint tuning.
 *
 * ARK imprint windows ≈ matureTime / (8h × BabyCuddleIntervalMultiplier).
 * % per cuddle ≈ (100 / floor(windows)) × BabyImprintAmountMultiplier (capped at 100%).
 * Keep cuddleInterval ≈ 1 / maturation so window count stays near official; imprint
 * amount slightly above 1 forgives a miss without making each cuddle one-shot OP.
 * @see https://ark.wiki.gg/wiki/Breeding
 * @see https://help.usebeacon.app/configs/ark/breeding_multipliers/
 */
export const BREEDING_PRESETS: readonly (WizardPreset<BreedingPresetId> & {
  values: Pick<
    ConfigurationWizardDraft,
    | "eggHatchRate"
    | "maturationRate"
    | "matingIntervalMultiplier"
    | "cuddleIntervalMultiplier"
    | "matingSpeedMultiplier"
    | "babyImprintAmountMultiplier"
    | "babyCuddleGracePeriodMultiplier"
  >;
})[] = [
  {
    id: "base",
    name: "Slow",
    description: "Slow breeding with base multipliers and official-style imprint windows.",
    official: true,
    values: {
      eggHatchRate: 1,
      maturationRate: 1,
      matingIntervalMultiplier: 1,
      cuddleIntervalMultiplier: 1,
      matingSpeedMultiplier: 1,
      babyImprintAmountMultiplier: 1,
      babyCuddleGracePeriodMultiplier: 1,
    },
  },
  {
    id: "balanced",
    name: "Medium",
    description: "Faster growth with imprint windows scaled so 100% stays reachable.",
    values: {
      eggHatchRate: 5,
      maturationRate: 5,
      matingIntervalMultiplier: 0.5,
      cuddleIntervalMultiplier: 0.2,
      matingSpeedMultiplier: 5,
      // Slight forgiveness vs official %/cuddle — not enough for one-shot imprint.
      babyImprintAmountMultiplier: 1.6,
      babyCuddleGracePeriodMultiplier: 1.5,
    },
  },
  {
    id: "fast",
    name: "Fast",
    description: "Active communities: short waits without collapsing imprint into one cuddle.",
    values: {
      eggHatchRate: 10,
      maturationRate: 10,
      matingIntervalMultiplier: 0.25,
      cuddleIntervalMultiplier: 0.1,
      matingSpeedMultiplier: 10,
      babyImprintAmountMultiplier: 2,
      babyCuddleGracePeriodMultiplier: 2,
    },
  },
  {
    id: "veryFast",
    name: "Very fast",
    description: "Short cycles for testing or recovery; imprint still aims for full affinity.",
    values: {
      eggHatchRate: 20,
      maturationRate: 20,
      matingIntervalMultiplier: 0.1,
      cuddleIntervalMultiplier: 0.05,
      matingSpeedMultiplier: 20,
      babyImprintAmountMultiplier: 2,
      babyCuddleGracePeriodMultiplier: 2.5,
    },
  },
];

type WorldPresetValues = Pick<
  ConfigurationWizardDraft,
  | "dinoCountMultiplier"
  | "harvestHealthMultiplier"
  | "dayCycleSpeedScale"
  | "nightTimeSpeedScale"
  | "playerCharacterFoodDrainMultiplier"
  | "playerCharacterWaterDrainMultiplier"
  | "structureResistanceMultiplier"
>;

export const WORLD_PRESETS: readonly (WizardPreset<WorldPresetId> & {
  values: WorldPresetValues;
})[] = [
  {
    id: "veryEasy",
    name: "Very easy",
    description: "More dinos, softer survival drains, tougher structures, shorter nights.",
    values: {
      dinoCountMultiplier: 1.5,
      harvestHealthMultiplier: 2,
      dayCycleSpeedScale: 1,
      nightTimeSpeedScale: 1.5,
      playerCharacterFoodDrainMultiplier: 0.5,
      playerCharacterWaterDrainMultiplier: 0.5,
      structureResistanceMultiplier: 2,
    },
  },
  {
    id: "easy",
    name: "Easy",
    description: "Gentler survival and denser wild life without removing challenge.",
    values: {
      dinoCountMultiplier: 1.25,
      harvestHealthMultiplier: 1.5,
      dayCycleSpeedScale: 1,
      nightTimeSpeedScale: 1.25,
      playerCharacterFoodDrainMultiplier: 0.7,
      playerCharacterWaterDrainMultiplier: 0.7,
      structureResistanceMultiplier: 1.5,
    },
  },
  {
    id: "medium",
    name: "Base",
    description: "Official-style density, day cycle, and survival pressure.",
    official: true,
    values: {
      dinoCountMultiplier: 1,
      harvestHealthMultiplier: 1,
      dayCycleSpeedScale: 1,
      nightTimeSpeedScale: 1,
      playerCharacterFoodDrainMultiplier: 1,
      playerCharacterWaterDrainMultiplier: 1,
      structureResistanceMultiplier: 1,
    },
  },
  {
    id: "hard",
    name: "Hard",
    description: "Slightly scarcer nodes, longer nights, and survival that stays on you.",
    values: {
      dinoCountMultiplier: 1,
      harvestHealthMultiplier: 0.9,
      dayCycleSpeedScale: 1,
      nightTimeSpeedScale: 0.9,
      playerCharacterFoodDrainMultiplier: 1.35,
      playerCharacterWaterDrainMultiplier: 1.35,
      structureResistanceMultiplier: 0.8,
    },
  },
  {
    id: "veryHard",
    name: "Very hard",
    description: "Fewer dinos, long nights, and drains that punish mistakes.",
    values: {
      dinoCountMultiplier: 0.75,
      harvestHealthMultiplier: 0.75,
      dayCycleSpeedScale: 1,
      nightTimeSpeedScale: 0.7,
      playerCharacterFoodDrainMultiplier: 1.75,
      playerCharacterWaterDrainMultiplier: 1.75,
      structureResistanceMultiplier: 0.6,
    },
  },
];

const BASE_QOL = {
  showMapLocation: true,
  crosshair: true,
  thirdPerson: true,
  flyerCarryPve: true,
  allowCaveBuildingPve: true,
  showFloatingDamageText: true,
  alwaysAllowStructurePickup: true,
  structurePickupSeconds: 120,
};

function progressionValues(presetId: ProgressionPresetId) {
  const preset = PROGRESSION_PRESETS.find((candidate) => candidate.id === presetId);
  return preset === undefined ? PROGRESSION_PRESETS[0]!.values : preset.values;
}

function breedingValues(presetId: BreedingPresetId) {
  const preset = BREEDING_PRESETS.find((candidate) => candidate.id === presetId);
  return preset === undefined ? BREEDING_PRESETS[0]!.values : preset.values;
}

function worldValues(presetId: WorldPresetId): WorldPresetValues {
  const preset = WORLD_PRESETS.find((candidate) => candidate.id === presetId);
  return preset === undefined ? WORLD_PRESETS[0]!.values : preset.values;
}

export const EXPERIENCE_PROFILES: readonly ExperienceProfile[] = [
  {
    id: "friends",
    name: "Play with friends",
    description:
      "Small PvE group: quicker tames and breeding so you spend more time playing than waiting.",
    chips: ["PvE", "Fast taming", "Small group"],
    progressionPreset: "balanced",
    breedingPreset: "balanced",
    worldPreset: "veryEasy",
    values: {
      pve: true,
      hardcore: false,
      maxWildDinoLevel: 150,
      difficultyOffset: 1,
      overrideOfficialDifficulty: 5,
      ...progressionValues("balanced"),
      ...breedingValues("balanced"),
      ...worldValues("veryEasy"),
      ...BASE_QOL,
    },
  },
  {
    id: "communityPve",
    name: "PvE community",
    description:
      "Long-running PvE. A bit faster than official so regulars keep progressing without a slog.",
    chips: ["PvE", "Balanced", "Community"],
    progressionPreset: "fast",
    breedingPreset: "fast",
    worldPreset: "medium",
    values: {
      pve: true,
      hardcore: false,
      maxWildDinoLevel: 150,
      difficultyOffset: 1,
      overrideOfficialDifficulty: 5,
      ...progressionValues("fast"),
      ...breedingValues("fast"),
      ...worldValues("medium"),
      ...BASE_QOL,
    },
  },
  {
    id: "communityPvp",
    name: "PvP community",
    description: "PvP where people can rebuild after a wipe without a week of grinding.",
    chips: ["PvP", "Fast recover"],
    progressionPreset: "veryFast",
    breedingPreset: "fast",
    worldPreset: "hard",
    values: {
      pve: false,
      hardcore: false,
      maxWildDinoLevel: 150,
      difficultyOffset: 1,
      overrideOfficialDifficulty: 5,
      ...progressionValues("veryFast"),
      ...breedingValues("fast"),
      ...worldValues("hard"),
      showMapLocation: false,
      crosshair: true,
      thirdPerson: true,
      flyerCarryPve: false,
      allowCaveBuildingPve: false,
      showFloatingDamageText: true,
      alwaysAllowStructurePickup: false,
      structurePickupSeconds: 30,
    },
  },
  {
    id: "hardcore",
    name: "Hardcore",
    description:
      "Death sends you back to level 1. Rates stay near official so every life counts.",
    chips: ["Hardcore", "Near official"],
    progressionPreset: "base",
    breedingPreset: "base",
    worldPreset: "medium",
    values: {
      pve: false,
      hardcore: true,
      maxWildDinoLevel: 150,
      difficultyOffset: 1,
      overrideOfficialDifficulty: 5,
      ...progressionValues("base"),
      ...breedingValues("base"),
      ...worldValues("medium"),
      showMapLocation: false,
      crosshair: false,
      thirdPerson: false,
      flyerCarryPve: false,
      allowCaveBuildingPve: false,
      showFloatingDamageText: false,
      alwaysAllowStructurePickup: false,
      structurePickupSeconds: 30,
    },
  },
];

export function applyExperienceProfile(
  current: ConfigurationWizardDraft,
  profileId: ExperienceProfile["id"],
): ConfigurationWizardDraft {
  const profile = EXPERIENCE_PROFILES.find((candidate) => candidate.id === profileId);
  return profile === undefined
    ? current
    : { ...current, ...profile.values, profile: profile.id };
}

export function applyProgressionPreset(
  current: ConfigurationWizardDraft,
  presetId: ProgressionPresetId,
): ConfigurationWizardDraft {
  const preset = PROGRESSION_PRESETS.find((candidate) => candidate.id === presetId);
  return preset === undefined ? current : { ...current, ...preset.values };
}

export function applyBreedingPreset(
  current: ConfigurationWizardDraft,
  presetId: BreedingPresetId,
): ConfigurationWizardDraft {
  const preset = BREEDING_PRESETS.find((candidate) => candidate.id === presetId);
  return preset === undefined ? current : { ...current, ...preset.values };
}

export function applyWorldPreset(
  current: ConfigurationWizardDraft,
  presetId: WorldPresetId,
): ConfigurationWizardDraft {
  const preset = WORLD_PRESETS.find((candidate) => candidate.id === presetId);
  return preset === undefined ? current : { ...current, ...preset.values };
}
