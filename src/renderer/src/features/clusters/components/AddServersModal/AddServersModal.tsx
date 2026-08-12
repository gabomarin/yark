import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
  Stepper,
  Text,
} from "@mantine/core";
import {
  clusterIniFileSelectionHasWork,
} from "@shared/cluster-ini-file-selection";
import type {
  ClusterIniTemplateFileSelection,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
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
import { ClusterIniFileSelectionFields } from "../ClusterIniFileSelectionFields/ClusterIniFileSelectionFields";
import { CreateClusterServerStep } from "../CreateClusterModal/CreateClusterServerStep";
import classes from "../CreateClusterModal/CreateClusterModal.module.css";

interface Props {
  opened: boolean;
  clusterId: string;
  members: ServerProfile[];
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  hasTemplate?: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function AddServersModal(props: Props): ReactElement {
  const hasTemplate = props.hasTemplate === true;
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [seedFromTemplate, setSeedFromTemplate] = useState(false);
  const [seedFiles, setSeedFiles] = useState<ClusterIniTemplateFileSelection>(() => ({
    gameUserSettings: false,
    game: false,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sharedDir = useMemo(
    () => sharedClusterDir(props.members),
    [props.members],
  );
  const candidates = useMemo(
    () => listAddCandidates(props.clusterId, props.servers, props.statuses),
    [props.clusterId, props.servers, props.statuses],
  );
  const activeSelectedIds = useMemo(
    () => pruneSelectedServerIds(selectedIds, candidates),
    [selectedIds, candidates],
  );
  const selected = useMemo(
    () => resolveSelectedCandidates(candidates, activeSelectedIds),
    [candidates, activeSelectedIds],
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

  const seedSelectionOk =
    !seedFromTemplate ||
    !hasTemplate ||
    clusterIniFileSelectionHasWork(seedFiles);
  const canAdd = canContinue && seedSelectionOk;

  const handleAdd = async (): Promise<void> => {
    if (!canAdd || sharedDir === null) return;
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

      if (seedFromTemplate && hasTemplate) {
        const seedFailures: string[] = [];
        for (const member of applied) {
          const seed = await window.api.seedClusterIniFromTemplate(
            props.clusterId,
            member.id,
            seedFiles,
          );
          if (!seed.ok) {
            seedFailures.push(
              `${member.name}: ${seed.error ?? "seed failed"}`,
            );
          }
        }
        if (seedFailures.length > 0) {
          props.onChanged();
          setError(
            `Servers joined the cluster, but INI seed failed for: ${seedFailures.join("; ")}. Membership was kept.`,
          );
          return;
        }
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
          Choose enabled servers that are not running and not already in a cluster. They will receive
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
            selectedIds={activeSelectedIds}
            portError={portError}
            emptyHint="No servers available to add. Create an enabled server that is not running and not already in a cluster."
            selectionHint="Select one or more enabled servers that are not running and not already in a cluster"
            onToggle={(serverId) =>
              setSelectedIds((current) =>
                toggleSelectedServerId(
                  pruneSelectedServerIds(current, candidates),
                  serverId,
                ),
              )
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
            {hasTemplate ? (
              <Checkbox
                checked={seedFromTemplate}
                disabled={saving}
                onChange={(event) =>
                  setSeedFromTemplate(event.currentTarget.checked)
                }
                label="Seed INI from cluster template"
                description="After membership is saved, write selected template files onto each new member, reapply profile-owned ports/passwords/session name, and take an INI snapshot first. Leave unchecked to only set cluster ID and directory."
              />
            ) : (
              <Alert color="blue" variant="light">
                Saves this Cluster ID and shared folder on the selected servers.
                Create an INI template first if you want to seed settings on join.
              </Alert>
            )}
            {hasTemplate && seedFromTemplate && (
              <Stack gap="sm">
                <ClusterIniFileSelectionFields
                  value={seedFiles}
                  disabled={saving}
                  description="Choose which INI files to seed. Unchecked files stay as they are on disk."
                  onChange={setSeedFiles}
                />
                <Alert color="teal" variant="light">
                  Each selected stopped server will receive a restore-style write
                  of the selected files from the saved cluster template after joining.
                </Alert>
              </Stack>
            )}
            {hasTemplate && !seedFromTemplate && (
              <Alert color="blue" variant="light">
                Membership only — existing INI files stay unchanged.
              </Alert>
            )}
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
              disabled={!canAdd}
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
