import type { ReactElement } from "react";
import { Button, Group, Text } from "@mantine/core";
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
 * Header toolbar while inventory rows are selected (#635).
 * Replaces Enable/Disable/Remove all until the selection is cleared.
 */
export function ServerModsSelectionActions(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "xs" : "sm";
  const hasSelection = props.selectedCount > 0;
  return (
    <Group gap={4} wrap="nowrap" data-mods-selection-actions>
      <Text size="sm" c="dimmed" data-mods-selection-count>
        {props.selectedCount} selected
      </Text>
      <Button size={size} variant="default" disabled={props.listBusy || !hasSelection} onClick={props.onEnableSelected}>
        Enable selected
      </Button>
      <Button
        size={size}
        variant="default"
        disabled={props.listBusy || !hasSelection}
        onClick={props.onDisableSelected}
      >
        Disable selected
      </Button>
      <Button
        size={size}
        variant="default"
        color="red"
        disabled={props.listBusy || !hasSelection}
        onClick={() => confirmRemoveSelectedMods(props.selectedCount, props.onRemoveSelected)}
      >
        Remove selected
      </Button>
      <Button size={size} variant="subtle" disabled={props.listBusy || !hasSelection} onClick={props.onClearSelection}>
        Clear selection
      </Button>
    </Group>
  );
}
