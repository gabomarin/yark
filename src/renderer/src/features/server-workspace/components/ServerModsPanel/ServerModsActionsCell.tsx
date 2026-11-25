import type { ReactElement } from "react";
import { ActionIcon, Group, Menu, Tooltip } from "@mantine/core";
import { ArrowSquareOut, DotsThreeVertical, MagnifyingGlass, Plus, Trash } from "@phosphor-icons/react";
import { RowActionMenuItems } from "@ui/RowActionMenu/RowActionMenuItems";
import { confirmRemoveServerMod } from "./confirmRemoveServerMod";
import { buildServerModsRowActions } from "./serverModsRowActions";
import type { ModLoadOrderMove, ModRow } from "./serverModsModel";

interface Props {
  row: ModRow;
  mode: "server" | "discover";
  busy: boolean;
  serverActive?: boolean;
  hasLocalFiles?: boolean;
  loadOrderIds?: readonly string[];
  onInspect: (row: ModRow) => void;
  onAdd: (row: ModRow) => void;
  onRemove: (id: string) => void;
  onOpenExternal: (url: string) => void;
  onSetPassive?: (row: ModRow) => void;
  onCopyProjectId?: (row: ModRow) => void;
  onCopyCurseForgeUrl?: (row: ModRow) => void;
  onOpenLocalFolder?: (row: ModRow) => void;
  onClearDownloadedFiles?: (row: ModRow) => void;
  onMoveLoadOrder?: (row: ModRow, move: ModLoadOrderMove) => void;
}

/**
 * Primary icons as shortcuts. Discover: Add + View + Open CurseForge (no kebab).
 * Server: View + kebab + Remove; kebab/right-click share the full list (#638).
 */
export function ServerModsActionsCell(props: Props): ReactElement {
  if (props.mode === "discover") {
    return (
      <DiscoverModsActions
        row={props.row}
        busy={props.busy}
        onAdd={props.onAdd}
        onInspect={props.onInspect}
        onOpenExternal={props.onOpenExternal}
      />
    );
  }
  return <ServerInventoryModsActions {...props} />;
}

function DiscoverModsActions(props: {
  row: ModRow;
  busy: boolean;
  onAdd: (row: ModRow) => void;
  onInspect: (row: ModRow) => void;
  onOpenExternal: (url: string) => void;
}): ReactElement {
  const { row } = props;
  const curseForgeDisabled = props.busy || row.url === null;

  return (
    <Group gap={4} justify="flex-end" wrap="nowrap">
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
    </Group>
  );
}

function ServerInventoryModsActions(props: Props): ReactElement {
  const { row } = props;
  const menuEntries = buildServerModsRowActions({
    row,
    mode: "server",
    busy: props.busy,
    serverActive: props.serverActive,
    hasLocalFiles: props.hasLocalFiles,
    loadOrderIds: props.loadOrderIds,
    onInspect: props.onInspect,
    onAdd: props.onAdd,
    onRemove: (target) => {
      confirmRemoveServerMod(target, props.onRemove);
    },
    onOpenExternal: props.onOpenExternal,
    onSetPassive: props.onSetPassive,
    onCopyProjectId: props.onCopyProjectId,
    onCopyCurseForgeUrl: props.onCopyCurseForgeUrl,
    onOpenLocalFolder: props.onOpenLocalFolder,
    onClearDownloadedFiles: props.onClearDownloadedFiles,
    onMoveLoadOrder: props.onMoveLoadOrder,
  });

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
      <Menu shadow="md" withinPortal position="bottom-end">
        <Menu.Target>
          <Tooltip label="More actions" withArrow>
            <ActionIcon variant="subtle" size="sm" aria-label={`More actions ${row.name}`} disabled={props.busy}>
              <DotsThreeVertical size={16} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <RowActionMenuItems entries={menuEntries} />
        </Menu.Dropdown>
      </Menu>
      {row.id !== null ? (
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
