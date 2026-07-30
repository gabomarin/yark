import type { ReactElement } from "react";
import { FolderSimple } from "@phosphor-icons/react";
import { Stack, Text } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { groupServersByClusterDir } from "../clusterModel";
import classes from "../clusters.module.css";
import { ClusterMemberRow } from "./ClusterMemberRow";

interface Props {
  serverCount: number;
  dirWithoutIdServers: ServerProfile[];
  onOpenServer: (serverId: string) => void;
}

export function ClusterEmptyState(props: Props): ReactElement {
  const incompleteGroups = groupServersByClusterDir(props.dirWithoutIdServers);

  return (
    <AppSurfaceCard fill className={classes.emptyCard}>
      <EmptyState
        layout="stacked"
        icon={<FolderSimple size={24} />}
        title="No clusters configured"
        description={
          props.dirWithoutIdServers.length > 0 ? undefined : (
            <Text c="dimmed" size="sm" maw={480} ta="center">
              {props.serverCount === 0
                ? "Create a server first, then set a Cluster ID and shared cluster directory so maps can transfer together."
                : "Open a server and set the same Cluster ID plus one shared cluster directory on two or more maps to see compliance here."}
            </Text>
          )
        }
      >
        {props.dirWithoutIdServers.length > 0 && (
          <Stack gap="sm" className={classes.incompleteBlock}>
            <Text c="dimmed" size="sm" ta="center" maw={480}>
              {props.dirWithoutIdServers.length === 1
                ? "One server has a shared cluster directory but no Cluster ID. Open it and set a Cluster ID — use the same ID on every map that should transfer together."
                : `${props.dirWithoutIdServers.length} servers have a shared cluster directory but no Cluster ID. Open each and set the same Cluster ID on every map that should transfer together.`}
            </Text>
            <div className={classes.incompleteList} data-incomplete-clusters>
              {incompleteGroups.map(({ dir, members }) => (
                <div key={dir} className={classes.incompleteGroup}>
                  <Text size="xs" c="dimmed" className={classes.incompleteDir}>
                    {dir}
                  </Text>
                  <div className={classes.memberList}>
                    {members.map((server) => (
                      <ClusterMemberRow
                        key={server.id}
                        server={server}
                        subtitle={`${server.map} · missing Cluster ID`}
                        onOpen={props.onOpenServer}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Stack>
        )}
      </EmptyState>
    </AppSurfaceCard>
  );
}
