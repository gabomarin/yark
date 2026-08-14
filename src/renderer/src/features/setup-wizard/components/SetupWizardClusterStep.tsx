import type { ReactElement } from "react";
import { Group, Radio, Stack, Text, Title } from "@mantine/core";
import { CreateClusterIdentityStep } from "@features/clusters/components/CreateClusterModal/CreateClusterIdentityStep";

interface Props {
  shareCluster: boolean;
  clusterId: string;
  clusterDir: string;
  idTouched: boolean;
  dirTouched: boolean;
  browsing: boolean;
  idError: string | null;
  dirError: string | null;
  dirAutoSuggested: boolean;
  onShareClusterChange: (share: boolean) => void;
  onClusterIdChange: (value: string) => void;
  onGenerateId: () => void;
  onClusterDirChange: (value: string) => void;
  onIdBlur: () => void;
  onBrowse: () => void;
}

export function SetupWizardClusterStep(props: Props): ReactElement {
  return (
    <Stack gap="md">
      <div>
        <Title order={4}>First cluster</Title>
        <Text size="xs" c="dimmed" mt={2}>
          Let survivors, items, and dinos move between maps. We keep the ID and
          folder for your first create or import.
        </Text>
      </div>
      <Radio.Group
        label="Share transfers between maps?"
        value={props.shareCluster ? "yes" : "no"}
        onChange={(value) => props.onShareClusterChange(value === "yes")}
      >
        <Group mt="xs">
          <Radio value="no" label="Not now" />
          <Radio value="yes" label="Yes — set ID and folder" />
        </Group>
      </Radio.Group>
      {props.shareCluster && (
        <Stack gap="xs">
          <CreateClusterIdentityStep
            clusterId={props.clusterId}
            clusterDir={props.clusterDir}
            idTouched={props.idTouched}
            dirTouched={props.dirTouched}
            browsing={props.browsing}
            idError={props.idError}
            dirError={props.dirError}
            incompleteGroups={[]}
            onClusterIdChange={props.onClusterIdChange}
            onGenerateId={props.onGenerateId}
            onClusterDirChange={props.onClusterDirChange}
            onIdBlur={props.onIdBlur}
            onBrowse={props.onBrowse}
          />
          {props.dirAutoSuggested && (
            <Text size="xs" c="dimmed">
              Suggested from your default base folder. Choose another folder if
              transfers should live elsewhere.
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}
