import { ArrowSquareOut, MagnifyingGlass, Plus, Trash } from "@phosphor-icons/react";
import type { RowActionEntry } from "@ui/RowActionMenu/rowActionModel";
import type { ModRow } from "./serverModsModel";

const ICON = 16;

export interface ServerModsRowActionInput {
  row: ModRow;
  mode: "server" | "discover";
  busy: boolean;
  onInspect: (row: ModRow) => void;
  onAdd: (row: ModRow) => void;
  onRemove: (row: ModRow) => void;
  onOpenExternal: (url: string) => void;
}

export function buildServerModsRowActions(
  input: ServerModsRowActionInput,
): RowActionEntry[] {
  const entries: RowActionEntry[] = [
    {
      kind: "item",
      key: "inspect",
      label: "View details",
      icon: <MagnifyingGlass size={ICON} />,
      onClick: () => {
        input.onInspect(input.row);
      },
    },
    {
      kind: "item",
      key: "curseforge",
      label: "Open CurseForge",
      icon: <ArrowSquareOut size={ICON} />,
      disabled: input.row.url === null,
      onClick: () => {
        if (input.row.url === null) return;
        input.onOpenExternal(input.row.url);
      },
    },
  ];

  if (input.mode === "discover") {
    entries.push({
      kind: "item",
      key: "add",
      label: input.row.configured ? "Already added" : "Add mod",
      icon: <Plus size={ICON} />,
      disabled: input.busy || input.row.configured,
      onClick: () => {
        input.onAdd(input.row);
      },
    });
  } else if (input.row.id !== null) {
    entries.push(
      { kind: "divider", key: "div-danger" },
      {
        kind: "item",
        key: "remove",
        label: `Remove ${input.row.name}`,
        color: "red",
        icon: <Trash size={ICON} />,
        disabled: input.busy,
        onClick: () => {
          input.onRemove(input.row);
        },
      },
    );
  }

  return entries;
}
