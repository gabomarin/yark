import type { ReactElement } from "react";
import { ServerModsSelectionActions } from "./ServerModsSelectionActions";
import { ServerModsServerHeaderActions } from "./ServerModsServerHeaderActions";

interface Props {
  configuredIds: string[];
  disabledIds: ReadonlySet<string>;
  disabledCount: number;
  listBusy: boolean;
  selectedIds: string[];
  onEnableAll: () => void;
  onDisableAll: () => void;
  onRemoveAllDisabled: () => void;
  onEnableSelected: (ids: string[]) => void;
  onDisableSelected: (ids: string[]) => void;
  onCopySelected: (ids: string[]) => void;
  onRemoveSelected: (ids: string[]) => void;
  onClearSelection: () => void;
}

/** Server-view header: all-actions or selection toolbar (#635 / #637). */
export function ServerModsPanelServerActions(props: Props): ReactElement {
  const selectionActive = props.selectedIds.length > 0;
  return (
    <ServerModsServerHeaderActions
      configuredIds={props.configuredIds}
      disabledIds={props.disabledIds}
      disabledCount={props.disabledCount}
      listBusy={props.listBusy}
      selectedIds={props.selectedIds}
      onEnableAll={props.onEnableAll}
      onDisableAll={props.onDisableAll}
      onRemoveAllDisabled={props.onRemoveAllDisabled}
      selectionActions={
        selectionActive ? (
          <ServerModsSelectionActions
            selectedCount={props.selectedIds.length}
            listBusy={props.listBusy}
            onEnableSelected={() => props.onEnableSelected(props.selectedIds)}
            onDisableSelected={() => props.onDisableSelected(props.selectedIds)}
            onCopySelected={() => props.onCopySelected(props.selectedIds)}
            onRemoveSelected={() => props.onRemoveSelected(props.selectedIds)}
            onClearSelection={props.onClearSelection}
          />
        ) : undefined
      }
    />
  );
}
