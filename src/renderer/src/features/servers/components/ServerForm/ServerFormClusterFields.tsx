import type { ReactElement } from "react";
import { TextInput } from "@mantine/core";
import type { KnownClusterOption } from "@features/clusters/knownClusterOptions";
import { ServerFormPathField } from "./ServerFormPathField";
import { ServerFormCreateClusterFields } from "./ServerFormCreateClusterFields";

interface Props {
  isCreate: boolean;
  knownClusters: KnownClusterOption[];
  clusterId: string;
  clusterDir: string;
  inputSize: "xs" | "sm";
  browsingClusterDir: boolean;
  onSelectCreateCluster: (clusterId: string | null) => void;
  onOpenClusters?: () => void;
  onClusterIdChange: (value: string) => void;
  onClusterDirChange: (value: string) => void;
  onBrowseClusterDir: () => void;
}

export function ServerFormClusterFields(props: Props): ReactElement {
  if (props.isCreate) {
    return (
      <ServerFormCreateClusterFields
        options={props.knownClusters}
        selectedClusterId={
          props.clusterId.trim().length > 0 ? props.clusterId.trim() : null
        }
        inputSize={props.inputSize}
        onSelectCluster={props.onSelectCreateCluster}
        onOpenClusters={props.onOpenClusters}
      />
    );
  }

  return (
    <>
      <TextInput
        label="Cluster ID"
        size={props.inputSize}
        value={props.clusterId}
        onChange={(e) => props.onClusterIdChange(e.currentTarget.value)}
      />
      <ServerFormPathField
        label="Shared cluster directory"
        value={props.clusterDir}
        placeholder="C:\\ark_servers\\cluster"
        busy={props.browsingClusterDir}
        size={props.inputSize}
        onChange={props.onClusterDirChange}
        onBrowse={props.onBrowseClusterDir}
      />
    </>
  );
}
