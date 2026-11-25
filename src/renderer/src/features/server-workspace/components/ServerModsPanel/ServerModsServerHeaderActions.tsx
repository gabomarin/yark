import type { ReactElement } from "react";
import { Button, Group } from "@mantine/core";
import { CheckCircle, Prohibit, Trash } from "@phosphor-icons/react";
import { useUiDensity } from "@app/AppProviders";
import { ServerModsIdsMenu } from "./ServerModsIdsMenu";
import { ServerModsSelectionActions } from "./ServerModsSelectionActions";
import { confirmRemoveDisabledMods } from "./confirmRemoveServerMod";

interface Props {
  configuredIds: string[];
  disabledIds: ReadonlySet<string>;
  disabledCount: number;
  listBusy: boolean;
  selectedIds: readonly string[];
  onEnableAll: () => void;
  onDisableAll: () => void;
  onRemoveAllDisabled: () => void;
  onEnableSelected: (ids: readonly string[]) => void;
  onDisableSelected: (ids: readonly string[]) => void;
  onRemoveSelected: (ids: readonly string[]) => void;
  onClearSelection: () => void;
}

/**
 * Server-view header actions (#634 / #637 / #635).
 * IDs always stays. Selection replaces Enable all / Disable all / Remove all
 * disabled in the same row — one action group. Copy selected lives in IDs.
 */
export function ServerModsServerHeaderActions(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "xs" : "sm";
  const hasMods = props.configuredIds.length > 0;
  const selectionActive = props.selectedIds.length > 0;
  return (
    <Group gap={4} wrap="nowrap" align="flex-start">
      <ServerModsIdsMenu
        configuredIds={props.configuredIds}
        disabledIds={props.disabledIds}
        selectedIds={props.selectedIds}
        disabled={props.listBusy}
      />
      {selectionActive ? (
        <ServerModsSelectionActions
          selectedCount={props.selectedIds.length}
          listBusy={props.listBusy}
          onEnableSelected={() => props.onEnableSelected(props.selectedIds)}
          onDisableSelected={() => props.onDisableSelected(props.selectedIds)}
          onRemoveSelected={() => props.onRemoveSelected(props.selectedIds)}
          onClearSelection={props.onClearSelection}
        />
      ) : (
        <>
          <Button
            size={size}
            variant="default"
            disabled={props.listBusy || !hasMods || props.disabledCount === 0}
            leftSection={<CheckCircle size={16} />}
            onClick={props.onEnableAll}
          >
            Enable all
          </Button>
          <Button
            size={size}
            variant="default"
            disabled={props.listBusy || !hasMods || props.disabledCount === props.configuredIds.length}
            leftSection={<Prohibit size={16} />}
            onClick={props.onDisableAll}
          >
            Disable all
          </Button>
          <Button
            size={size}
            variant="default"
            disabled={props.listBusy || !hasMods || props.disabledCount === 0}
            leftSection={<Trash size={16} color="var(--app-color-danger-bright)" />}
            onClick={() => confirmRemoveDisabledMods(props.disabledCount, props.onRemoveAllDisabled)}
          >
            Remove all disabled
          </Button>
        </>
      )}
    </Group>
  );
}
