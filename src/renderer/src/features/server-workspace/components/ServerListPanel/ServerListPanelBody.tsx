import type { ReactElement } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { Divider, Stack, Text, UnstyledButton } from "@mantine/core";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { Fragment } from "react";
import type { ServerListViewMode } from "@features/servers/serverListModel";
import type { ServerClusterGroup } from "../../workspaceLayoutModel";
import { ServerListPanelRow } from "./ServerListPanelRow";
import classes from "./ServerListPanel.module.css";

interface Props {
  iconMode: boolean;
  view: ServerListViewMode;
  filtered: ServerProfile[];
  groups: ServerClusterGroup[];
  selectedServerId: string;
  statuses: Map<string, ServerRuntimeInfo>;
  onSelectServer: (serverId: string) => void;
  isClusterOpen: (key: string) => boolean;
  onToggleCluster: (key: string) => void;
}

export function ServerListPanelBody(props: Props): ReactElement {
  const renderRow = (server: ServerProfile, iconMode: boolean): ReactElement => {
    const status = props.statuses.get(server.id)?.status ?? "stopped";
    return (
      <ServerListPanelRow
        key={server.id}
        server={server}
        status={status}
        selected={server.id === props.selectedServerId}
        iconMode={iconMode}
        onSelect={() => props.onSelectServer(server.id)}
      />
    );
  };

  let content: ReactElement;
  if (props.iconMode) {
    content =
      props.view === "ungrouped" ? (
        <>{props.filtered.map((server) => renderRow(server, true))}</>
      ) : (
        <>
          {props.groups.map((group, index) => (
            <Fragment key={group.key}>
              {index > 0 && (
                <Divider
                  className={classes.clusterDivider}
                  aria-label={`${group.label} cluster`}
                />
              )}
              <Stack gap={4} className={classes.clusterRail} role="group" aria-label={group.label}>
                {group.servers.map((server) => renderRow(server, true))}
              </Stack>
            </Fragment>
          ))}
        </>
      );
  } else if (props.view === "ungrouped") {
    content = <>{props.filtered.map((server) => renderRow(server, false))}</>;
  } else {
    content = (
      <>
        {props.groups.map((group) => {
          const open = props.isClusterOpen(group.key);
          return (
            <section key={group.key} className={classes.cluster}>
              <UnstyledButton
                className={classes.clusterHeader}
                onClick={() => props.onToggleCluster(group.key)}
                aria-expanded={open}
              >
                {open ? (
                  <CaretDown size={12} className={classes.clusterCaret} />
                ) : (
                  <CaretRight size={12} className={classes.clusterCaret} />
                )}
                <Text className={classes.clusterLabel}>{group.label}</Text>
                <Text className={classes.clusterCount} c="dimmed">
                  {group.servers.length}
                </Text>
              </UnstyledButton>
              {open && (
                <Stack gap={6} className={classes.clusterList}>
                  {group.servers.map((server) => renderRow(server, false))}
                </Stack>
              )}
            </section>
          );
        })}
      </>
    );
  }

  return (
    <Stack gap={props.iconMode ? 4 : 8} className={classes.list}>
      {content}
      {props.filtered.length === 0 && (
        <Text c="dimmed" size="sm" ta="center" py="md">
          {props.iconMode ? "—" : "No servers"}
        </Text>
      )}
    </Stack>
  );
}
