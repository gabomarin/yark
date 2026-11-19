import type { ReactElement } from "react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import { ArrowSquareOut, Broom, FolderOpen, MagnifyingGlass, Plus, Trash } from "@phosphor-icons/react";
import { confirmRemoveServerMod } from "./confirmRemoveServerMod";
import {
  CLEAR_DOWNLOADED_FILES_LABEL,
  NO_LOCAL_MOD_FILES_YET,
  STOP_SERVER_BEFORE_DELETE_MOD_FILES,
} from "./serverModsRowActions";
import type { ModRow } from "./serverModsModel";

interface Props {
  row: ModRow;
  mode: "server" | "discover";
  busy: boolean;
  /** Disables Clear downloaded files while the server is active (#702). */
  serverActive?: boolean;
  /** Enables Open local folder / Clear when ASA folders exist (#702). */
  hasLocalFiles?: boolean;
  onInspect: (row: ModRow) => void;
  onAdd: (row: ModRow) => void;
  onRemove: (id: string) => void;
  onOpenExternal: (url: string) => void;
  onOpenLocalFolder?: (row: ModRow) => void;
  onClearDownloadedFiles?: (row: ModRow) => void;
}

/**
 * Icon-only row actions for Mods (details, CurseForge, local folder, clear files, add/remove).
 * Passive load is its own column; context menu mirrors these (#702).
 */
export function ServerModsActionsCell(props: Props): ReactElement {
  const { row } = props;
  const curseForgeDisabled = row.url === null || props.busy;
  const noLocalFiles = props.hasLocalFiles !== true;
  const openDisabled = props.busy || noLocalFiles;
  const clearDisabled = props.busy || props.serverActive === true || noLocalFiles;
  const clearTooltip = noLocalFiles
    ? NO_LOCAL_MOD_FILES_YET
    : props.serverActive === true
      ? STOP_SERVER_BEFORE_DELETE_MOD_FILES
      : CLEAR_DOWNLOADED_FILES_LABEL;

  return (
    <Group gap={4} justify="flex-end" wrap="nowrap">
      <Tooltip label="View details" withArrow>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={`View details ${row.name}`}
          disabled={props.busy}
          onClick={() => props.onInspect(row)}
        >
          <MagnifyingGlass size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Open CurseForge" withArrow>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={`Open CurseForge ${row.name}`}
          disabled={curseForgeDisabled}
          onClick={() => {
            if (row.url === null) return;
            props.onOpenExternal(row.url);
          }}
        >
          <ArrowSquareOut size={16} />
        </ActionIcon>
      </Tooltip>
      {props.mode === "server" && row.id !== null && props.onOpenLocalFolder !== undefined ? (
        <Tooltip label={noLocalFiles ? NO_LOCAL_MOD_FILES_YET : "Open local folder"} withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Open local folder ${row.name}`}
            disabled={openDisabled}
            onClick={() => props.onOpenLocalFolder?.(row)}
          >
            <FolderOpen size={16} />
          </ActionIcon>
        </Tooltip>
      ) : null}
      {props.mode === "server" && row.id !== null && props.onClearDownloadedFiles !== undefined ? (
        <Tooltip label={clearTooltip} withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`${CLEAR_DOWNLOADED_FILES_LABEL} ${row.name}`}
            disabled={clearDisabled}
            onClick={() => props.onClearDownloadedFiles?.(row)}
          >
            <Broom size={16} />
          </ActionIcon>
        </Tooltip>
      ) : null}
      {props.mode === "discover" ? (
        <Tooltip label={row.configured ? "Already added" : `Add ${row.name}`} withArrow>
          <ActionIcon
            variant={row.configured ? "transparent" : "subtle"}
            size="sm"
            color="ok"
            aria-label={row.configured ? `Already added ${row.name}` : `Add ${row.name}`}
            loading={props.busy}
            disabled={row.configured || props.busy}
            styles={row.configured ? { root: { backgroundColor: "transparent" } } : undefined}
            onClick={() => props.onAdd(row)}
          >
            <Plus size={16} />
          </ActionIcon>
        </Tooltip>
      ) : row.id !== null ? (
        <Tooltip label={`Remove ${row.name}`} withArrow>
          <ActionIcon
            color="red"
            variant="subtle"
            size="sm"
            aria-label={`Remove ${row.name}`}
            disabled={props.busy}
            onClick={() => confirmRemoveServerMod(row, props.onRemove)}
          >
            <Trash size={16} />
          </ActionIcon>
        </Tooltip>
      ) : null}
    </Group>
  );
}
