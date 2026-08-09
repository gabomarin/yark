import type { ReactElement } from "react";
import { Table } from "@mantine/core";
import { ServerModsTableRow } from "./ServerModsTableRow";
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
            <ServerModsTableRow
              key={row.key}
              row={row}
              mode={props.mode}
              busyKey={props.busyKey}
              onInspect={props.onInspect}
              onAdd={props.onAdd}
              onToggle={props.onToggle}
              onRemove={props.onRemove}
              onOpenExternal={props.onOpenExternal}
            />
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}
