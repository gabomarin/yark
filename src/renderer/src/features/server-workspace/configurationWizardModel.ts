import { parseIniTextRows, setIniTextValue } from "@shared/ini-text";
import type { IniFileKey, ServerIniPayload } from "@shared/types";
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
export type WorldPresetId = "base" | "gentle" | "balanced" | "harsh";

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
  maxPlayers: number;
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
  maxPlayers: z.number().int().min(1).max(200),
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
  structurePickupSeconds: z.number().int().nonnegative().max(3600),
});

interface WizardSetting {
  field: Exclude<keyof ConfigurationWizardDraft, "profile" | "maxWildDinoLevel">;
  fileKey: IniFileKey;
  section: string;
  key: string;
  fallback: boolean | number;
}

const GAME_MODE_SECTION = "/script/shootergame.shootergamemode";

const DEFAULT_WIZARD_VALUES: Omit<
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
  maxPlayers: 70,
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
  structurePickupSeconds: 30,
};

const SETTINGS: readonly WizardSetting[] = [
  {
    field: "singlePlayerSettings",
    fileKey: "game",
    section: GAME_MODE_SECTION,
    key: "bUseSingleplayerSettings",
    fallback: false,
  },
  {
    field: "pve",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "serverPVE",
    fallback: false,
  },
  {
    field: "hardcore",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "ServerHardcore",
    fallback: false,
  },
  {
    field: "xpRate",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "XPMultiplier",
    fallback: 1,
  },
  {
    field: "harvestRate",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "HarvestAmountMultiplier",
    fallback: 1,
  },
  {
    field: "tamingRate",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "TamingSpeedMultiplier",
    fallback: 1,
  },
  {
    field: "difficultyOffset",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "DifficultyOffset",
    fallback: 1,
  },
  {
    field: "overrideOfficialDifficulty",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "OverrideOfficialDifficulty",
    fallback: 0,
  },
  {
    field: "eggHatchRate",
    fileKey: "game",
    section: GAME_MODE_SECTION,
    key: "EggHatchSpeedMultiplier",
    fallback: 1,
  },
  {
    field: "maturationRate",
    fileKey: "game",
    section: GAME_MODE_SECTION,
    key: "BabyMatureSpeedMultiplier",
    fallback: 1,
  },
  {
    field: "matingIntervalMultiplier",
    fileKey: "game",
    section: GAME_MODE_SECTION,
    key: "MatingIntervalMultiplier",
    fallback: 1,
  },
  {
    field: "cuddleIntervalMultiplier",
    fileKey: "game",
    section: GAME_MODE_SECTION,
    key: "BabyCuddleIntervalMultiplier",
    fallback: 1,
  },
  {
    field: "maxPlayers",
    fileKey: "gameUserSettings",
    section: "/Script/Engine.GameSession",
    key: "MaxPlayers",
    fallback: 70,
  },
  {
    field: "dinoCountMultiplier",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "DinoCountMultiplier",
    fallback: 1,
  },
  {
    field: "harvestHealthMultiplier",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "HarvestHealthMultiplier",
    fallback: 1,
  },
  {
    field: "dayCycleSpeedScale",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "DayCycleSpeedScale",
    fallback: 1,
  },
  {
    field: "nightTimeSpeedScale",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "NightTimeSpeedScale",
    fallback: 1,
  },
  {
    field: "playerCharacterFoodDrainMultiplier",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "PlayerCharacterFoodDrainMultiplier",
    fallback: 1,
  },
  {
    field: "playerCharacterWaterDrainMultiplier",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "PlayerCharacterWaterDrainMultiplier",
    fallback: 1,
  },
  {
    field: "structureResistanceMultiplier",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "StructureResistanceMultiplier",
    fallback: 1,
  },
  {
    field: "showMapLocation",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "ShowMapPlayerLocation",
    fallback: true,
  },
  {
    field: "crosshair",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "ServerCrosshair",
    fallback: true,
  },
  {
    field: "thirdPerson",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "AllowThirdPersonPlayer",
    fallback: true,
  },
  {
    field: "flyerCarryPve",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "AllowFlyerCarryPvE",
    fallback: false,
  },
  {
    field: "structurePickupSeconds",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "StructurePickupTimeAfterPlacement",
    fallback: 30,
  },
];

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
}

