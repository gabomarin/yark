import type { ReactElement } from "react";
import {
  Group,
  Loader,
  Switch,
  Text,
} from "@mantine/core";
import type { DataTableColumn } from "mantine-datatable";
import { ModIdentityCell } from "./ModIdentityCell";
import { ServerModsActionsCell } from "./ServerModsActionsCell";
import type { ModRow } from "./serverModsModel";
import { isModsListBusy } from "./serverModsBusy";

export { MODS_REORDER_BUSY_KEY, isModsListBusy } from "./serverModsBusy";

export function isModRowBusy(busyKey: string | null, row: ModRow): boolean {
  return (
    isModsListBusy(busyKey)
    || busyKey === row.id
    || busyKey === row.slug
    || busyKey === `detail:${row.slug}`
  );
}

export function buildServerModsTableColumns(input: {
  mode: "server" | "discover";
  busyKey: string | null;
  dragColumn: boolean;
  onInspect: (row: ModRow) => void;
  onAdd: (row: ModRow) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onOpenExternal: (url: string) => void;
}): DataTableColumn<ModRow>[] {
  const columns: DataTableColumn<ModRow>[] = [];

  if (input.dragColumn) {
    columns.push({
      accessor: "drag",
      title: "",
      width: 36,
      hiddenContent: true,
    });
    columns.push({
      accessor: "loadIndex",
      title: "#",
      width: 44,
      render: (row) => (
        <Text size="sm" c="dimmed" ff="monospace">
          {row.loadIndex + 1}
        </Text>
      ),
    });
  }

  if (input.mode === "server") {
    columns.push({
      accessor: "enabled",
      title: "Enabled",
      width: 88,
      render: (row) =>
        row.id === null ? null : (
          <div onClick={(event) => event.stopPropagation()}>
            <Switch
              checked={row.enabled}
              disabled={isModRowBusy(input.busyKey, row)}
              aria-label={`${row.enabled ? "Disable" : "Enable"} ${row.name}`}
              // Mantine trackLabel is aria-hidden but still intercepts hits; keep
              // the input as the real click target for mouse + Playwright.
              styles={{ trackLabel: { pointerEvents: "none" } }}
              onChange={(event) =>
                input.onToggle(row.id!, event.currentTarget.checked)}
            />
          </div>
        ),
    });
  }

  columns.push(
    {
      accessor: "name",
      title: "Mod",
      sortable: true,
      render: (row) => <ModIdentityCell row={row} />,
    },
    {
      accessor: "id",
      title: "Project ID",
      width: 110,
      render: (row) => (
        <Text ff="monospace" size="sm">{row.id ?? "On add"}</Text>
      ),
    },
    {
      accessor: "downloadCount",
      title: "Downloads",
      width: 110,
      sortable: true,
      render: (row) =>
        input.busyKey === `detail:${row.slug}` ? (
          <Group gap="xs" wrap="nowrap">
            <Loader size="xs" />
            <Text size="xs" c="dimmed">Loading…</Text>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            {row.downloads}
          </Text>
        ),
    },
    {
      accessor: "updatedAt",
      title: "Updated",
      width: 100,
      sortable: true,
      render: (row) => (
        <Text size="xs" c="dimmed">{row.updated}</Text>
      ),
    },
    {
      accessor: "actions",
      title: "",
      width: 112,
      textAlign: "right",
      render: (row): ReactElement => (
        <div onClick={(event) => event.stopPropagation()}>
          <ServerModsActionsCell
            row={row}
            mode={input.mode}
            busy={isModRowBusy(input.busyKey, row)}
            onInspect={input.onInspect}
            onAdd={input.onAdd}
            onRemove={input.onRemove}
            onOpenExternal={input.onOpenExternal}
          />
        </div>
      ),
    },
  );

  return columns;
}
