import type { ReactElement } from "react";
import { Loader } from "@mantine/core";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { ServerModsSearchInput } from "./ServerModsSearchInput";
import { ServerModsTable } from "./ServerModsTable";
import type { ModRow } from "./serverModsModel";

interface Props {
  query: string;
  searching: boolean;
  busyKey: string | null;
  rows: ModRow[];
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onInspect: (row: ModRow) => void;
  onAdd: (row: ModRow) => void;
  onOpenExternal: (url: string) => void;
}

export function ServerModsDiscoverSection(props: Props): ReactElement {
  return (
    <>
      <ServerModsSearchInput
        value={props.query}
        searching={props.searching}
        onChange={props.onQueryChange}
        onSearch={props.onSearch}
      />
      {props.searching && props.rows.length === 0 ? (
        <Loader size="sm" />
      ) : props.rows.length === 0 ? (
        <EmptyState
          layout="stacked"
          icon={<MagnifyingGlass size={24} />}
          title="Search the CurseForge catalog"
          description="Results stay separate from the mods configured on this server."
        />
      ) : (
        <ServerModsTable
          rows={props.rows}
          mode="discover"
          busyKey={props.busyKey}
          onInspect={props.onInspect}
          onAdd={props.onAdd}
          onToggle={() => undefined}
          onRemove={() => undefined}
          onOpenExternal={props.onOpenExternal}
        />
      )}
    </>
  );
}
