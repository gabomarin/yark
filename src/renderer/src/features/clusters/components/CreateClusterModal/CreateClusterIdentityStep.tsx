import type { ReactElement } from "react";
import { Alert, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import { PathField } from "@ui/PathField/PathField";

interface Props {
  clusterId: string;
  clusterDir: string;
  idTouched: boolean;
  dirTouched: boolean;
  browsing: boolean;
  idError: string | null;
  dirError: string | null;
  incompleteGroups: Array<{ dir: string; members: ServerProfile[] }>;
  onClusterIdChange: (value: string) => void;
  onGenerateId: () => void;
  onClusterDirChange: (value: string) => void;
  onIdBlur: () => void;
  onBrowse: () => void;
}

export function CreateClusterIdentityStep(props: Props): ReactElement {
  return (
    <Stack gap="md">
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <TextInput
          style={{ flex: 1 }}
          label="Cluster ID"
          description="ARK uses this ID so servers can transfer survivors, items, and creatures between maps."
          required
          value={props.clusterId}
          onChange={(event) => props.onClusterIdChange(event.currentTarget.value)}
          onBlur={props.onIdBlur}
          error={props.idTouched ? props.idError : null}
          autoComplete="off"
        />
        <Button variant="default" onClick={props.onGenerateId}>
          Generate
        </Button>
      </Group>
      <PathField
        label="Shared cluster directory"
        description="Folder used for Cross-ARK transfers."
        placeholder="D:\\ASA\\Clusters\\Ember"
        value={props.clusterDir}
        required
        busy={props.browsing}
        onChange={props.onClusterDirChange}
        onBrowse={props.onBrowse}
      />
      {props.dirTouched && props.dirError !== null && (
        <Text size="xs" c="red">
          {props.dirError}
        </Text>
      )}
      {props.incompleteGroups.length > 0 && (
        <Alert
          color="yellow"
          variant="light"
          title="Incomplete setups (not ready as a cluster yet)"
        >
          <Stack gap="xs">
            {props.incompleteGroups.map((group) => (
              <div key={group.dir}>
                <Text size="xs" c="dimmed" ff="monospace">
                  {group.dir}
                </Text>
                <Text size="sm">
                  {group.members.map((server) => server.name).join(", ")} ·
                  Directory set, missing Cluster ID
                </Text>
              </div>
            ))}
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}
