import type { ReactElement } from "react";
import { useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Center,
  Group,
  TableTd,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { DotsSixVertical } from "@phosphor-icons/react";
import type { DataTableSortStatus } from "mantine-datatable";
import { DataTableDraggableRow } from "mantine-datatable";
import { useRowActionMenuApi } from "@ui/RowActionMenu/RowActionMenuProvider";
import { YarkDataTable } from "@ui/YarkDataTable/YarkDataTable";
import { confirmRemoveServerMod } from "./confirmRemoveServerMod";
import {
  buildServerModsTableColumns,
  isModRowBusy,
} from "./serverModsTableColumns";
import { buildServerModsRowActions } from "./serverModsRowActions";
import {
  sortModRows,
  type ModRow,
  type ModRowSortAccessor,
  type ModRowSortStatus,
} from "./serverModsModel";
import classes from "./ServerModsPanel.module.css";

const CONTEXT_SOURCE_ID = "server-mods-table";

/** Sentinel: not a sortable column — means canonical load-order view. */
const LOAD_ORDER_SORT: DataTableSortStatus<ModRow> = {
  columnAccessor: "loadIndex",
  direction: "asc",
};

interface Props {
  rows: ModRow[];
  mode: "server" | "discover";
  busyKey: string | null;
  onInspect: (row: ModRow) => void;
  onAdd: (row: ModRow) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onOpenExternal: (url: string) => void;
  /** Persist load-order change (server mode only). */
  onReorder?: (orderedIds: string[]) => void;
}

function toSortStatus(
  status: DataTableSortStatus<ModRow>,
): ModRowSortStatus | null {
  const accessor = String(status.columnAccessor);
  if (
    accessor !== "name"
    && accessor !== "downloadCount"
    && accessor !== "updatedAt"
  ) {
    return null;
  }
  return {
    columnAccessor: accessor as ModRowSortAccessor,
    direction: status.direction,
  };
}

/**
 * Mods inventory as YarkDataTable (#94): thumbs, actions, column view-sort,
 * and load-order drag only while unsorted (Mod Organizer dual-order model).
 */
export function ServerModsTable(props: Props): ReactElement {
  const { openAt } = useRowActionMenuApi();
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<ModRow>>(
    LOAD_ORDER_SORT,
  );
  const viewSorted = String(sortStatus.columnAccessor) !== "loadIndex";
  const useDnD = props.mode === "server" && props.onReorder !== undefined;
  // Block drag while any row mutation (or reorder persist) is in flight.
  const dragEnabled = useDnD && !viewSorted && props.busyKey === null;

  const records = useMemo(
    () => sortModRows(props.rows, toSortStatus(sortStatus)),
    [props.rows, sortStatus],
  );

  // Stable handler identities so column defs (and cell Menus) are not rebuilt on
  // every parent render from App status pushes.
  const handlersRef = useRef({
    onInspect: props.onInspect,
    onAdd: props.onAdd,
    onToggle: props.onToggle,
    onRemove: props.onRemove,
    onOpenExternal: props.onOpenExternal,
    onReorder: props.onReorder,
  });
  handlersRef.current = {
    onInspect: props.onInspect,
    onAdd: props.onAdd,
    onToggle: props.onToggle,
    onRemove: props.onRemove,
    onOpenExternal: props.onOpenExternal,
    onReorder: props.onReorder,
  };

  const columns = useMemo(
    () =>
      buildServerModsTableColumns({
        mode: props.mode,
        busyKey: props.busyKey,
        dragColumn: props.mode === "server",
        onInspect: (row) => handlersRef.current.onInspect(row),
        onAdd: (row) => handlersRef.current.onAdd(row),
        onToggle: (id, enabled) => handlersRef.current.onToggle(id, enabled),
        onRemove: (id) => handlersRef.current.onRemove(id),
        onOpenExternal: (url) => handlersRef.current.onOpenExternal(url),
      }),
    [props.mode, props.busyKey],
  );

  const handleDragEnd = (result: DropResult) => {
    if (!dragEnabled || !result.destination) return;
    if (result.source.index === result.destination.index) return;
    const orderedIds = records
      .map((row) => row.id)
      .filter((id): id is string => id !== null);
    const next = [...orderedIds];
    const [moved] = next.splice(result.source.index, 1);
    if (moved === undefined) return;
    next.splice(result.destination.index, 0, moved);
    handlersRef.current.onReorder?.(next);
  };

  const table = (
    <YarkDataTable
      className={`${classes.modsTable} ${
        props.mode === "server" ? classes.serverTable : classes.discoveryTable
      }`}
      idAccessor="key"
      records={records}
      columns={columns}
      minHeight={160}
      sortStatus={sortStatus}
      onSortStatusChange={setSortStatus}
      customRowAttributes={(row) => ({
        "data-mod-row": true,
        "data-mod-key": row.key,
      })}
      onRowClick={({ record }) => {
        handlersRef.current.onInspect(record);
      }}
      onRowContextMenu={({ record, event }) => {
        const busy = isModRowBusy(props.busyKey, record);
        const entries = buildServerModsRowActions({
          row: record,
          mode: props.mode,
          busy,
          onInspect: (row) => handlersRef.current.onInspect(row),
          onAdd: (row) => handlersRef.current.onAdd(row),
          onRemove: (target: ModRow) => {
            confirmRemoveServerMod(target, (id) => {
              handlersRef.current.onRemove(id);
            });
          },
          onOpenExternal: (url) => handlersRef.current.onOpenExternal(url),
        });
        event.preventDefault();
        event.stopPropagation();
        openAt(CONTEXT_SOURCE_ID, entries, event.clientX, event.clientY);
      }}
      tableWrapper={
        useDnD
          ? ({ children }) => (
            <Droppable droppableId="server-mods">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {children}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          )
          : undefined
      }
      rowFactory={
        useDnD
          ? ({ record, index, rowProps, children }) => (
            <Draggable
              key={record.key}
              draggableId={record.key}
              index={index}
              isDragDisabled={!dragEnabled}
            >
              {(provided, snapshot) => (
                <DataTableDraggableRow
                  ref={provided.innerRef}
                  isDragging={snapshot.isDragging}
                  {...rowProps}
                  {...provided.draggableProps}
                  className={[rowProps.className, classes.clickableRow]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <TableTd>
                    <Tooltip
                      label={
                        dragEnabled
                          ? "Drag to change load order"
                          : viewSorted
                            ? "Clear column sort to reorder"
                            : "Reorder unavailable while busy"
                      }
                      withArrow
                    >
                      <Center
                        {...(dragEnabled ? provided.dragHandleProps : {})}
                        role="button"
                        tabIndex={dragEnabled ? 0 : -1}
                        aria-disabled={!dragEnabled}
                        className={
                          dragEnabled
                            ? classes.dragHandle
                            : classes.dragHandleDisabled
                        }
                        aria-label={
                          dragEnabled
                            ? `Reorder ${record.name}`
                            : `Reorder unavailable for ${record.name}`
                        }
                      >
                        <DotsSixVertical size={16} />
                      </Center>
                    </Tooltip>
                  </TableTd>
                  {children}
                </DataTableDraggableRow>
              )}
            </Draggable>
          )
          : undefined
      }
    />
  );

  return (
    <div className={classes.tableViewport}>
      {viewSorted ? (
        <Group gap="xs" mb="xs" wrap="wrap">
          <Badge variant="light" color="gray">
            View sorted
          </Badge>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => setSortStatus(LOAD_ORDER_SORT)}
          >
            Clear sort
          </Button>
          <Text size="xs" c="dimmed">
            Load order is unchanged until you clear sort and drag.
          </Text>
        </Group>
      ) : null}
      {useDnD ? (
        <DragDropContext onDragEnd={handleDragEnd}>{table}</DragDropContext>
      ) : (
        table
      )}
    </div>
  );
}
