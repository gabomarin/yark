import { parseIniTextRows, setIniTextValue } from "@shared/ini-text";
import type { IniFileKey, ServerIniPayload } from "@shared/types";
import { SETTINGS, type WizardSetting } from "./configurationWizardIniSettings";
import {
  DEFAULT_WIZARD_VALUES,
  formatWizardNumber,
  type ConfigurationWizardDraft,
  type WizardChange,
} from "./configurationWizardTypes";

const FIELD_LABELS: Record<keyof ConfigurationWizardDraft, string> = {
  profile: "Profile",
  singlePlayerSettings: "Enable single-player settings",
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
  allowCaveBuildingPve: "Cave building in PvE",
  showFloatingDamageText: "Floating damage text",
  alwaysAllowStructurePickup: "Always allow structure pickup",
  structurePickupSeconds: "Structure pickup window",
  matingSpeedMultiplier: "Mating speed",
  babyImprintAmountMultiplier: "Imprint amount",
  babyCuddleGracePeriodMultiplier: "Cuddle grace period",
  resourcesRespawnPeriodMultiplier: "Resource respawn",
};

const FIELD_INI_KEYS: Partial<Record<keyof ConfigurationWizardDraft, string>> = {
  ...Object.fromEntries(SETTINGS.map((setting) => [setting.field, setting.key])),
  maxWildDinoLevel: "OverrideOfficialDifficulty · DifficultyOffset",
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
    if (
      setting.field === "structurePickupSeconds"
      && draft.alwaysAllowStructurePickup
    ) {
      continue;
    }
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
      || (field === "structurePickupSeconds" && current.alwaysAllowStructurePickup)
      || initial[field] === current[field]
    ) {
      continue;
    }
    changes.push({
      field,
      label: FIELD_LABELS[field],
      iniKey: FIELD_INI_KEYS[field] ?? FIELD_LABELS[field],
      before: formatFieldValue(field, initial[field]),
      after: formatFieldValue(field, current[field]),
    });
  }

  if (
    initial.maxWildDinoLevel !== current.maxWildDinoLevel
    || initial.difficultyOffset !== current.difficultyOffset
    || initial.overrideOfficialDifficulty !== current.overrideOfficialDifficulty
  ) {
    changes.push({
      field: "maxWildDinoLevel",
      label: "World difficulty",
      iniKey: "OverrideOfficialDifficulty · DifficultyOffset",
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
      row.section.toLowerCase() === sectionLower
      && row.key.toLowerCase() === keyLower
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
  return formatWizardNumber(value);
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
  if (field === "structurePickupSeconds") return `${value} s`;
  if (field === "matingIntervalMultiplier" || field === "cuddleIntervalMultiplier") {
    return `${value}× of base interval`;
  }
  return `${value}×`;
}
