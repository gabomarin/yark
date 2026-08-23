import type { IniFileKey } from "@shared/types";
import type { ConfigurationWizardDraft } from "./configurationWizardTypes";

export interface WizardSetting {
  field: Exclude<keyof ConfigurationWizardDraft, "profile" | "maxWildDinoLevel">;
  fileKey: IniFileKey;
  section: string;
  key: string;
  fallback: boolean | number;
}

const GAME_MODE_SECTION = "/script/shootergame.shootergamemode";

export const SETTINGS: readonly WizardSetting[] = [
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
    field: "matingSpeedMultiplier",
    fileKey: "game",
    section: GAME_MODE_SECTION,
    key: "MatingSpeedMultiplier",
    fallback: 1,
  },
  {
    field: "babyImprintAmountMultiplier",
    fileKey: "game",
    section: GAME_MODE_SECTION,
    key: "BabyImprintAmountMultiplier",
    fallback: 1,
  },
  {
    field: "babyCuddleGracePeriodMultiplier",
    fileKey: "game",
    section: GAME_MODE_SECTION,
    key: "BabyCuddleGracePeriodMultiplier",
    fallback: 1,
  },
  {
    field: "resourcesRespawnPeriodMultiplier",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "ResourcesRespawnPeriodMultiplier",
    fallback: 1,
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
    field: "allowCaveBuildingPve",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "AllowCaveBuildingPvE",
    fallback: false,
  },
  {
    field: "showFloatingDamageText",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "ShowFloatingDamageText",
    fallback: false,
  },
  {
    field: "alwaysAllowStructurePickup",
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key: "AlwaysAllowStructurePickup",
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
