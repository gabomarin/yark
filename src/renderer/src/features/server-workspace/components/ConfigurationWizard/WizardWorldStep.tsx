import type { ReactElement } from "react";
import { SimpleGrid, Text } from "@mantine/core";
import {
  WORLD_PRESETS,
  type ConfigurationWizardDraft,
  type WorldPresetId,
} from "../../configurationWizardModel";
import { PresetSelector, PresetValue, WizardStep } from "./ConfigurationWizardParts";

interface Props {
  draft: ConfigurationWizardDraft;
  worldPreset: WorldPresetId | "current";
  onWorldPresetChange: (preset: string) => void;
}

export function WizardWorldStep(props: Props): ReactElement {
  const { draft, worldPreset, onWorldPresetChange } = props;

  return (
    <WizardStep
      title="Define how the world feels"
      description="Pick an intensity from Very easy to Very hard. Max players stays in server settings."
    >
      <PresetSelector
        value={worldPreset}
        onChange={onWorldPresetChange}
        presets={WORLD_PRESETS}
        currentDescription="Keep the combination this server already uses."
        worldFeel
        ariaLabel="World feel"
      >
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 4 }} spacing="xs">
          <PresetValue label="Dinosaur density" value={`${draft.dinoCountMultiplier}×`} />
          <PresetValue label="Node health" value={`${draft.harvestHealthMultiplier}×`} />
          <PresetValue
            label="Structure resistance"
            value={`${draft.structureResistanceMultiplier}×`}
          />
          <PresetValue label="Day speed" value={`${draft.dayCycleSpeedScale}×`} />
          <PresetValue label="Night speed" value={`${draft.nightTimeSpeedScale}×`} />
          <PresetValue
            label="Food drain"
            value={`${draft.playerCharacterFoodDrainMultiplier}×`}
          />
          <PresetValue
            label="Water drain"
            value={`${draft.playerCharacterWaterDrainMultiplier}×`}
          />
        </SimpleGrid>
      </PresetSelector>
      <Text c="dimmed" size="xs">
        For food and water, a lower value means less hunger and thirst. For night, a higher value
        shortens darkness.
      </Text>
    </WizardStep>
  );
}
