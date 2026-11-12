import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { Button } from "@mantine/core";
import { PuzzlePiece } from "@phosphor-icons/react";
import type { ModAddImportProgress } from "@shared/mods/mod-add-input";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { ServerModsInventoryToolbar } from "./ServerModsInventoryToolbar";
import { ServerModsTable } from "./ServerModsTable";
import { MOD_ADD_HELP, ServerModsAddProgress, ServerModsUrlInput } from "./ServerModsUrlInput";
import {
  EMPTY_SERVER_MODS_INVENTORY_FILTER,
  filterServerModRows,
  isServerModsInventoryFilterActive,
  type ModRow,
  type ServerModsInventoryFilter,
} from "./serverModsModel";
import classes from "./ServerModsPanel.module.css";

interface Props {
  url: string;
  busyKey: string | null;
  importProgress: ModAddImportProgress | null;
  rows: ModRow[];
  onUrlChange: (value: string) => void;
  onAdd: () => void;
  onDiscover: () => void;
  onInspect: (row: ModRow) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onOpenExternal: (url: string) => void;
  onSetPassive: (row: ModRow) => void;
  onReorder: (orderedIds: string[]) => void;
  onCopyProjectId: (row: ModRow) => void;
  onCopyCurseForgeUrl: (row: ModRow) => void;
}

export function ServerModsServerSection(props: Props): ReactElement {
  const [inventoryFilter, setInventoryFilter] = useState<ServerModsInventoryFilter>(EMPTY_SERVER_MODS_INVENTORY_FILTER);
  const filterActive = isServerModsInventoryFilterActive(inventoryFilter);
  const visibleRows = useMemo(() => filterServerModRows(props.rows, inventoryFilter), [props.rows, inventoryFilter]);
  const hasMods = props.rows.length > 0;

  return (
    <div className={classes.sectionLayout}>
      <div className={classes.sectionTop}>
        {hasMods ? (
          <div className={classes.serverToolbar} data-mods-server-toolbar>
            <ServerModsUrlInput
              variant="compact"
              value={props.url}
              busy={props.busyKey === "url"}
              onChange={props.onUrlChange}
              onAdd={props.onAdd}
            />
            <ServerModsInventoryToolbar
              filter={inventoryFilter}
              visibleCount={visibleRows.length}
              totalCount={props.rows.length}
              onFilterChange={setInventoryFilter}
            />
          </div>
        ) : (
          <ServerModsUrlInput
            variant="prominent"
            value={props.url}
            busy={props.busyKey === "url"}
            onChange={props.onUrlChange}
            onAdd={props.onAdd}
          />
        )}
        {props.importProgress !== null ? <ServerModsAddProgress progress={props.importProgress} /> : null}
      </div>
      <div className={classes.sectionMain}>
        {!hasMods ? (
          <EmptyState
            layout="stacked"
            icon={<PuzzlePiece size={24} />}
            title="No mods configured for this server"
            description={MOD_ADD_HELP}
            action={
              <Button variant="default" onClick={props.onDiscover}>
                Discover mods
              </Button>
            }
          />
        ) : (
          <ServerModsTable
            rows={visibleRows}
            mode="server"
            busyKey={props.busyKey}
            filterActive={filterActive}
            filterEmptyState={
              filterActive ? (
                <EmptyState
                  layout="stacked"
                  icon={<PuzzlePiece size={24} />}
                  title="No mods match these filters"
                  description="Clear search or Status to see the full inventory."
                  action={
                    <Button variant="default" onClick={() => setInventoryFilter(EMPTY_SERVER_MODS_INVENTORY_FILTER)}>
                      Clear filters
                    </Button>
                  }
                />
              ) : undefined
            }
            onInspect={props.onInspect}
            onAdd={() => undefined}
            onToggle={props.onToggle}
            onRemove={props.onRemove}
            onOpenExternal={props.onOpenExternal}
            onSetPassive={props.onSetPassive}
            onReorder={props.onReorder}
            onCopyProjectId={props.onCopyProjectId}
            onCopyCurseForgeUrl={props.onCopyCurseForgeUrl}
          />
        )}
      </div>
    </div>
  );
}
