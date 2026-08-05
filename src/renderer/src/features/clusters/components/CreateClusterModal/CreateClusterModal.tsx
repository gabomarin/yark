import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Group, Modal, Stack, Stepper, Text } from "@mantine/core";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import {
  buildCreateClusterInput,
  getClusterDirFormError,
  getClusterIdFormError,
  getSelectedMembersPortError,
  listCreateClusterCandidates,
  listIncompleteClusterGroups,
  pruneSelectedServerIds,
  resolveSelectedCandidates,
  sharedPrefillClusterDir,
  suggestClusterId,
  serverProfileToInput,
  toggleSelectedServerId,
  type CreateClusterStep,
} from "../../createClusterModel";
import { CreateClusterIdentityStep } from "./CreateClusterIdentityStep";
import { CreateClusterPreviewStep } from "./CreateClusterPreviewStep";
import { CreateClusterServerStep } from "./CreateClusterServerStep";

interface Props {
  opened: boolean;
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateClusterModal(props: Props): ReactElement {
  const [step, setStep] = useState<CreateClusterStep>(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clusterId, setClusterId] = useState("");
  const [clusterDir, setClusterDir] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [dirTouched, setDirTouched] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  const candidates = useMemo(
    () => listCreateClusterCandidates(props.servers, props.statuses),
    [props.servers, props.statuses],
  );
  const incompleteGroups = useMemo(
    () => listIncompleteClusterGroups(props.servers),
    [props.servers],
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
    () => getSelectedMembersPortError(selectedServers),
    [selectedServers],
  );

  const idError = useMemo(
    () => getClusterIdFormError(clusterId, clusterDir, props.servers),
    [clusterDir, clusterId, props.servers],
  );
  const dirError = useMemo(
    () => getClusterDirFormError(clusterDir),
    [clusterDir],
  );
  const identityValid = idError === null && dirError === null;
  const canContinueStep1 = selected.length > 0 && portError === null;
  const canContinueStep2 = identityValid;

  useEffect(() => {
    const justOpened = props.opened && !wasOpenRef.current;
    wasOpenRef.current = props.opened;
    if (!props.opened) return;

    if (justOpened) {
      const firstEligible =
        candidates.find((candidate) => candidate.eligible)?.server.id ?? null;
      setStep(1);
      setSelectedIds(firstEligible !== null ? [firstEligible] : []);
      setClusterId(suggestClusterId());
      setClusterDir("");
      setIdTouched(false);
      setDirTouched(false);
      setBrowsing(false);
      setSaving(false);
      setError(null);
      return;
    }

    // Keep selection in sync if eligibility changes while the modal stays open.
    setSelectedIds((current) => {
      const next = pruneSelectedServerIds(current, candidates);
      return next.length === current.length ? current : next;
    });
  }, [props.opened, candidates]);

  const handleBrowse = async (): Promise<void> => {
    setBrowsing(true);
    try {
      const result = await window.api.pickPath(
        "directory",
        clusterDir.trim().length > 0
          ? clusterDir
          : selectedServers[0]?.installDir,
        "Select shared cluster folder",
      );
      if (result.ok && result.data !== null) {
        setClusterDir(result.data);
        setDirTouched(true);
      }
    } finally {
      setBrowsing(false);
    }
  };

  const handleCreate = async (): Promise<void> => {
    if (selected.length === 0 || !identityValid || portError !== null) return;
    setSaving(true);
    setError(null);
    const applied: ServerProfile[] = [];
    try {
      for (const candidate of selected) {
        const input = buildCreateClusterInput(
          candidate.server,
          clusterId,
          clusterDir,
        );
        const result = await window.api.updateServer(candidate.server.id, input);
        if (!result.ok) {
          const failMessage =
            result.error ?? "Could not create the cluster";
          const rollbackFailures: string[] = [];
          for (const previous of [...applied].reverse()) {
            const rollback = await window.api.updateServer(
              previous.id,
              serverProfileToInput(previous),
            );
            if (!rollback.ok) {
              rollbackFailures.push(previous.name);
            }
          }
          if (rollbackFailures.length > 0) {
            setError(
              `Failed on “${candidate.server.name}”: ${failMessage}. Could not restore: ${rollbackFailures.join(", ")}.`,
            );
            props.onCreated();
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
      props.onCreated();
      props.onClose();
    } finally {
      setSaving(false);
    }
  };

  const goNext = (): void => {
    if (step === 1 && canContinueStep1) {
      if (clusterDir.trim().length === 0) {
        const prefill = sharedPrefillClusterDir(selectedServers);
        if (prefill !== null) setClusterDir(prefill);
      }
      setStep(2);
    }
    if (step === 2) {
      setIdTouched(true);
      setDirTouched(true);
      if (canContinueStep2) setStep(3);
    }
  };

  return (
    <Modal
      opened={props.opened}
      onClose={() => {
        if (!saving) props.onClose();
      }}
      title="Create cluster"
      size="lg"
      centered
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Choose stopped servers, then set a Cluster ID and shared folder.
        </Text>

        <Stepper active={step - 1} allowNextStepsSelect={false} size="sm">
          <Stepper.Step label="Servers" />
          <Stepper.Step label="Identity" />
          <Stepper.Step label="Preview" />
        </Stepper>

        {error !== null && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        {step === 1 && (
          <CreateClusterServerStep
            candidates={candidates}
            selectedIds={selectedIds}
            portError={portError}
            onToggle={(serverId) =>
              setSelectedIds((current) =>
                toggleSelectedServerId(current, serverId),
              )
            }
          />
        )}

        {step === 2 && (
          <CreateClusterIdentityStep
            clusterId={clusterId}
            clusterDir={clusterDir}
            idTouched={idTouched}
            dirTouched={dirTouched}
            browsing={browsing}
            idError={idError}
            dirError={dirError}
            incompleteGroups={incompleteGroups}
            onClusterIdChange={(value) => {
              setClusterId(value);
              setIdTouched(true);
            }}
            onGenerateId={() => {
              setClusterId(suggestClusterId());
              setIdTouched(true);
            }}
            onClusterDirChange={(value) => {
              setClusterDir(value);
              setDirTouched(true);
            }}
            onIdBlur={() => setIdTouched(true)}
            onBrowse={() => void handleBrowse()}
          />
        )}

        {step === 3 && selected.length > 0 && (
          <CreateClusterPreviewStep
            servers={selected.map((candidate) => ({
              id: candidate.server.id,
              name: candidate.server.name,
              map: candidate.server.map,
            }))}
            clusterId={clusterId.trim()}
            clusterDir={clusterDir.trim()}
          />
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
              setStep((current) => (current - 1) as CreateClusterStep);
            }}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < 3 ? (
            <Button
              disabled={step === 1 ? !canContinueStep1 : !canContinueStep2}
              onClick={goNext}
            >
              Continue
            </Button>
          ) : (
            <Button
              loading={saving}
              disabled={!identityValid || selected.length === 0 || portError !== null}
              onClick={() => void handleCreate()}
            >
              Create cluster
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
