import type { ReactElement } from "react";
import { CaretRight, Plus } from "@phosphor-icons/react";
import {
  ActionIcon,
  Button,
  Group,
  Text,
  Tooltip,
} from "@mantine/core";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { useMemo, useState } from "react";
import { useUiDensity } from "@app/AppProviders";
import { AddServerSplitButton } from "@features/servers/components/AddServerSplitButton/AddServerSplitButton";
import { ServerListControls } from "@features/servers/components/ServerListControls/ServerListControls";
import { useServerListPreferences } from "@features/servers/hooks/useServerListPreferences";
import { sortServers } from "@features/servers/serverListModel";
import { SearchField } from "@ui/SearchField/SearchField";
import { groupServersByCluster } from "../../workspaceLayoutModel";
import { ServerListPanelBody } from "./ServerListPanelBody";
import classes from "./ServerListPanel.module.css";

interface Props {
  servers: ServerProfile[];
  selectedServerId: string;
  statuses: Map<string, ServerRuntimeInfo>;
  onSelectServer: (serverId: string) => void;
  onAddServer?: () => void;
  onImportServer?: () => void;
  /** Compact icon-rail (#107). */
  iconMode?: boolean;
  /** Explicit Full ↔ Rail toggle (wide layout). */
  onToggleRail?: () => void;
}

export function ServerListPanel(props: Props): ReactElement {
  const [search, setSearch] = useState("");
  const [openClusters, setOpenClusters] = useState<Record<string, boolean>>({});
  const { sort, setSort, view, setView } = useServerListPreferences("workspace");
  const iconMode = props.iconMode === true;
  const density = useUiDensity();
  const compact = density === "compact";
  /** Expand control size: compact sm, else md (#233). */
  const expandSize = compact ? "sm" : "md";
  const addButtonSize = compact ? "xs" : "sm";

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base =
      query.length === 0
        ? props.servers
        : props.servers.filter((server) =>
            [server.name, server.map, server.clusterId ?? ""].some((field) =>
              field.toLowerCase().includes(query),
            ),
          );
    return sortServers(base, sort);
  }, [props.servers, search, sort]);

  const groups = useMemo(() => groupServersByCluster(filtered), [filtered]);

  function isClusterOpen(key: string): boolean {
    const containsSelected = groups
      .find((group) => group.key === key)
      ?.servers.some((server) => server.id === props.selectedServerId);
    if (containsSelected === true) {
      return true;
    }
    return openClusters[key] !== false;
  }

  function toggleCluster(key: string): void {
    setOpenClusters((prev) => ({
      ...prev,
      [key]: !(prev[key] !== false),
    }));
  }

  return (
    <aside className={classes.panel} data-icon-mode={iconMode || undefined}>
      <div className={classes.header} data-icon-mode={iconMode || undefined}>
        {iconMode ? (
          props.onToggleRail !== undefined && (
            <Tooltip label="Expand server list" position="right" withArrow>
              <ActionIcon
                variant="subtle"
                size={expandSize}
                aria-label="Expand server list"
                onClick={props.onToggleRail}
              >
                <CaretRight size={16} />
              </ActionIcon>
            </Tooltip>
          )
        ) : (
          <>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text className={classes.title}>All servers</Text>
              {props.onToggleRail !== undefined && (
                <Tooltip label="Collapse to icon rail">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label="Collapse to icon rail"
                    onClick={props.onToggleRail}
                  >
                    <CaretRight size={14} style={{ transform: "rotate(180deg)" }} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search servers"
              label="Search servers"
              size="xs"
            />
            <div className={classes.listControls}>
              <ServerListControls
                sort={sort}
                onSortChange={setSort}
                view={view}
                onViewChange={setView}
              />
            </div>
          </>
        )}
      </div>

      <ServerListPanelBody
        iconMode={iconMode}
        view={view}
        filtered={filtered}
        groups={groups}
        selectedServerId={props.selectedServerId}
        statuses={props.statuses}
        onSelectServer={props.onSelectServer}
        isClusterOpen={isClusterOpen}
        onToggleCluster={toggleCluster}
      />

      {/* Icon rail is switch-only; Add / Import live on the expanded list (#397). */}
      {props.onAddServer !== undefined && !iconMode && (
        <div className={classes.footer}>
          {props.onImportServer !== undefined ? (
            <AddServerSplitButton
              primaryLabel="Add server"
              onCreate={props.onAddServer}
              onImport={props.onImportServer}
              fullWidth
              size={addButtonSize}
            />
          ) : (
            <Button
              fullWidth
              size={addButtonSize}
              variant="light"
              leftSection={<Plus size={compact ? 14 : 16} />}
              onClick={props.onAddServer}
            >
              Add server
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
