import type { ReactElement } from "react";
import { SimpleGrid, Text } from "@mantine/core";
import {
  PROGRESSION_PRESETS,
  SINGLE_PLAYER_RATE_FACTORS,
  type ConfigurationWizardDraft,
  type ProgressionPresetId,
} from "../../configuration-wizard/configurationWizardModel";
import {
  effectiveRateLabel,
  PresetSelector,
  PresetValue,
  WizardStep,
} from "./ConfigurationWizardParts";
import {
  WizardDifficultyControl,
  type DifficultyChoice,
} from "./WizardDifficultyControl";

interface Props {
  draft: ConfigurationWizardDraft;
  progressionPreset: ProgressionPresetId | "current";
  difficultyChoice: DifficultyChoice;
  onProgressionPresetChange: (preset: string) => void;
  onDifficultyChoiceChange: (choice: string) => void;
  onCustomLevelChange: (level: number) => void;
}

export function WizardPaceStep(props: Props): ReactElement {
  const {
    draft,
    progressionPreset,
    difficultyChoice,
    onProgressionPresetChange,
    onDifficultyChoiceChange,
    onCustomLevelChange,
  } = props;

  return (
    <WizardStep
      title="Set the progression pace"
      description="Choose how progression should feel. Exact rates stay visible before you apply."
    >
      <PresetSelector
        value={progressionPreset}
        onChange={onProgressionPresetChange}
        presets={PROGRESSION_PRESETS}
        currentDescription="Keep the values this server already uses."
        paced
        ariaLabel="Progression pace"
      >
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 4 }} spacing="xs">
          <PresetValue label="Experience" value={`${draft.xpRate}×`} />
          <PresetValue label="Harvesting" value={`${draft.harvestRate}×`} />
          <PresetValue
            label="Taming"
            value={effectiveRateLabel(
              draft.tamingRate,
              SINGLE_PLAYER_RATE_FACTORS.tamingRate,
              draft.singlePlayerSettings,
            )}
          />
          <PresetValue
            label="Resource respawn"
            value={`${draft.resourcesRespawnPeriodMultiplier}×`}
          />
        </SimpleGrid>
      </PresetSelector>
      <Text c="dimmed" size="xs">
        For resource respawn, a lower value means nodes come back sooner.
      </Text>
      {draft.singlePlayerSettings && (
        <Text c="yellow.3" size="xs">
          Single-player mode also reduces XP requirements, so the final XP effect cannot be expressed
          as a single multiplier.
        </Text>
      )}
      <WizardDifficultyControl
        choice={difficultyChoice}
        draft={draft}
        onChoiceChange={onDifficultyChoiceChange}
        onCustomLevelChange={onCustomLevelChange}
      />
    </WizardStep>
  );
}
