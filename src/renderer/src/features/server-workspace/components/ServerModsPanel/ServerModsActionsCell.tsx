import type { ReactElement } from "react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  ArrowSquareOut,
  MagnifyingGlass,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { confirmRemoveServerMod } from "./confirmRemoveServerMod";
import type { ModRow } from "./serverModsModel";

interface Props {
  row: ModRow;
  mode: "server" | "discover";
  busy: boolean;
  onInspect: (row: ModRow) => void;
  onAdd: (row: ModRow) => void;
  onRemove: (id: string) => void;
  onOpenExternal: (url: string) => void;
}

/**
 * Icon-only row actions for Mods (details, CurseForge, add/remove).
 * Context menu still reuses `buildServerModsRowActions` on the table.
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
      {props.mode === "discover" ? (
        <Tooltip
          label={row.configured ? "Already added" : `Add ${row.name}`}
          withArrow
        >
          <ActionIcon
            variant={row.configured ? "transparent" : "subtle"}
            size="sm"
            color="teal"
            aria-label={row.configured ? `Already added ${row.name}` : `Add ${row.name}`}
            loading={props.busy}
            disabled={row.configured || props.busy}
            styles={
              row.configured
                ? { root: { backgroundColor: "transparent" } }
                : undefined
            }
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
