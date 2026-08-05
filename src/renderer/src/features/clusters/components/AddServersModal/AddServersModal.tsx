import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Group, Modal, Stack, Stepper, Text } from "@mantine/core";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { sharedClusterDir } from "../../clusterModel";
import {
  buildCreateClusterInput,
  getJoinPortError,
  listAddCandidates,
  modsMayDiverge,
  pruneSelectedServerIds,
  resolveSelectedCandidates,
  serverProfileToInput,
  toggleSelectedServerId,
} from "../../membershipModel";
import { CreateClusterServerStep } from "../CreateClusterModal/CreateClusterServerStep";
import classes from "../CreateClusterModal/CreateClusterModal.module.css";

interface Props {
  opened: boolean;
  clusterId: string;
  members: ServerProfile[];
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  onClose: () => void;
  onChanged: () => void;
}

export function AddServersModal(props: Props): ReactElement {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  const sharedDir = useMemo(
    () => sharedClusterDir(props.members),
    [props.members],
  );
  const candidates = useMemo(
    () => listAddCandidates(props.clusterId, props.servers, props.statuses),
    [props.clusterId, props.servers, props.statuses],
  );
  const selected = useMemo(
    () => resolveSelectedCandidates(candidates, selectedIds),
    [candidates, selectedIds],
  );
  const selectedServers = useMemo(
    () => selected.map((candidate) => candidate.server),
    [selected],
  );
  const portError = useMemo(
    () => getJoinPortError(props.members, selectedServers),
    [props.members, selectedServers],
  );
  const modWarning = useMemo(
    () => modsMayDiverge(props.members, selectedServers),
    [props.members, selectedServers],
  );
  const canContinue = selected.length > 0 && portError === null && sharedDir !== null;

  useEffect(() => {
    const justOpened = props.opened && !wasOpenRef.current;
    wasOpenRef.current = props.opened;
    if (!props.opened) return;

    if (justOpened) {
      const firstEligible =
        candidates.find((candidate) => candidate.eligible)?.server.id ?? null;
      setStep(1);
      setSelectedIds(firstEligible !== null ? [firstEligible] : []);
      setSaving(false);
      setError(null);
      return;
    }

    setSelectedIds((current) => {
      const next = pruneSelectedServerIds(current, candidates);
      return next.length === current.length ? current : next;
    });
  }, [props.opened, candidates]);

  const handleAdd = async (): Promise<void> => {
    if (!canContinue || sharedDir === null) return;
    setSaving(true);
    setError(null);
    const applied: ServerProfile[] = [];
    try {
      for (const candidate of selected) {
        const input = buildCreateClusterInput(
          candidate.server,
          props.clusterId,
          sharedDir,
        );
        const result = await window.api.updateServer(candidate.server.id, input);
        if (!result.ok) {
          const failMessage = result.error ?? "Could not add servers to the cluster";
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
      title={`Add servers to ${props.clusterId}`}
      size="lg"
      centered
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Choose stopped servers that are not already in a cluster. They will receive
          this cluster’s ID and shared directory.
        </Text>

        <Stepper active={step - 1} allowNextStepsSelect={false} size="sm">
          <Stepper.Step label="Servers" />
          <Stepper.Step label="Preview" />
        </Stepper>

        {error !== null && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        {sharedDir === null && (
          <Alert color="red" variant="light">
            This cluster does not have one shared directory yet. Align directories on
            every server before adding more.
          </Alert>
        )}

        {step === 1 && (
          <CreateClusterServerStep
            candidates={candidates}
            selectedIds={selectedIds}
            portError={portError}
            emptyHint="No servers available to add. Create a stopped server that is not already in a cluster."
            selectionHint="Select one or more stopped servers that are not already in a cluster"
            onToggle={(serverId) =>
              setSelectedIds((current) => toggleSelectedServerId(current, serverId))
            }
          />
        )}

        {step === 2 && selected.length > 0 && sharedDir !== null && (
          <Stack gap="md">
            <div className={classes.previewCard}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                Summary
              </Text>
              <dl className={classes.previewList}>
                <div>
                  <dt>Adding</dt>
                  <dd>
                    <ul className={classes.memberPreviewList}>
                      {selectedServers.map((server) => (
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
                  <dd className={classes.mono}>{sharedDir}</dd>
                </div>
              </dl>
            </div>
            {modWarning && (
              <Alert color="yellow" variant="light">
                Mod lists differ from current cluster servers; mod items may be lost
                on transfer.
              </Alert>
            )}
            <Alert color="blue" variant="light">
              Saves this Cluster ID and shared folder on the selected servers.
            </Alert>
          </Stack>
        )}

        <Group justify="space-between">
          <Button
            variant="default"
            disabled={saving}
            onClick={() => {
              if (step === 1) {
                props.onClose();
                return;
              }
              setStep(1);
            }}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step === 1 ? (
            <Button disabled={!canContinue} onClick={() => setStep(2)}>
              Continue
            </Button>
          ) : (
            <Button
              loading={saving}
              disabled={!canContinue}
              onClick={() => void handleAdd()}
            >
              Add to cluster
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