export const PROGRESSION_PRESETS: readonly (WizardPreset<ProgressionPresetId> & {
  values: Pick<ConfigurationWizardDraft, "xpRate" | "harvestRate" | "tamingRate">;
})[] = [
  {
    id: "base",
    name: "Base",
    description: "Relaxed progression close to base multipliers.",
    values: { xpRate: 1, harvestRate: 1, tamingRate: 1 },
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Less waiting without losing the sense of progression.",
    values: { xpRate: 2, harvestRate: 2, tamingRate: 3 },
  },
  {
    id: "fast",
    name: "Fast",
    description: "Built for communities that play several times a week.",
    values: { xpRate: 2, harvestRate: 3, tamingRate: 5 },
  },
  {
    id: "veryFast",
    name: "Very fast",
    description: "Accelerated progress for short sessions or competitive recovery.",
    values: { xpRate: 5, harvestRate: 5, tamingRate: 10 },
  },
];

export const BREEDING_PRESETS: readonly (WizardPreset<BreedingPresetId> & {
  values: Pick<
    ConfigurationWizardDraft,
    | "eggHatchRate"
    | "maturationRate"
    | "matingIntervalMultiplier"
    | "cuddleIntervalMultiplier"
  >;
})[] = [
  {
    id: "base",
    name: "Slow",
    description: "Slow breeding with base multipliers.",
    values: {
      eggHatchRate: 1,
      maturationRate: 1,
      matingIntervalMultiplier: 1,
      cuddleIntervalMultiplier: 1,
    },
  },
  {
    id: "balanced",
    name: "Medium",
    description: "Shorter waits while keeping each breed meaningful.",
    values: {
      eggHatchRate: 5,
      maturationRate: 5,
      matingIntervalMultiplier: 0.5,
      cuddleIntervalMultiplier: 0.5,
    },
  },
  {
    id: "fast",
    name: "Fast",
    description: "Suitable for active communities and frequent sessions.",
    values: {
      eggHatchRate: 10,
      maturationRate: 10,
      matingIntervalMultiplier: 0.25,
      cuddleIntervalMultiplier: 0.25,
    },
  },
  {
    id: "veryFast",
    name: "Very fast",
    description: "Short cycles for testing lines or recovering creatures.",
    values: {
      eggHatchRate: 20,
      maturationRate: 20,
      matingIntervalMultiplier: 0.1,
      cuddleIntervalMultiplier: 0.1,
    },
  },
];

type WorldPresetValues = Pick<
  ConfigurationWizardDraft,
  | "maxPlayers"
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
    id: "base",
    name: "Base",
    description: "Capacity and survival close to the official experience.",
    values: {
      maxPlayers: 70,
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
    id: "gentle",
    name: "Gentle",
    description: "Less pressure, shorter nights, and tougher structures.",
    values: {
      maxPlayers: 40,
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
    id: "balanced",
    name: "Balanced",
    description: "Moderate density and survival for persistent communities.",
    values: {
      maxPlayers: 70,
      dinoCountMultiplier: 1.1,
      harvestHealthMultiplier: 1.25,
      dayCycleSpeedScale: 1,
      nightTimeSpeedScale: 1.15,
      playerCharacterFoodDrainMultiplier: 0.85,
      playerCharacterWaterDrainMultiplier: 0.85,
      structureResistanceMultiplier: 1.25,
    },
  },
  {
    id: "harsh",
    name: "Harsh",
    description: "Higher capacity, normal hunger/thirst, and more vulnerable structures.",
    values: {
      maxPlayers: 100,
      dinoCountMultiplier: 1,
      harvestHealthMultiplier: 1,
      dayCycleSpeedScale: 1,
      nightTimeSpeedScale: 1,
      playerCharacterFoodDrainMultiplier: 1,
      playerCharacterWaterDrainMultiplier: 1,
      structureResistanceMultiplier: 0.85,
    },
  },
];

