import type { Dispatch, ReactElement, SetStateAction } from "react";
import { Badge, Group, Stack, Text } from "@mantine/core";
import type { ConfigTransferSelection } from "@shared/config-transfer";
import type { ConfigTransferDescribeResult } from "@shared/types";
import {
  EXTRA_ARGS_MERGE_TOOLTIP,
  EXTRA_ARGS_REPLACE_TOOLTIP,
  MODS_MERGE_TOOLTIP,
  MODS_REPLACE_TOOLTIP,
} from "../../copyConfigurationModel";
import { CopyConfigCategoryCard } from "./CopyConfigCategoryCard";
import { CopyConfigIniFilePicker } from "./CopyConfigIniFilePicker";
import { CopyConfigStrategyToggle } from "./CopyConfigStrategyToggle";

interface Props {
  sourceName: string;
  targetLabel: string;
  selection: ConfigTransferSelection;
  describe: ConfigTransferDescribeResult | null;
  loadingDescribe: boolean;
  onChange: Dispatch<SetStateAction<ConfigTransferSelection>>;
}

export function CopyConfigCategoriesStep(props: Props): ReactElement {
  const { selection, describe, onChange } = props;

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Badge variant="light" color="blue">
          {props.sourceName} → {props.targetLabel}
        </Badge>
        <Text size="xs" c="dimmed">
          Check a category to copy it. Open INI categories to pick settings.
        </Text>
      </Group>

      {props.loadingDescribe && (
        <Text size="sm" c="dimmed">
          Loading source settings…
        </Text>
      )}

      <CopyConfigIniFilePicker
        title="GameUserSettings.ini"
        description="Server rates, world, and session settings (owned keys stay locked)"
        file={selection.gameUserSettings}
        categories={describe?.gameUserSettings ?? []}
        onChange={(gameUserSettings) =>
          onChange((prev) => ({ ...prev, gameUserSettings }))
        }
      />

      <CopyConfigIniFilePicker
        title="Game.ini"
        description="Breeding, dinos, and game-mode multipliers"
        file={selection.game}
        categories={describe?.game ?? []}
        onChange={(game) => onChange((prev) => ({ ...prev, game }))}
      />

      <CopyConfigCategoryCard
        title="Mods"
        description={
          describe !== null
            ? `${describe.mods.length} mods · ${describe.disabledMods.length} disabled`
            : "Mod list and load order"
        }
        checked={selection.mods.enabled}
        onChange={(enabled) =>
          onChange((prev) => ({
            ...prev,
            mods: { ...prev.mods, enabled },
          }))
        }
      >
        <Stack gap="xs">
          <CopyConfigStrategyToggle
            strategy={selection.mods.strategy}
            mergeTooltip={MODS_MERGE_TOOLTIP}
            replaceTooltip={MODS_REPLACE_TOOLTIP}
            onChange={(strategy) =>
              onChange((prev) => ({
                ...prev,
                mods: { ...prev.mods, strategy },
              }))
            }
          />
          {describe !== null && describe.mods.length > 0 ? (
            <Text size="xs" c="dimmed" lineClamp={3}>
              {describe.mods.join(", ")}
            </Text>
          ) : (
            <Text size="xs" c="dimmed">
              No mods on the source.
            </Text>
          )}
        </Stack>
      </CopyConfigCategoryCard>

      <CopyConfigCategoryCard
        title="Launch arguments"
        description={
          describe !== null
            ? `${describe.extraArgs.length} extra · ${describe.structuredLaunchArgs.length} structured`
            : "Extra command-line flags and structured Launch options"
        }
        checked={selection.extraArgs.enabled}
        onChange={(enabled) =>
          onChange((prev) => ({
            ...prev,
            extraArgs: { ...prev.extraArgs, enabled },
          }))
        }
      >
        <Stack gap="xs">
          <CopyConfigStrategyToggle
            strategy={selection.extraArgs.strategy}
            mergeTooltip={EXTRA_ARGS_MERGE_TOOLTIP}
            replaceTooltip={EXTRA_ARGS_REPLACE_TOOLTIP}
            onChange={(strategy) =>
              onChange((prev) => ({
                ...prev,
                extraArgs: { ...prev.extraArgs, strategy },
              }))
            }
          />
          {describe !== null &&
          (describe.extraArgs.length > 0 ||
            describe.structuredLaunchArgs.length > 0) ? (
            <Stack gap={4}>
              {describe.structuredLaunchArgs.length > 0 ? (
                <Text size="xs" c="dimmed" ff="monospace" lineClamp={2}>
                  Structured: {describe.structuredLaunchArgs.join(" ")}
                </Text>
              ) : null}
              {describe.extraArgs.length > 0 ? (
                <Text size="xs" c="dimmed" ff="monospace" lineClamp={2}>
                  Extra: {describe.extraArgs.join(" ")}
                </Text>
              ) : null}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              No launch arguments on the source.
            </Text>
          )}
        </Stack>
      </CopyConfigCategoryCard>

      <CopyConfigCategoryCard
        title="Backup schedule"
        description="How often backups run and how many to keep (backup folder stays on the target)"
        checked={selection.backupPolicy}
        onChange={(backupPolicy) =>
          onChange((prev) => ({ ...prev, backupPolicy }))
        }
      />

      <CopyConfigCategoryCard
        title="Passwords"
        description="Admin and server join passwords (off by default)"
        tone="fossil"
        checked={selection.passwords}
        onChange={(passwords) => onChange((prev) => ({ ...prev, passwords }))}
      />
    </Stack>
  );
}
