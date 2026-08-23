import {
  applyBreedingPreset,
  applyDifficultyLevel,
  applyExperienceProfile,
  applyProgressionPreset,
  applyWorldPreset,
  EXPERIENCE_PROFILES,
  type BreedingPresetId,
  type ConfigurationWizardDraft,
  type ExperienceProfileId,
  type ProgressionPresetId,
  type WorldPresetId,
} from "../../../configuration-wizard/configurationWizardModel";
import type { DifficultyChoice } from "../WizardDifficultyControl";

export const EMPTY_WIZARD_DRAFT: ConfigurationWizardDraft = {
  profile: "current",
  singlePlayerSettings: false,
  pve: false,
  hardcore: false,
  xpRate: 1,
  harvestRate: 1,
  tamingRate: 1,
  maxWildDinoLevel: 150,
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

export type WizardPresetState = {
  progressionPreset: ProgressionPresetId | "current";
  breedingPreset: BreedingPresetId | "current";
  worldPreset: WorldPresetId | "current";
  difficultyChoice: DifficultyChoice;
};

export function draftForProfileChoice(
  profile: ExperienceProfileId,
  current: ConfigurationWizardDraft,
  initialDraft: ConfigurationWizardDraft,
): { draft: ConfigurationWizardDraft; presets: WizardPresetState } {
  if (profile === "current" || profile === "cluster") {
    return {
      draft: { ...initialDraft, profile },
      presets: {
        progressionPreset: "current",
        breedingPreset: "current",
        worldPreset: "current",
        difficultyChoice: "current",
      },
    };
  }
  const draft = applyExperienceProfile(current, profile);
  const selectedProfile = EXPERIENCE_PROFILES.find(
    (candidate) => candidate.id === profile,
  );
  return {
    draft,
    presets: {
      progressionPreset: selectedProfile?.progressionPreset ?? "current",
      breedingPreset: selectedProfile?.breedingPreset ?? "current",
      worldPreset: selectedProfile?.worldPreset ?? "current",
      difficultyChoice: selectedProfile !== undefined ? "150" : "current",
    },
  };
}

export function draftForProgressionPreset(
  preset: string,
  current: ConfigurationWizardDraft,
  initialDraft: ConfigurationWizardDraft,
): { draft: ConfigurationWizardDraft; progressionPreset: ProgressionPresetId | "current" } {
  if (preset === "current") {
    return {
      draft: {
        ...current,
        xpRate: initialDraft.xpRate,
        harvestRate: initialDraft.harvestRate,
        tamingRate: initialDraft.tamingRate,
        resourcesRespawnPeriodMultiplier:
          initialDraft.resourcesRespawnPeriodMultiplier,
      },
      progressionPreset: "current",
    };
  }
  const progressionPreset = preset as ProgressionPresetId;
  return {
    draft: applyProgressionPreset(current, progressionPreset),
    progressionPreset,
  };
}

export function draftForBreedingPreset(
  preset: string,
  current: ConfigurationWizardDraft,
  initialDraft: ConfigurationWizardDraft,
): { draft: ConfigurationWizardDraft; breedingPreset: BreedingPresetId | "current" } {
  if (preset === "current") {
    return {
      draft: {
        ...current,
        eggHatchRate: initialDraft.eggHatchRate,
        maturationRate: initialDraft.maturationRate,
        matingIntervalMultiplier: initialDraft.matingIntervalMultiplier,
        cuddleIntervalMultiplier: initialDraft.cuddleIntervalMultiplier,
        matingSpeedMultiplier: initialDraft.matingSpeedMultiplier,
        babyImprintAmountMultiplier: initialDraft.babyImprintAmountMultiplier,
        babyCuddleGracePeriodMultiplier:
          initialDraft.babyCuddleGracePeriodMultiplier,
      },
      breedingPreset: "current",
    };
  }
  const breedingPreset = preset as BreedingPresetId;
  return {
    draft: applyBreedingPreset(current, breedingPreset),
    breedingPreset,
  };
}

export function draftForWorldPreset(
  preset: string,
  current: ConfigurationWizardDraft,
  initialDraft: ConfigurationWizardDraft,
): { draft: ConfigurationWizardDraft; worldPreset: WorldPresetId | "current" } {
  if (preset === "current") {
    return {
      draft: {
        ...current,
        dinoCountMultiplier: initialDraft.dinoCountMultiplier,
        harvestHealthMultiplier: initialDraft.harvestHealthMultiplier,
        dayCycleSpeedScale: initialDraft.dayCycleSpeedScale,
        nightTimeSpeedScale: initialDraft.nightTimeSpeedScale,
        playerCharacterFoodDrainMultiplier:
          initialDraft.playerCharacterFoodDrainMultiplier,
        playerCharacterWaterDrainMultiplier:
          initialDraft.playerCharacterWaterDrainMultiplier,
        structureResistanceMultiplier: initialDraft.structureResistanceMultiplier,
      },
      worldPreset: "current",
    };
  }
  const worldPreset = preset as WorldPresetId;
  return {
    draft: applyWorldPreset(current, worldPreset),
    worldPreset,
  };
}

export function draftForDifficultyChoice(
  choice: string,
  current: ConfigurationWizardDraft,
  initialDraft: ConfigurationWizardDraft,
): { draft: ConfigurationWizardDraft; difficultyChoice: DifficultyChoice } {
  const difficultyChoice = choice as DifficultyChoice;
  if (difficultyChoice === "current") {
    return {
      draft: {
        ...current,
        maxWildDinoLevel: initialDraft.maxWildDinoLevel,
        difficultyOffset: initialDraft.difficultyOffset,
        overrideOfficialDifficulty: initialDraft.overrideOfficialDifficulty,
      },
      difficultyChoice,
    };
  }
  const level =
    difficultyChoice === "custom"
      ? current.maxWildDinoLevel
      : Number(difficultyChoice);
  return {
    draft: applyDifficultyLevel(current, level),
    difficultyChoice,
  };
}
