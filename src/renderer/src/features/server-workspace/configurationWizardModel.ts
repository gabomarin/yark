import { parseIniTextRows, setIniTextValue } from "@shared/ini-text";
import type { IniFileKey, ServerIniPayload } from "@shared/types";
import { z } from "zod";

export type ExperienceProfileId =
  | "current"
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
  profile: z.enum(["current", "friends", "communityPve", "communityPvp", "hardcore"]),
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
  id: Exclude<ExperienceProfileId, "current">;
  name: string;
  description: string;
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
    description: "Progreso pausado, cercano a los multiplicadores base.",
    values: { xpRate: 1, harvestRate: 1, tamingRate: 1 },
  },
  {
    id: "balanced",
    name: "Equilibrado",
    description: "Menos espera sin eliminar la sensación de progresión.",
    values: { xpRate: 2, harvestRate: 2, tamingRate: 3 },
  },
  {
    id: "fast",
    name: "Rápido",
    description: "Pensado para comunidades que juegan varias veces por semana.",
    values: { xpRate: 2, harvestRate: 3, tamingRate: 5 },
  },
  {
    id: "veryFast",
    name: "Muy rápido",
    description: "Progreso acelerado para sesiones cortas o recuperación competitiva.",
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
    name: "Lenta",
    description: "Crianza pausada con los multiplicadores base.",
    values: {
      eggHatchRate: 1,
      maturationRate: 1,
      matingIntervalMultiplier: 1,
      cuddleIntervalMultiplier: 1,
    },
  },
  {
    id: "balanced",
    name: "Media",
    description: "Reduce las esperas manteniendo valor en cada cría.",
    values: {
      eggHatchRate: 5,
      maturationRate: 5,
      matingIntervalMultiplier: 0.5,
      cuddleIntervalMultiplier: 0.5,
    },
  },
  {
    id: "fast",
    name: "Rápida",
    description: "Adecuada para comunidades activas y sesiones frecuentes.",
    values: {
      eggHatchRate: 10,
      maturationRate: 10,
      matingIntervalMultiplier: 0.25,
      cuddleIntervalMultiplier: 0.25,
    },
  },
  {
    id: "veryFast",
    name: "Muy rápida",
    description: "Ciclos cortos para probar líneas o recuperar criaturas.",
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
    description: "Capacidad y supervivencia cercanas a la experiencia oficial.",
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
    name: "Amable",
    description: "Menos presión, noches más cortas y estructuras más resistentes.",
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
    name: "Equilibrado",
    description: "Densidad y supervivencia moderadas para comunidades persistentes.",
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
    name: "Exigente",
    description: "Más cupo, hambre/sed normales y estructuras más vulnerables.",
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
    name: "Jugar con amigos",
    description: "PvE accesible, progreso ágil y crianza práctica para grupos pequeños.",
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
    name: "Comunidad PvE",
    description: "Progresión equilibrada y menor fricción para comunidades persistentes.",
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
    name: "Comunidad PvP",
    description: "Competencia activa con recuperación más rápida después de una derrota.",
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
    description: "Muerte con reinicio de personaje y un ritmo cercano a la experiencia base.",
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
  profile: "Perfil",
  singlePlayerSettings: "Ajustes para una persona",
  pve: "Modo de juego",
  hardcore: "Hardcore",
  xpRate: "Experiencia",
  harvestRate: "Recolección",
  tamingRate: "Domesticación",
  maxWildDinoLevel: "Nivel máximo salvaje",
  difficultyOffset: "DifficultyOffset",
  overrideOfficialDifficulty: "OverrideOfficialDifficulty",
  eggHatchRate: "Incubación",
  maturationRate: "Maduración",
  matingIntervalMultiplier: "Intervalo de apareamiento",
  cuddleIntervalMultiplier: "Intervalo de cuidados",
  maxPlayers: "Jugadores máximos",
  dinoCountMultiplier: "Densidad de dinosaurios",
  harvestHealthMultiplier: "Salud de nodos de recolección",
  dayCycleSpeedScale: "Velocidad del ciclo diurno",
  nightTimeSpeedScale: "Velocidad de la noche",
  playerCharacterFoodDrainMultiplier: "Consumo de comida",
  playerCharacterWaterDrainMultiplier: "Consumo de agua",
  structureResistanceMultiplier: "Resistencia de estructuras",
  showMapLocation: "Posición en el mapa",
  crosshair: "Mira",
  thirdPerson: "Tercera persona",
  flyerCarryPve: "Transporte con voladores en PvE",
  structurePickupSeconds: "Ventana para recoger estructuras",
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
  const changes = (Object.keys(FIELD_LABELS) as Array<keyof ConfigurationWizardDraft>)
    .filter(
      (field) =>
        field !== "profile" &&
        field !== "maxWildDinoLevel" &&
        field !== "difficultyOffset" &&
        field !== "overrideOfficialDifficulty" &&
        initial[field] !== current[field],
    )
    .map((field) => ({
      field,
      label: FIELD_LABELS[field],
      before: formatFieldValue(field, initial[field]),
      after: formatFieldValue(field, current[field]),
    }));

  if (
    initial.maxWildDinoLevel !== current.maxWildDinoLevel ||
    initial.difficultyOffset !== current.difficultyOffset ||
    initial.overrideOfficialDifficulty !== current.overrideOfficialDifficulty
  ) {
    changes.push({
      field: "maxWildDinoLevel",
      label: "Dificultad del mundo",
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
    return `Nivel ${draft.maxWildDinoLevel} · dificultad ${formatNumber(draft.overrideOfficialDifficulty)}`;
  }
  return `Offset ${formatNumber(draft.difficultyOffset)} · según el mapa`;
}

function formatFieldValue(
  field: keyof ConfigurationWizardDraft,
  value: ConfigurationWizardDraft[keyof ConfigurationWizardDraft],
): string {
  if (field === "pve") return value ? "PvE" : "PvP";
  if (typeof value === "boolean") return value ? "Activado" : "Desactivado";
  if (field === "maxWildDinoLevel") return `Nivel ${value}`;
  if (field === "maxPlayers") return String(value);
  if (field === "structurePickupSeconds") return `${value} s`;
  if (field === "matingIntervalMultiplier" || field === "cuddleIntervalMultiplier") {
    return `${value}× del intervalo base`;
  }
  return `${value}×`;
}
