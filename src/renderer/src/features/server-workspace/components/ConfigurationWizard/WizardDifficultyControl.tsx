import type { ReactElement } from "react";
import { Button, Group, NumberInput, SegmentedControl, Stack, Text, Tooltip } from "@mantine/core";
import { formatWizardNumber, type ConfigurationWizardDraft } from "../../configurationWizardModel";
import { OfficialMatchBadge } from "./ConfigurationWizardParts";
import classes from "./ConfigurationWizard.module.css";

/** Named tiers → max wild level 30–150, plus keep-current / custom. */
export type DifficultyChoice =
  | "current"
  | "30"
  | "60"
  | "90"
  | "120"
  | "150"
  | "custom";

interface Props {
  choice: DifficultyChoice;
  draft: ConfigurationWizardDraft;
  onChoiceChange: (choice: string) => void;
  onCustomLevelChange: (level: number) => void;
}

function iniDifficultyLabel(draft: ConfigurationWizardDraft): string {
  const offset = `DifficultyOffset ${formatWizardNumber(draft.difficultyOffset)}`;
  if (draft.overrideOfficialDifficulty > 0) {
    return `${offset} · OverrideOfficialDifficulty ${formatWizardNumber(draft.overrideOfficialDifficulty)}`;
  }
  return `${offset} · no override; result depends on the map`;
}

/**
 * Easy→hard scale: green → teal (green/blue mix) → blue → orange → red.
 */
function worldDifficultyColor(value: string): string {
  switch (value) {
    case "30":
      return "green";
    case "60":
      return "teal";
    case "90":
      return "blue";
    case "120":
      return "orange";
    case "150":
      return "red";
    default:
      return "gray";
  }
}

const DIFFICULTY_TIERS: readonly { value: DifficultyChoice; label: string }[] = [
  { value: "30", label: "Very easy" },
  { value: "60", label: "Easy" },
  { value: "90", label: "Medium" },
  { value: "120", label: "Hard" },
  { value: "150", label: "Very hard" },
];

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
          Sets max wild creature level (30–150).
        </Text>
      </div>
      <SegmentedControl
        value={choice}
        onChange={onChoiceChange}
        fullWidth
        color={worldDifficultyColor(choice)}
        data={[
          { value: "current", label: "Current" },
          ...DIFFICULTY_TIERS,
          { value: "custom", label: "Custom" },
        ]}
        aria-label="World difficulty"
      />
      <div className={classes.difficultySummary}>
        <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
          <Stack gap={4}>
            <Group gap="xs" wrap="wrap" align="center">
              <Text fw={700} size="sm">
                {choice === "current"
                  ? `Keep current max level (${draft.maxWildDinoLevel})`
                  : `Max wild level ${draft.maxWildDinoLevel}`}
              </Text>
              {choice === "150" && <OfficialMatchBadge />}
            </Group>
            <Text c="dimmed" size="xs">
              Same result on every map when you pick a named tier.
            </Text>
          </Stack>
          <Tooltip label={iniDifficultyLabel(draft)} multiline maw={360} withArrow>
            <Button variant="subtle" color="gray" size="compact-xs">
              INI details
            </Button>
          </Tooltip>
        </Group>
        {choice === "custom" && (
          <NumberInput
            label="Custom max level"
            description="The wizard computes the INI override from this level."
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
