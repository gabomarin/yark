import type { ReactElement } from "react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import { ArrowSquareOut, MagnifyingGlass, Plus, Trash } from "@phosphor-icons/react";
import { confirmRemoveServerMod } from "./confirmRemoveServerMod";
import { ServerModsLocalFileActions } from "./ServerModsLocalFileActions";
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
      {props.mode === "server" ? (
        <ServerModsLocalFileActions
          row={row}
          busy={props.busy}
          serverActive={props.serverActive === true}
          hasLocalFiles={props.hasLocalFiles === true}
          onOpenLocalFolder={props.onOpenLocalFolder}
          onClearDownloadedFiles={props.onClearDownloadedFiles}
        />
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
