import type { ReactElement } from "react";
import { ActionIcon, Button, Group, Stack, Text, Tooltip } from "@mantine/core";
import { CheckCircle, Prohibit, Trash, X } from "@phosphor-icons/react";
import { useUiDensity } from "@app/AppProviders";
import { confirmRemoveSelectedMods } from "./confirmRemoveServerMod";

interface Props {
  selectedCount: number;
  listBusy: boolean;
  onEnableSelected: () => void;
  onDisableSelected: () => void;
  onRemoveSelected: () => void;
  onClearSelection: () => void;
}

/**
 * Replaces Enable all / Disable all / Remove all disabled in the header while
 * inventory rows are selected (#635). Copy selected stays on the IDs menu.
 * Count sits under the action row, right-aligned.
 */
export function ServerModsSelectionActions(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "xs" : "sm";
  const iconSize = density === "compact" ? "sm" : "md";
  const hasSelection = props.selectedCount > 0;
  const iconsDisabled = props.listBusy || !hasSelection;

  return (
    <Stack gap={2} align="flex-end" data-mods-selection-actions>
      <Group gap={4} wrap="nowrap">
        <Button
          size={size}
          variant="default"
          disabled={iconsDisabled}
          leftSection={<CheckCircle size={16} />}
          onClick={props.onEnableSelected}
        >
          Enable
        </Button>
        <Button
          size={size}
          variant="default"
          disabled={iconsDisabled}
          leftSection={<Prohibit size={16} />}
          onClick={props.onDisableSelected}
        >
          Disable
        </Button>
        <Tooltip label="Remove selected" withArrow>
          <ActionIcon
            variant="subtle"
            color="red"
            size={iconSize}
            aria-label="Remove selected"
            disabled={iconsDisabled}
            onClick={() => confirmRemoveSelectedMods(props.selectedCount, props.onRemoveSelected)}
          >
            <Trash size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Clear selection" withArrow>
          <ActionIcon
            variant="subtle"
            size={iconSize}
            aria-label="Clear selection"
            disabled={iconsDisabled}
            onClick={props.onClearSelection}
          >
            <X size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Text size="sm" fw={600} lh={1.2} data-mods-selection-count>
        {props.selectedCount} selected
      </Text>
    </Stack>
  );
}
