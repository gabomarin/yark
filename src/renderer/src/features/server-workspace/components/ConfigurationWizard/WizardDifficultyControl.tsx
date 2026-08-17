import type { ReactElement } from "react";
import { Button, Group, NumberInput, SegmentedControl, Stack, Text, Tooltip } from "@mantine/core";
import type { ConfigurationWizardDraft } from "../../configurationWizardModel";
import classes from "./ConfigurationWizard.module.css";

export type DifficultyChoice = "current" | "120" | "150" | "180" | "300" | "custom";

interface Props {
  choice: DifficultyChoice;
  draft: ConfigurationWizardDraft;
  onChoiceChange: (choice: string) => void;
  onCustomLevelChange: (level: number) => void;
}

function formatRate(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function technicalDifficultyLabel(draft: ConfigurationWizardDraft): string {
  const offset = `DifficultyOffset ${formatRate(draft.difficultyOffset)}`;
  if (draft.overrideOfficialDifficulty > 0) {
    return `${offset} · OverrideOfficialDifficulty ${formatRate(draft.overrideOfficialDifficulty)}`;
  }
  return `${offset} · no override; result depends on the map`;
}

export function WizardDifficultyControl({
  choice,
  draft,
  onChoiceChange,
  onCustomLevelChange,
}: Props): ReactElement {
  return (
    <Stack gap="sm">
      <div>
        <Text fw={700}>World difficulty</Text>
        <Text c="dimmed" size="xs">
          Controls wild levels and potential loot quality.
        </Text>
      </div>
      <SegmentedControl
        value={choice}
        onChange={onChoiceChange}
        fullWidth
        data={[
          { value: "current", label: "Current" },
          { value: "120", label: "Level 120" },
          { value: "150", label: "Level 150" },
          { value: "180", label: "Level 180" },
          { value: "300", label: "Level 300" },
          { value: "custom", label: "Custom" },
        ]}
        aria-label="World difficulty"
      />
      <div className={classes.difficultySummary}>
        <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
          <div>
            <Text fw={700} size="sm">
              {choice === "current"
                ? `Keep current max level (${draft.maxWildDinoLevel})`
                : `Max wild level ${draft.maxWildDinoLevel}`}
            </Text>
            <Text c="dimmed" size="xs">
              Same result on every map when you pick a level.
            </Text>
          </div>
          <Tooltip label={technicalDifficultyLabel(draft)} multiline maw={360} withArrow>
            <Button variant="subtle" color="gray" size="compact-xs">
              Technical
            </Button>
          </Tooltip>
        </Group>
        {choice === "custom" && (
          <NumberInput
            label="Custom max level"
            description="The wizard will compute the required technical override."
            min={30}
            max={600}
            step={5}
            allowDecimal={false}
            value={draft.maxWildDinoLevel}
            onChange={(value) => {
              if (typeof value === "number") onCustomLevelChange(value);
            }}
          />
        )}
      </div>
      <Text c="dimmed" size="xs">
        Some special creatures may spawn above the stated level.
      </Text>
    </Stack>
  );
}
