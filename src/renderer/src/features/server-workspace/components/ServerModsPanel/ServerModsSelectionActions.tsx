import type { ReactElement } from "react";
import { ActionIcon, Button, Group, Text, Tooltip } from "@mantine/core";
import { Copy, Trash, X } from "@phosphor-icons/react";
import { useUiDensity } from "@app/AppProviders";
import { confirmRemoveSelectedMods } from "./confirmRemoveServerMod";
import classes from "./ServerModsPanel.module.css";

interface Props {
  selectedCount: number;
  listBusy: boolean;
  onEnableSelected: () => void;
  onDisableSelected: () => void;
  onCopySelected: () => void;
  onRemoveSelected: () => void;
  onClearSelection: () => void;
}

/**
 * Selection strip above the inventory table (#635).
 * Header Enable all / Disable all / Remove all disabled stay unchanged.
 * Enable/Disable stay labeled; Copy / Remove / Clear are icon buttons with tooltips.
 */
export function ServerModsSelectionActions(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "xs" : "sm";
  const iconSize = density === "compact" ? "sm" : "md";
  const hasSelection = props.selectedCount > 0;
  const iconsDisabled = props.listBusy || !hasSelection;

  return (
    <div className={classes.selectionStrip} data-mods-selection-actions>
      <Text size="sm" fw={500} data-mods-selection-count>
        {props.selectedCount} selected
      </Text>
      <Group gap={4} wrap="nowrap">
        <Button size={size} variant="default" disabled={iconsDisabled} onClick={props.onEnableSelected}>
          Enable
        </Button>
        <Button size={size} variant="default" disabled={iconsDisabled} onClick={props.onDisableSelected}>
          Disable
        </Button>
        <Tooltip label="Copy selected Project IDs" withArrow>
          <ActionIcon
            variant="default"
            size={iconSize}
            aria-label="Copy selected Project IDs"
            disabled={iconsDisabled}
            onClick={props.onCopySelected}
          >
            <Copy size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Remove selected" withArrow>
          <ActionIcon
            variant="default"
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
    </div>
  );
}
