import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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

export function RemoveServersModal(props: Props): ReactElement {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  const candidates = useMemo(
    () => listRemoveCandidates(props.members, props.statuses),
    [props.members, props.statuses],
  );
  const selected = useMemo(
    () => resolveSelectedCandidates(candidates, selectedIds),
    [candidates, selectedIds],
  );
  const remaining = remainingMemberCountAfterRemove(
    props.members.length,
    selected.length,
  );

  useEffect(() => {
    const justOpened = props.opened && !wasOpenRef.current;
    wasOpenRef.current = props.opened;
    if (!props.opened) return;

    if (justOpened) {
      const initial = props.initialSelectedIds ?? [];
      const eligible = new Set(
        candidates.filter((c) => c.eligible).map((c) => c.server.id),
      );
      const preselected = initial.filter((id) => eligible.has(id));
      setSelectedIds(
        preselected.length > 0
          ? preselected
          : candidates.find((c) => c.eligible)?.server.id !== undefined
            ? [candidates.find((c) => c.eligible)!.server.id]
            : [],
      );
      setSaving(false);
      setError(null);
      return;
    }

    setSelectedIds((current) => {
      const next = pruneSelectedServerIds(current, candidates);
      return next.length === current.length ? current : next;
    });
  }, [props.opened, candidates, props.initialSelectedIds]);

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
              selected={selectedIds.includes(candidate.server.id)}
              disabled={!candidate.eligible}
              onClick={() => {
                if (candidate.eligible) {
                  setSelectedIds((current) =>
                    toggleSelectedServerId(current, candidate.server.id),
                  );
                }
              }}
              aria-pressed={selectedIds.includes(candidate.server.id)}
              leading={
                <Checkbox
                  checked={selectedIds.includes(candidate.server.id)}
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
