import type { ReactElement, ReactNode } from "react";
import { Stack, Text } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import type { ServerListViewMode } from "@features/servers/serverListModel";
import type { ServerClusterGroup } from "@features/server-workspace/workspaceLayoutModel";
import classes from "../OverviewPage.module.css";

interface Props {
  view: ServerListViewMode;
  enabledGroups: ServerClusterGroup[];
  sortedEnabled: ServerProfile[];
  sortedDisabled: ServerProfile[];
  showDisabled: boolean;
  renderServerCard: (server: ServerProfile) => ReactNode;
}

export function ServerGridList(props: Props): ReactElement | null {
  const hasEnabled = props.sortedEnabled.length > 0;
  const hasDisabled = props.showDisabled && props.sortedDisabled.length > 0;
  if (!hasEnabled && !hasDisabled) {
    return null;
  }

  const enabledList =
    props.view === "ungrouped" ? (
      <div className={classes.serverGrid}>
        {props.sortedEnabled.map((server) => props.renderServerCard(server))}
      </div>
    ) : (
      <Stack gap="xs">
        {props.enabledGroups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <div className={classes.clusterGroupHead}>
              <Text component="span">{group.label}</Text>
              <Text component="span" className={classes.clusterGroupCount}>
                {group.servers.length}
              </Text>
            </div>
            <div className={classes.serverGrid}>
              {group.servers.map((server) => props.renderServerCard(server))}
            </div>
          </section>
        ))}
      </Stack>
    );

  return (
    <>
      {hasEnabled ? enabledList : null}
      {hasDisabled ? (
        <section aria-label="Disabled servers">
          <div className={classes.clusterGroupHead}>
            <Text component="span">Disabled</Text>
            <Text component="span" className={classes.clusterGroupHint}>
              Same sort, kept separate from the fleet
            </Text>
          </div>
          <div className={classes.serverGrid}>
            {props.sortedDisabled.map((server) => props.renderServerCard(server))}
          </div>
        </section>
      ) : null}
    </>
  );
}