const BASE_QOL = {
  showMapLocation: true,
  crosshair: true,
  thirdPerson: true,
  flyerCarryPve: true,
  structurePickupSeconds: 120,
};

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
    chips: ["PvE", "Brisk tame", "Small group"],
    progressionPreset: "balanced",
    breedingPreset: "balanced",
    worldPreset: "gentle",
    values: {
      pve: true,
      hardcore: false,
      xpRate: 2,
      harvestRate: 2,
      tamingRate: 3,
      maxWildDinoLevel: 150,
      difficultyOffset: 1,
      overrideOfficialDifficulty: 5,
      eggHatchRate: 5,
      maturationRate: 5,
      matingIntervalMultiplier: 0.5,
      cuddleIntervalMultiplier: 0.5,
      ...worldValues("gentle"),
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
    worldPreset: "balanced",
    values: {
      pve: true,
      hardcore: false,
      xpRate: 2,
      harvestRate: 3,
      tamingRate: 5,
      maxWildDinoLevel: 150,
      difficultyOffset: 1,
      overrideOfficialDifficulty: 5,
      eggHatchRate: 10,
      maturationRate: 10,
      matingIntervalMultiplier: 0.25,
      cuddleIntervalMultiplier: 0.25,
      ...worldValues("balanced"),
      ...BASE_QOL,
    },
  },
  {
    id: "communityPvp",
    name: "PvP community",
    description:
      "PvP where people can rebuild after a wipe without a week of grinding.",
    chips: ["PvP", "Fast recover"],
    progressionPreset: "veryFast",
    breedingPreset: "fast",
    worldPreset: "harsh",
    values: {
      pve: false,
      hardcore: false,
      xpRate: 5,
      harvestRate: 5,
      tamingRate: 10,
      maxWildDinoLevel: 150,
      difficultyOffset: 1,
      overrideOfficialDifficulty: 5,
      eggHatchRate: 10,
      maturationRate: 10,
      matingIntervalMultiplier: 0.25,
      cuddleIntervalMultiplier: 0.25,
      ...worldValues("harsh"),
      showMapLocation: false,
      crosshair: true,
      thirdPerson: true,
      flyerCarryPve: false,
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
    worldPreset: "base",
    values: {
      pve: false,
      hardcore: true,
      xpRate: 1,
      harvestRate: 1,
      tamingRate: 1,
      maxWildDinoLevel: 150,
      difficultyOffset: 1,
      overrideOfficialDifficulty: 5,
      eggHatchRate: 1,
      maturationRate: 1,
      matingIntervalMultiplier: 1,
      cuddleIntervalMultiplier: 1,
      ...worldValues("base"),
      showMapLocation: false,
      crosshair: false,
      thirdPerson: false,
      flyerCarryPve: false,
      structurePickupSeconds: 30,
    },
  },
];

export interface WizardChange {
  field: keyof ConfigurationWizardDraft;
  label: string;
  before: string;
  after: string;
}

