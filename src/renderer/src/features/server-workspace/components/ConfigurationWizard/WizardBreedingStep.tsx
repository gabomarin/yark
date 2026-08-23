import type { ReactElement } from "react";
import { SimpleGrid, Text } from "@mantine/core";
import {
  BREEDING_PRESETS,
  SINGLE_PLAYER_RATE_FACTORS,
  type BreedingPresetId,
  type ConfigurationWizardDraft,
} from "../../configuration-wizard/configurationWizardModel";
import {
  effectiveRateLabel,
  PresetSelector,
  PresetValue,
  WizardStep,
} from "./ConfigurationWizardParts";

interface Props {
  draft: ConfigurationWizardDraft;
  breedingPreset: BreedingPresetId | "current";
  onBreedingPresetChange: (preset: string) => void;
}

export function WizardBreedingStep(props: Props): ReactElement {
  const { draft, breedingPreset, onBreedingPresetChange } = props;

  return (
    <WizardStep
      title="Tune breeding"
      description="Pick an intensity; the wizard coordinates hatching, growth, mating, and care."
    >
      <PresetSelector
        value={breedingPreset}
        onChange={onBreedingPresetChange}
        presets={BREEDING_PRESETS}
        currentDescription="Keep the combination this server already uses."
        paced
        ariaLabel="Breeding pace"
      >
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 4 }} spacing="xs">
          <PresetValue
            label="Hatching"
            value={effectiveRateLabel(
              draft.eggHatchRate,
              SINGLE_PLAYER_RATE_FACTORS.eggHatchRate,
              draft.singlePlayerSettings,
            )}
          />
          <PresetValue
            label="Maturation"
            value={effectiveRateLabel(
              draft.maturationRate,
              SINGLE_PLAYER_RATE_FACTORS.maturationRate,
              draft.singlePlayerSettings,
            )}
          />
          <PresetValue
            label="Mating wait"
            value={effectiveRateLabel(
              draft.matingIntervalMultiplier,
              SINGLE_PLAYER_RATE_FACTORS.matingIntervalMultiplier,
              draft.singlePlayerSettings,
            )}
          />
          <PresetValue label="Mating speed" value={`${draft.matingSpeedMultiplier}×`} />
          <PresetValue
            label="Cuddle interval"
            value={effectiveRateLabel(
              draft.cuddleIntervalMultiplier,
              SINGLE_PLAYER_RATE_FACTORS.cuddleIntervalMultiplier,
              draft.singlePlayerSettings,
            )}
          />
          <PresetValue
            label="Imprint amount"
            value={`${draft.babyImprintAmountMultiplier}×`}
          />
          <PresetValue
            label="Cuddle grace"
            value={`${draft.babyCuddleGracePeriodMultiplier}×`}
          />
        </SimpleGrid>
      </PresetSelector>
      <Text c="dimmed" size="xs">
        Cuddle interval scales with maturation so imprint can still reach 100%. Faster presets give
        more % per cuddle so you can miss a few care windows; no preset is meant for a single
        one-shot cuddle on long raises.
      </Text>
    </WizardStep>
  );
}
