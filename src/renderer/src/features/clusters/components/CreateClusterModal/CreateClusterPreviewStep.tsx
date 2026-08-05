import type { ReactElement } from "react";
import { Alert, Stack, Text } from "@mantine/core";
import classes from "./CreateClusterModal.module.css";

interface ServerPreview {
  id: string;
  name: string;
  map: string;
}

interface Props {
  servers: ServerPreview[];
  clusterId: string;
  clusterDir: string;
}

export function CreateClusterPreviewStep(props: Props): ReactElement {
  return (
    <Stack gap="md">
      <div className={classes.previewCard}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Summary
        </Text>
        <dl className={classes.previewList}>
          <div>
            <dt>Servers</dt>
            <dd>
              <ul className={classes.memberPreviewList}>
                {props.servers.map((server) => (
                  <li key={server.id}>
                    <span>{server.name}</span>
                    <span className={classes.mono}>{server.map}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt>Cluster ID</dt>
            <dd>{props.clusterId}</dd>
          </div>
          <div>
            <dt>Directory</dt>
            <dd className={classes.mono}>{props.clusterDir}</dd>
          </div>
        </dl>
      </div>
      <Alert color="blue" variant="light">
        Saves the Cluster ID and shared folder on the selected servers.
      </Alert>
    </Stack>
  );
}
