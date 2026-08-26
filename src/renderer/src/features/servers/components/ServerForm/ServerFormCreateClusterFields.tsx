import type { ReactElement } from "react";
import { Anchor, Select, Stack, Text, TextInput } from "@mantine/core";
import type { KnownClusterOption } from "@features/clusters/knownClusterOptions";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";

/** Select-only sentinel; includes NUL so it cannot match a typed clusterId. */
const NONE_VALUE = "\0yark.cluster.none";

interface Props {
  options: KnownClusterOption[];
  selectedClusterId: string | null;
  inputSize: "xs" | "sm";
  onSelectCluster: (clusterId: string | null) => void;
  onOpenClusters?: () => void;
}

export function ServerFormCreateClusterFields(props: Props): ReactElement {
  const hasClusters = props.options.length > 0;
  const selected =
    props.selectedClusterId === null
      ? null
      : props.options.find((option) => option.clusterId === props.selectedClusterId) ??
        null;

  return (
    <Stack gap="sm">
      <Select
        label="Cluster"
        size={props.inputSize}
        data={[
          { value: NONE_VALUE, label: "None" },
          ...props.options.map((option) => ({
            value: option.clusterId,
            label: option.label,
          })),
        ]}
        value={selected !== null ? selected.clusterId : NONE_VALUE}
        onChange={(value) => {
          if (value === null || value === NONE_VALUE) {
            props.onSelectCluster(null);
            return;
          }
          props.onSelectCluster(value);
        }}
        searchable={hasClusters}
        allowDeselect={false}
        description={
          hasClusters
            ? "Join an existing cluster for Cross-ARK transfers, or leave None. Joining here only sets Cluster ID and shared folder – it does not copy INI from other servers."
            : "No clusters in the fleet yet. A cluster is a shared folder + Cluster ID so survivors and items can transfer between maps."
        }
      />
      {!hasClusters &&
        (props.onOpenClusters !== undefined ? (
          <Text size="sm" c="dimmed">
            {/* Theme default is underline="always" for doc links; button actions stay hover-only. */}
            <Anchor
              component="button"
              type="button"
              underline="hover"
              onClick={props.onOpenClusters}
            >
              Create a cluster first…
            </Anchor>
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Create a cluster from the Clusters page, then come back to join it
            here.
          </Text>
        ))}
      {selected !== null && (
        <>
          <TextInput
            label="Cluster ID"
            size={props.inputSize}
            value={selected.clusterId}
            disabled
            readOnly
            description="Copied from the cluster you joined. Same ID on every map that should transfer together."
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              Shared cluster directory
            </Text>
            <ReadonlyPath value={selected.clusterDir} />
          </div>
        </>
      )}
    </Stack>
  );
}
