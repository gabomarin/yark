import type { ReactElement, MouseEvent } from "react";
import { useId } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Tooltip,
} from "@mantine/core";
import { DotsThreeVertical, Plus, Trash } from "@phosphor-icons/react";
import { useRowActionMenuApi } from "@ui/RowActionMenu/RowActionMenuProvider";
import { confirmRemoveServerMod } from "./confirmRemoveServerMod";
import { buildServerModsRowActions } from "./serverModsRowActions";
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
 * Row actions for Mods. Kebab opens the shared RowActionMenu portal so a table
 * remount (status push / DataTable refresh) does not dismiss an open menu.
 */
export function ServerModsActionsCell(props: Props): ReactElement {
  const { row } = props;
  const sourceId = useId();
  const { openAt } = useRowActionMenuApi();
  const menuEntries = buildServerModsRowActions({
    row,
    mode: props.mode,
    busy: props.busy,
    onInspect: props.onInspect,
    onAdd: props.onAdd,
    onRemove: (target: ModRow) => {
      confirmRemoveServerMod(target, props.onRemove);
    },
    onOpenExternal: props.onOpenExternal,
  });

  const openKebab = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    openAt(sourceId, menuEntries, rect.right, rect.bottom);
  };

  return (
    <Group gap="xs" justify="flex-end" wrap="nowrap">
      {props.mode === "discover" ? (
        <Button
          size="compact-sm"
          leftSection={<Plus size={14} />}
          loading={props.busy}
          disabled={row.configured}
          onClick={() => props.onAdd(row)}
        >
          {row.configured ? "Added" : "Add"}
        </Button>
      ) : row.id !== null && (
        <Tooltip label={`Remove ${row.name}`}>
          <ActionIcon
            color="red"
            variant="subtle"
            aria-label={`Remove ${row.name}`}
            disabled={props.busy}
            onClick={() => confirmRemoveServerMod(row, props.onRemove)}
          >
            <Trash size={17} />
          </ActionIcon>
        </Tooltip>
      )}
      <Tooltip label="More options" withArrow>
        <ActionIcon
          variant="default"
          size="sm"
          aria-label={`More options ${row.name}`}
          onClick={openKebab}
        >
          <DotsThreeVertical size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