const FIELD_LABELS: Record<keyof ConfigurationWizardDraft, string> = {
  profile: "Profile",
  singlePlayerSettings: "Single-player style settings",
  pve: "Game mode",
  hardcore: "Hardcore",
  xpRate: "Experience",
  harvestRate: "Harvesting",
  tamingRate: "Taming",
  maxWildDinoLevel: "Max wild level",
  difficultyOffset: "DifficultyOffset",
  overrideOfficialDifficulty: "OverrideOfficialDifficulty",
  eggHatchRate: "Hatching",
  maturationRate: "Maturation",
  matingIntervalMultiplier: "Mating interval",
  cuddleIntervalMultiplier: "Cuddle interval",
  maxPlayers: "Max players",
  dinoCountMultiplier: "Dinosaur density",
  harvestHealthMultiplier: "Harvest node health",
  dayCycleSpeedScale: "Day cycle speed",
  nightTimeSpeedScale: "Night speed",
  playerCharacterFoodDrainMultiplier: "Food drain",
  playerCharacterWaterDrainMultiplier: "Water drain",
  structureResistanceMultiplier: "Structure resistance",
  showMapLocation: "Map location",
  crosshair: "Crosshair",
  thirdPerson: "Third person",
  flyerCarryPve: "Flyer carry in PvE",
  structurePickupSeconds: "Structure pickup window",
};

export function draftFromIniPayload(payload: ServerIniPayload): ConfigurationWizardDraft {
  const draft: ConfigurationWizardDraft = {
    profile: "current",
    maxWildDinoLevel: resolveMaxWildDinoLevel(payload),
    ...DEFAULT_WIZARD_VALUES,
  };
  const indexesByFile: Record<IniFileKey, IniValueIndex> = {
    game: buildIniValueIndex(payload.game),
    gameUserSettings: buildIniValueIndex(payload.gameUserSettings),
  };

  for (const setting of SETTINGS) {
    const raw = findIniValueFromIndex(
      indexesByFile[setting.fileKey],
      setting.section,
      setting.key,
    );
    if (typeof setting.fallback === "boolean") {
      draft[setting.field] =
        (raw === null ? setting.fallback : raw.toLowerCase() === "true") as never;
    } else {
      const parsed = raw === null ? Number.NaN : Number(raw);
      draft[setting.field] = (
        Number.isFinite(parsed) ? parsed : setting.fallback
      ) as never;
    }
  }

  return draft;
}

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

export function applyDifficultyLevel(
  current: ConfigurationWizardDraft,
  maxWildDinoLevel: number,
): ConfigurationWizardDraft {
  return {
    ...current,
    maxWildDinoLevel,
    difficultyOffset: 1,
    overrideOfficialDifficulty: normalizeForIniPrecision(maxWildDinoLevel / 30),
  };
}

export function applyWizardDraftToIni(
  payload: ServerIniPayload,
  draft: ConfigurationWizardDraft,
): ServerIniPayload {
  let next = payload;
  for (const setting of SETTINGS) {
    const value = draft[setting.field];
    const currentMatch = findLastIniValueMatch(
      textForFile(next, setting.fileKey),
      setting.section,
      setting.key,
    );
    const currentRaw = currentMatch?.value ?? null;
    if (!hasSemanticDifference(setting, currentRaw, value)) {
      continue;
    }

    next = updateFile(
      next,
      setting.fileKey,
      setting.section,
      setting.key,
      typeof value === "boolean" ? (value ? "True" : "False") : formatNumber(value),
      currentMatch?.occurrence ?? 0,
    );
  }

  return next;
}

function hasSemanticDifference(
  setting: WizardSetting,
  raw: string | null,
  value: boolean | number,
): boolean {
  if (typeof setting.fallback === "boolean") {
    const current = raw === null ? setting.fallback : raw.toLowerCase() === "true";
    return current !== value;
  }

  const parsed = raw === null ? Number.NaN : Number(raw);
  const current = Number.isFinite(parsed) ? parsed : setting.fallback;
  return current !== value;
}

