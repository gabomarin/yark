import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { Alert, Button, Checkbox, Group, Modal, Stack, Text } from "@mantine/core";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { SelectableListRow } from "@ui/SelectableListRow/SelectableListRow";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import {
  buildLeaveClusterInput,
  listRemoveCandidates,
  pruneSelectedServerIds,
  remainingMemberCountAfterRemove,
  resolveSelectedCandidates,
  serverProfileToInput,
  toggleSelectedServerId,
} from "../../membershipModel";
import classes from "../CreateClusterModal/CreateClusterModal.module.css";

interface Props {
  opened: boolean;
  clusterId: string;
  members: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  /** When opening from a row action, preselect this server. */
  initialSelectedIds?: string[];
  onClose: () => void;
  onChanged: () => void;
}

function initialSelectedIds(
  members: ServerProfile[],
  statuses: Map<string, ServerRuntimeInfo>,
  preferredIds: string[] | undefined,
): string[] {
  const candidates = listRemoveCandidates(members, statuses);
  const eligibleIds = candidates
    .filter((candidate) => candidate.eligible)
    .map((candidate) => candidate.server.id);
  const eligible = new Set(eligibleIds);
  const preselected = (preferredIds ?? []).filter((id) => eligible.has(id));
  if (preselected.length > 0) return preselected;
  const firstEligible = eligibleIds[0];
  return firstEligible !== undefined ? [firstEligible] : [];
}

export function RemoveServersModal(props: Props): ReactElement {
  const [selectedIds, setSelectedIds] = useState(() =>
    initialSelectedIds(props.members, props.statuses, props.initialSelectedIds),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(
    () => listRemoveCandidates(props.members, props.statuses),
    [props.members, props.statuses],
  );
  const activeSelectedIds = useMemo(
    () => pruneSelectedServerIds(selectedIds, candidates),
    [selectedIds, candidates],
  );
  const selected = useMemo(
    () => resolveSelectedCandidates(candidates, activeSelectedIds),
    [candidates, activeSelectedIds],
  );
  const remaining = remainingMemberCountAfterRemove(
    props.members.length,
    selected.length,
  );

  const handleRemove = async (): Promise<void> => {
    if (selected.length === 0) return;
    setSaving(true);
    setError(null);
    const applied: ServerProfile[] = [];
    try {
      for (const candidate of selected) {
        const input = buildLeaveClusterInput(candidate.server);
        const result = await window.api.updateServer(candidate.server.id, input);
        if (!result.ok) {
          const failMessage =
            result.error ?? "Could not remove servers from the cluster";
          const rollbackFailures: string[] = [];
          for (const previous of [...applied].reverse()) {
            const rollback = await window.api.updateServer(
              previous.id,
              serverProfileToInput(previous),
            );
            if (!rollback.ok) rollbackFailures.push(previous.name);
          }
          if (rollbackFailures.length > 0) {
            setError(
              `Failed on “${candidate.server.name}”: ${failMessage}. Could not restore: ${rollbackFailures.join(", ")}.`,
            );
            props.onChanged();
          } else if (applied.length > 0) {
            setError(
              `Failed on “${candidate.server.name}”: ${failMessage}. Previous profiles were restored.`,
            );
          } else {
            setError(failMessage);
          }
          return;
        }
        applied.push(candidate.server);
      }
      props.onChanged();
      props.onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={props.opened}
      onClose={() => {
        if (!saving) props.onClose();
      }}
      title={`Remove from ${props.clusterId}`}
      size="lg"
      centered
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Clears Cluster ID and shared directory on the selected profiles. Transfer
          files in the shared folder are not deleted.
        </Text>

        {error !== null && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        <div className={classes.candidateList} data-remove-cluster-servers>
          {candidates.map((candidate) => (
            <SelectableListRow
              key={candidate.server.id}
              selected={activeSelectedIds.includes(candidate.server.id)}
              disabled={!candidate.eligible}
              onClick={() => {
                if (candidate.eligible) {
                  setSelectedIds((current) =>
                    toggleSelectedServerId(
                      pruneSelectedServerIds(current, candidates),
                      candidate.server.id,
                    ),
                  );
                }
              }}
              aria-pressed={activeSelectedIds.includes(candidate.server.id)}
              leading={
                <Checkbox
                  checked={activeSelectedIds.includes(candidate.server.id)}
                  disabled={!candidate.eligible}
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                />
              }
              trailing={
                <ServerRuntimeStatusBadge status={candidate.status} size="xs" />
              }
            >
              <Text fw={600} size="sm">
                {candidate.server.name}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace">
                {candidate.server.map}
              </Text>
              {candidate.reason !== null && (
                <Text size="xs" c="orange">
                  {candidate.reason}
                </Text>
              )}
            </SelectableListRow>
          ))}
        </div>

        {remaining === 0 ? (
          <Alert color="yellow" variant="light">
            Removing every server clears this cluster from the list until another
            profile uses the ID again.
          </Alert>
        ) : remaining === 1 ? (
          <Alert color="yellow" variant="light">
            One server will remain. Transfers need at least two servers.
          </Alert>
        ) : null}

        <Group justify="space-between">
          <Button variant="default" disabled={saving} onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={saving}
            disabled={selected.length === 0}
            onClick={() => void handleRemove()}
          >
            Remove from cluster
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
