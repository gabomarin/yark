import type { ReactElement } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Switch,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { ArrowSquareOut, Plus, Trash } from "@phosphor-icons/react";
import { ModThumbnail } from "./ModThumbnail";
import type { ModRow } from "./serverModsModel";
import classes from "./ServerModsPanel.module.css";

interface Props {
  rows: ModRow[];
  mode: "server" | "discover";
  busyKey: string | null;
  onInspect: (row: ModRow) => void;
  onAdd: (row: ModRow) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onOpenExternal: (url: string) => void;
}

export function ServerModsTable(props: Props): ReactElement {
  return (
    <div className={classes.tableViewport}>
      <Table
        className={`${classes.table} ${
          props.mode === "server" ? classes.serverTable : classes.discoveryTable
        }`}
        verticalSpacing="sm"
      >
        <Table.Thead>
          <Table.Tr>
            {props.mode === "server" && <Table.Th>Enabled</Table.Th>}
            <Table.Th>Mod</Table.Th>
            <Table.Th>Project ID</Table.Th>
            <Table.Th>Metadata</Table.Th>
            <Table.Th>URL</Table.Th>
            <Table.Th aria-label="Actions" />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {props.rows.map((row) => (
            <Table.Tr
              key={row.key}
              className={classes.clickableRow}
              tabIndex={0}
              onClick={() => props.onInspect(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  props.onInspect(row);
                }
              }}
            >
              {props.mode === "server" && row.id !== null && (
                <Table.Td onClick={(event) => event.stopPropagation()}>
                  <Switch
                    checked={row.enabled}
                    disabled={props.busyKey === row.id}
                    aria-label={`${row.enabled ? "Disable" : "Enable"} ${row.name}`}
                    onChange={(event) =>
                      props.onToggle(row.id!, event.currentTarget.checked)}
                  />
                </Table.Td>
              )}
              <Table.Td>
                <Group wrap="nowrap">
                  <ModThumbnail src={row.thumbnailUrl} />
                  <div className={classes.identity}>
                    <Text fw={600} size="sm" lineClamp={1}>{row.name}</Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>{row.author}</Text>
                  </div>
                </Group>
              </Table.Td>
              <Table.Td>
                <Text ff="monospace" size="sm">{row.id ?? "On add"}</Text>
              </Table.Td>
              <Table.Td>
                {props.busyKey === `detail:${row.slug}` ? (
                  <Group gap="xs" wrap="nowrap">
                    <Loader size="xs" />
                    <Text size="xs" c="dimmed">Loading metadata…</Text>
                  </Group>
                ) : (
                  <>
                    <Text size="xs" lineClamp={1}>
                      {row.category ?? "Uncategorized"}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {row.downloads} · {row.updated}
                    </Text>
                  </>
                )}
              </Table.Td>
              <Table.Td>
                <Button
                  variant="subtle"
                  size="compact-sm"
                  leftSection={<ArrowSquareOut size={14} />}
                  disabled={row.url === null}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (row.url === null) return;
                    props.onOpenExternal(row.url);
                  }}
                >
                  CurseForge
                </Button>
              </Table.Td>
              <Table.Td onClick={(event) => event.stopPropagation()}>
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  {props.mode === "discover" ? (
                    <Button
                      size="compact-sm"
                      leftSection={<Plus size={14} />}
                      loading={props.busyKey === row.slug}
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
                        disabled={props.busyKey === row.id}
                        onClick={() => confirmRemove(row, props.onRemove)}
                      >
                        <Trash size={17} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}

function confirmRemove(row: ModRow, onRemove: (id: string) => void): void {
  if (row.id === null) return;
  modals.openConfirmModal({
    title: "Remove mod?",
    children: (
      <Text size="sm">
        Remove <strong>{row.name}</strong> from this server and discard its
        cached metadata?
      </Text>
    ),
    labels: { confirm: "Remove mod", cancel: "Cancel" },
    confirmProps: { color: "red" },
    onConfirm: () => onRemove(row.id!),
  });
}