export function wizardChanges(
  initial: ConfigurationWizardDraft,
  current: ConfigurationWizardDraft,
): WizardChange[] {
  const changes: WizardChange[] = [];
  for (const field of Object.keys(FIELD_LABELS) as Array<keyof ConfigurationWizardDraft>) {
    if (
      field === "profile"
      || field === "maxWildDinoLevel"
      || field === "difficultyOffset"
      || field === "overrideOfficialDifficulty"
      || initial[field] === current[field]
    ) {
      continue;
    }
    changes.push({
      field,
      label: FIELD_LABELS[field],
      before: formatFieldValue(field, initial[field]),
      after: formatFieldValue(field, current[field]),
    });
  }

  if (
    initial.maxWildDinoLevel !== current.maxWildDinoLevel ||
    initial.difficultyOffset !== current.difficultyOffset ||
    initial.overrideOfficialDifficulty !== current.overrideOfficialDifficulty
  ) {
    changes.push({
      field: "maxWildDinoLevel",
      label: "World difficulty",
      before: formatDifficulty(initial),
      after: formatDifficulty(current),
    });
  }

  return changes;
}

function resolveMaxWildDinoLevel(payload: ServerIniPayload): number {
  const override = Number(
    findIniValue(
      payload.gameUserSettings,
      "ServerSettings",
      "OverrideOfficialDifficulty",
    ),
  );
  return Number.isFinite(override) && override > 0 ? Math.round(override * 30) : 150;
}

type IniValueIndex = Map<string, string>;

function buildIniValueIndex(text: string): IniValueIndex {
  const index: IniValueIndex = new Map();
  for (const row of parseIniTextRows(text)) {
    index.set(indexKey(row.section, row.key), row.value);
  }
  return index;
}

function findIniValueFromIndex(
  index: IniValueIndex,
  section: string,
  key: string,
): string | null {
  return index.get(indexKey(section, key)) ?? null;
}

function indexKey(section: string, key: string): string {
  return `${section.toLowerCase()}\n${key.toLowerCase()}`;
}

function findIniValue(text: string, section: string, key: string): string | null {
  return findLastIniValueMatch(text, section, key)?.value ?? null;
}

interface IniValueMatch {
  value: string;
  occurrence: number;
}

function findLastIniValueMatch(
  text: string,
  section: string,
  key: string,
): IniValueMatch | null {
  const sectionLower = section.toLowerCase();
  const keyLower = key.toLowerCase();
  let occurrence = 0;
  let match: IniValueMatch | null = null;
  for (const row of parseIniTextRows(text)) {
    if (
      row.section.toLowerCase() === sectionLower &&
      row.key.toLowerCase() === keyLower
    ) {
      match = { value: row.value, occurrence };
      occurrence += 1;
    }
  }
  return match;
}

function textForFile(payload: ServerIniPayload, fileKey: IniFileKey): string {
  return fileKey === "game" ? payload.game : payload.gameUserSettings;
}

function updateFile(
  payload: ServerIniPayload,
  fileKey: IniFileKey,
  section: string,
  key: string,
  value: string,
  occurrence = 0,
): ServerIniPayload {
  const nextText = setIniTextValue(
    textForFile(payload, fileKey),
    section,
    key,
    value,
    occurrence,
  );
  return fileKey === "game"
    ? { ...payload, game: nextText }
    : { ...payload, gameUserSettings: nextText };
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function normalizeForIniPrecision(value: number): number {
  return Number(formatNumber(value));
}

function formatDifficulty(draft: ConfigurationWizardDraft): string {
  if (draft.overrideOfficialDifficulty > 0) {
    return `Level ${draft.maxWildDinoLevel} · difficulty ${formatNumber(draft.overrideOfficialDifficulty)}`;
  }
  return `Offset ${formatNumber(draft.difficultyOffset)} · map-dependent`;
}

function formatFieldValue(
  field: keyof ConfigurationWizardDraft,
  value: ConfigurationWizardDraft[keyof ConfigurationWizardDraft],
): string {
  if (field === "pve") return value ? "PvE" : "PvP";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (field === "maxWildDinoLevel") return `Level ${value}`;
  if (field === "maxPlayers") return String(value);
  if (field === "structurePickupSeconds") return `${value} s`;
  if (field === "matingIntervalMultiplier" || field === "cuddleIntervalMultiplier") {
    return `${value}× of base interval`;
  }
  return `${value}×`;
}
