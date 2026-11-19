import { ArrowSquareOut, Broom, Copy, FolderOpen, MagnifyingGlass, Moon, Plus, Trash } from "@phosphor-icons/react";
import type { RowActionEntry } from "@ui/RowActionMenu/rowActionModel";
import type { ModRow } from "./serverModsModel";

const ICON = 16;

export const STOP_SERVER_BEFORE_DELETE_MOD_FILES = "Stop the server before deleting mod files.";

export const NO_LOCAL_MOD_FILES_YET = "No local files for this mod yet.";

/** Operator label: deletes local ASA folders only; Start downloads again (#702). */
export const CLEAR_DOWNLOADED_FILES_LABEL = "Clear downloaded files";

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
        label: "Open local folder",
        icon: <FolderOpen size={ICON} />,
        disabled: openDisabled,
        title: input.hasLocalFiles !== true ? NO_LOCAL_MOD_FILES_YET : undefined,
        onClick: () => {
          input.onOpenLocalFolder?.(input.row);
        },
      });
    }
    if (input.onClearDownloadedFiles !== undefined) {
      const clearDisabled = input.busy || input.serverActive === true || input.hasLocalFiles !== true;
      const clearTitle =
        input.hasLocalFiles !== true
          ? NO_LOCAL_MOD_FILES_YET
          : input.serverActive === true
            ? STOP_SERVER_BEFORE_DELETE_MOD_FILES
            : undefined;
      entries.push({
        kind: "item",
        key: "clear-downloaded-files",
        label: CLEAR_DOWNLOADED_FILES_LABEL,
        icon: <Broom size={ICON} />,
        disabled: clearDisabled,
        title: clearTitle,
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
