import type { ReactElement } from "react";
import { Checkbox, Stack, Text } from "@mantine/core";
import type { ServerStatus } from "@shared/types";
import { SelectableListRow } from "@ui/SelectableListRow/SelectableListRow";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import type { CreateClusterCandidate } from "../../createClusterModel";
import classes from "./CreateClusterModal.module.css";

function ServerCandidateRow(props: {
  name: string;
  map: string;
  status: ServerStatus;
  reason: string | null;
  eligible: boolean;
  selected: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <SelectableListRow
      selected={props.selected}
      disabled={!props.eligible}
      onClick={props.onToggle}
      aria-pressed={props.selected}
      leading={
        <Checkbox
          checked={props.selected}
          disabled={!props.eligible}
          readOnly
          tabIndex={-1}
          aria-hidden
        />
      }
      trailing={<ServerRuntimeStatusBadge status={props.status} size="xs" />}
    >
      <Text fw={600} size="sm">
        {props.name}
      </Text>
      <Text size="xs" c="dimmed" ff="monospace">
        {props.map}
      </Text>
      {props.reason !== null && (
        <Text size="xs" c="orange">
          {props.reason}
        </Text>
      )}
    </SelectableListRow>
  );
}

interface Props {
  candidates: CreateClusterCandidate[];
  selectedIds: string[];
  portError: string | null;
  onToggle: (serverId: string) => void;
  emptyHint?: string;
  selectionHint?: string;
}

export function CreateClusterServerStep(props: Props): ReactElement {
  const selectedCount = props.selectedIds.length;

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        Servers
      </Text>
      <div className={classes.candidateList} data-create-cluster-servers>
        {props.candidates.length === 0 ? (
          <Text size="sm" c="dimmed">
            {props.emptyHint ??
              "Create a server first, then start a cluster from stopped servers."}
          </Text>
        ) : (
          props.candidates.map((candidate) => (
            <ServerCandidateRow
              key={candidate.server.id}
              name={candidate.server.name}
              map={candidate.server.map}
              status={candidate.status}
              reason={candidate.reason}
              eligible={candidate.eligible}
              selected={props.selectedIds.includes(candidate.server.id)}
              onToggle={() => {
                if (candidate.eligible) props.onToggle(candidate.server.id);
              }}
            />
          ))
        )}
      </div>
      <Text size="xs" c="dimmed">
        {props.selectionHint ??
          "Select one or more stopped servers that are not already in a cluster"}
        {selectedCount > 0 ? ` (${selectedCount} selected)` : ""}.
      </Text>
      {props.portError !== null && (
        <Text size="sm" c="red">
          {props.portError}
        </Text>
      )}
    </Stack>
  );
}
