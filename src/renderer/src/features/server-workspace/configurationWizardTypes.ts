import { z } from "zod";

export type ExperienceProfileId =
  | "current"
  | "cluster"
  | "friends"
  | "communityPve"
  | "communityPvp"
  | "hardcore";

export type ProgressionPresetId = "base" | "balanced" | "fast" | "veryFast";
export type BreedingPresetId = "base" | "balanced" | "fast" | "veryFast";
export type WorldPresetId =
  | "veryEasy"
  | "easy"
  | "medium"
  | "hard"
  | "veryHard";

// Additional factors applied by ARK on top of the configured INI values.
// Source: https://ark.wiki.gg/wiki/Single_Player
export const SINGLE_PLAYER_RATE_FACTORS = {
  tamingRate: 2.5,
  eggHatchRate: 9,
  maturationRate: 35,
  matingIntervalMultiplier: 0.15,
  cuddleIntervalMultiplier: 0.17,
} as const;

export interface ConfigurationWizardDraft {
  profile: ExperienceProfileId;
  singlePlayerSettings: boolean;
  pve: boolean;
  hardcore: boolean;
  xpRate: number;
  harvestRate: number;
  tamingRate: number;
  maxWildDinoLevel: number;
  difficultyOffset: number;
  overrideOfficialDifficulty: number;
  eggHatchRate: number;
  maturationRate: number;
  matingIntervalMultiplier: number;
  cuddleIntervalMultiplier: number;
  matingSpeedMultiplier: number;
  babyImprintAmountMultiplier: number;
  babyCuddleGracePeriodMultiplier: number;
  resourcesRespawnPeriodMultiplier: number;
  dinoCountMultiplier: number;
  harvestHealthMultiplier: number;
  dayCycleSpeedScale: number;
  nightTimeSpeedScale: number;
  playerCharacterFoodDrainMultiplier: number;
  playerCharacterWaterDrainMultiplier: number;
  structureResistanceMultiplier: number;
  showMapLocation: boolean;
  crosshair: boolean;
  thirdPerson: boolean;
  flyerCarryPve: boolean;
  allowCaveBuildingPve: boolean;
  showFloatingDamageText: boolean;
  alwaysAllowStructurePickup: boolean;
  structurePickupSeconds: number;
}

export const configurationWizardSchema = z.object({
  profile: z.enum([
    "current",
    "cluster",
    "friends",
    "communityPve",
    "communityPvp",
    "hardcore",
  ]),
  singlePlayerSettings: z.boolean(),
  pve: z.boolean(),
  hardcore: z.boolean(),
  xpRate: z.number().positive().max(100),
  harvestRate: z.number().positive().max(100),
  tamingRate: z.number().positive().max(100),
  maxWildDinoLevel: z
    .number()
    .int()
    .min(30)
    .max(30_000),
  difficultyOffset: z.number().min(0).max(1_000),
  overrideOfficialDifficulty: z.number().min(0).max(1_000),
  eggHatchRate: z.number().positive().max(100),
  maturationRate: z.number().positive().max(100),
  matingIntervalMultiplier: z.number().positive().max(10),
  cuddleIntervalMultiplier: z.number().positive().max(10),
  matingSpeedMultiplier: z.number().positive().max(100),
  babyImprintAmountMultiplier: z.number().positive().max(100),
  babyCuddleGracePeriodMultiplier: z.number().positive().max(100),
  resourcesRespawnPeriodMultiplier: z.number().positive().max(100),
  dinoCountMultiplier: z.number().positive().max(10),
  harvestHealthMultiplier: z.number().positive().max(100),
  dayCycleSpeedScale: z.number().positive().max(100),
  nightTimeSpeedScale: z.number().positive().max(100),
  playerCharacterFoodDrainMultiplier: z.number().positive().max(100),
  playerCharacterWaterDrainMultiplier: z.number().positive().max(100),
  structureResistanceMultiplier: z.number().positive().max(100),
  showMapLocation: z.boolean(),
  crosshair: z.boolean(),
  thirdPerson: z.boolean(),
  flyerCarryPve: z.boolean(),
  allowCaveBuildingPve: z.boolean(),
  showFloatingDamageText: z.boolean(),
  alwaysAllowStructurePickup: z.boolean(),
  structurePickupSeconds: z.number().int().nonnegative().max(3600),
});

export const DEFAULT_WIZARD_VALUES: Omit<
  ConfigurationWizardDraft,
  "profile" | "maxWildDinoLevel"
> = {
  singlePlayerSettings: false,
  pve: false,
  hardcore: false,
  xpRate: 1,
  harvestRate: 1,
  tamingRate: 1,
  difficultyOffset: 1,
  overrideOfficialDifficulty: 0,
  eggHatchRate: 1,
  maturationRate: 1,
  matingIntervalMultiplier: 1,
  cuddleIntervalMultiplier: 1,
  matingSpeedMultiplier: 1,
  babyImprintAmountMultiplier: 1,
  babyCuddleGracePeriodMultiplier: 1,
  resourcesRespawnPeriodMultiplier: 1,
  dinoCountMultiplier: 1,
  harvestHealthMultiplier: 1,
  dayCycleSpeedScale: 1,
  nightTimeSpeedScale: 1,
  playerCharacterFoodDrainMultiplier: 1,
  playerCharacterWaterDrainMultiplier: 1,
  structureResistanceMultiplier: 1,
  showMapLocation: true,
  crosshair: true,
  thirdPerson: true,
  flyerCarryPve: false,
  allowCaveBuildingPve: false,
  showFloatingDamageText: false,
  alwaysAllowStructurePickup: false,
  structurePickupSeconds: 30,
};

export interface WizardChange {
  field: keyof ConfigurationWizardDraft;
  label: string;
  /** Real GameUserSettings / Game.ini key name for operators. */
  iniKey: string;
  before: string;
  after: string;
}

export function formatWizardNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
