import {
  ArrowDown,
  ArrowLineDown,
  ArrowLineUp,
  ArrowSquareOut,
  ArrowUp,
  Broom,
  Copy,
  FolderOpen,
  MagnifyingGlass,
  Moon,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import type { RowActionEntry } from "@ui/RowActionMenu/rowActionModel";
import { canMoveModIdInLoadOrder, type ModLoadOrderMove, type ModRow } from "./serverModsModel";

const ICON = 16;

export const STOP_SERVER_BEFORE_DELETE_MOD_FILES = "Stop the server before deleting mod files.";

export const NO_LOCAL_MOD_FILES_YET = "No local files for this mod yet.";

/** Operator label: open ASA `{projectId}_{fileId}` folders in Explorer (#702). */
export const OPEN_LOCAL_FOLDER_LABEL = "Open local folder";

/** Operator label: deletes local ASA folders only; Start downloads again (#702). */
export const CLEAR_DOWNLOADED_FILES_LABEL = "Clear downloaded files";

/** Disabled-only title (omit when the action is available). */
export function clearDownloadedFilesDisabledTitle(input: {
  hasLocalFiles: boolean;
  serverActive: boolean;
}): string | undefined {
  if (!input.hasLocalFiles) return NO_LOCAL_MOD_FILES_YET;
  if (input.serverActive) return STOP_SERVER_BEFORE_DELETE_MOD_FILES;
  return undefined;
}

export interface ServerModsRowActionInput {
  row: ModRow;
  mode: "server" | "discover";
  busy: boolean;
  /** True while this server (or ops lock) is active — disables Clear downloaded files (#702). */
  serverActive?: boolean;
  /** True when `{projectId}_{fileId}` folders exist under the install (#702). */
  hasLocalFiles?: boolean;
  onInspect: (row: ModRow) => void;
  onAdd: (row: ModRow) => void;
  onRemove: (row: ModRow) => void;
  onOpenExternal: (url: string) => void;
  /** Toggle passive load (`-passivemods=` only). Server mode, enabled rows. */
  onSetPassive?: (row: ModRow) => void;
  onCopyProjectId?: (row: ModRow) => void;
  onCopyCurseForgeUrl?: (row: ModRow) => void;
  onOpenLocalFolder?: (row: ModRow) => void;
  onClearDownloadedFiles?: (row: ModRow) => void;
  /** Full profile load order — enables Move actions (#638). */
  loadOrderIds?: readonly string[];
  onMoveLoadOrder?: (row: ModRow, move: ModLoadOrderMove) => void;
}

export function buildServerModsRowActions(input: ServerModsRowActionInput): RowActionEntry[] {
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

  if (input.mode === "server") {
    entries.push(
      {
        kind: "item",
        key: "copy-id",
        label: "Copy Project ID",
        icon: <Copy size={ICON} />,
        disabled: input.row.id === null || input.onCopyProjectId === undefined,
        onClick: () => {
          input.onCopyProjectId?.(input.row);
        },
      },
      {
        kind: "item",
        key: "copy-url",
        label: "Copy CurseForge URL",
        icon: <Copy size={ICON} />,
        disabled: input.row.url === null || input.onCopyCurseForgeUrl === undefined,
        onClick: () => {
          input.onCopyCurseForgeUrl?.(input.row);
        },
      },
    );
  }

  if (input.mode === "server" && input.row.id !== null && input.onSetPassive !== undefined) {
    entries.push({
      kind: "item",
      key: "passive",
      label: input.row.passive ? "Mark as active" : "Mark as passive",
      icon: <Moon size={ICON} weight={input.row.passive ? "fill" : "regular"} />,
      // Passive implies enabled: an off row has to be enabled first.
      disabled: input.busy || !input.row.enabled,
      onClick: () => {
        input.onSetPassive?.(input.row);
      },
    });
  }

  if (
    input.mode === "server" &&
    input.row.id !== null &&
    input.onMoveLoadOrder !== undefined &&
    input.loadOrderIds !== undefined
  ) {
    const id = input.row.id;
    const loadOrderIds = input.loadOrderIds;
    const moveDisabled = (move: ModLoadOrderMove): boolean =>
      input.busy || !canMoveModIdInLoadOrder(loadOrderIds, id, move);
    entries.push(
      { kind: "divider", key: "div-load-order" },
      {
        kind: "item",
        key: "move-top",
        label: "Move to top",
        icon: <ArrowLineUp size={ICON} />,
        disabled: moveDisabled("top"),
        onClick: () => input.onMoveLoadOrder?.(input.row, "top"),
      },
      {
        kind: "item",
        key: "move-up",
        label: "Move up",
        icon: <ArrowUp size={ICON} />,
        disabled: moveDisabled("up"),
        onClick: () => input.onMoveLoadOrder?.(input.row, "up"),
      },
      {
        kind: "item",
        key: "move-down",
        label: "Move down",
        icon: <ArrowDown size={ICON} />,
        disabled: moveDisabled("down"),
        onClick: () => input.onMoveLoadOrder?.(input.row, "down"),
      },
      {
        kind: "item",
        key: "move-bottom",
        label: "Move to bottom",
        icon: <ArrowLineDown size={ICON} />,
        disabled: moveDisabled("bottom"),
        onClick: () => input.onMoveLoadOrder?.(input.row, "bottom"),
      },
    );
  }

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
    if (input.onOpenLocalFolder !== undefined) {
      const openDisabled = input.busy || input.hasLocalFiles !== true;
      entries.push({
        kind: "item",
        key: "open-local-folder",
        label: OPEN_LOCAL_FOLDER_LABEL,
        icon: <FolderOpen size={ICON} />,
        disabled: openDisabled,
        title: input.hasLocalFiles !== true ? NO_LOCAL_MOD_FILES_YET : undefined,
        onClick: () => {
          input.onOpenLocalFolder?.(input.row);
        },
      });
    }
    if (input.onClearDownloadedFiles !== undefined) {
      const hasLocalFiles = input.hasLocalFiles === true;
      const serverActive = input.serverActive === true;
      const clearDisabled = input.busy || serverActive || !hasLocalFiles;
      entries.push({
        kind: "item",
        key: "clear-downloaded-files",
        label: CLEAR_DOWNLOADED_FILES_LABEL,
        icon: <Broom size={ICON} />,
        disabled: clearDisabled,
        title: clearDownloadedFilesDisabledTitle({ hasLocalFiles, serverActive }),
        onClick: () => {
          input.onClearDownloadedFiles?.(input.row);
        },
      });
    }
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
