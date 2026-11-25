import type { ReactElement } from "react";
import { ActionIcon, Button, Group, Tooltip } from "@mantine/core";
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
 * Enable / Disable / Remove stay full buttons (Remove keeps red); Clear is icon-only.
 */
export function ServerModsSelectionActions(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "xs" : "sm";
  const iconSize = density === "compact" ? "sm" : "md";
  const hasSelection = props.selectedCount > 0;
  const actionsDisabled = props.listBusy || !hasSelection;

  return (
    <Group gap={4} wrap="nowrap" data-mods-selection-actions>
      <Button
        size={size}
        variant="default"
        disabled={actionsDisabled}
        leftSection={<CheckCircle size={16} />}
        onClick={props.onEnableSelected}
      >
        Enable
      </Button>
      <Button
        size={size}
        variant="default"
        disabled={actionsDisabled}
        leftSection={<Prohibit size={16} />}
        onClick={props.onDisableSelected}
      >
        Disable
      </Button>
      <Button
        size={size}
        variant="default"
        disabled={actionsDisabled}
        leftSection={<Trash size={16} color="var(--app-color-danger-bright)" />}
        onClick={() => confirmRemoveSelectedMods(props.selectedCount, props.onRemoveSelected)}
      >
        Remove
      </Button>
      <Tooltip label="Clear selection" withArrow>
        <ActionIcon
          variant="subtle"
          size={iconSize}
          aria-label="Clear selection"
          disabled={actionsDisabled}
          onClick={props.onClearSelection}
        >
          <X size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
