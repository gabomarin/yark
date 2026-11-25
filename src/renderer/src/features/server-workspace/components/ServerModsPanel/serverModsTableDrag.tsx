import type { ReactElement, ReactNode } from "react";
import { Droppable } from "@hello-pangea/dnd";
import type { DataTableSortStatus } from "mantine-datatable";
import type { ModRow } from "./serverModsModel";

/** Sentinel: not a sortable column — means canonical load-order / default catalog view. */
export const LOAD_ORDER_SORT: DataTableSortStatus<ModRow> = {
  columnAccessor: "loadIndex",
  direction: "asc",
};

export function dragReorderTooltip(input: {
  dragEnabled: boolean;
  filterActive: boolean;
  viewSorted: boolean;
}): string {
  if (input.dragEnabled) return "Drag to change load order";
  if (input.filterActive) return "Clear filter to reorder";
  if (input.viewSorted) return "Clear column sort to reorder";
  return "Reorder unavailable while busy";
}

// mantine-datatable renders tableWrapper as a component type. Keep it stable so
// controlled row updates do not remount the table DOM and cancel transitions.
export function ServerModsTableWrapper({ children }: { children: ReactNode }): ReactElement {
  return (
    <Droppable droppableId="server-mods">
      {(provided) => (
        <div {...provided.droppableProps} ref={provided.innerRef}>
          {children}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}
