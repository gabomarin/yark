import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, Group, Modal, Stack, Stepper } from "@mantine/core";
import type { ServerProfile, SteamCmdStatus } from "@shared/types";
import type { UiDensity } from "@features/settings/settingsModel";
import {
  getClusterDirFormError,
  getClusterIdFormError,
  suggestClusterId,
} from "@features/clusters/createClusterModel";
import { SetupWizardClusterStep } from "./components/SetupWizardClusterStep";
import { SetupWizardFirstActionStep } from "./components/SetupWizardFirstActionStep";
import { SetupWizardPathsStep } from "./components/SetupWizardPathsStep";
import { SetupWizardShellStep } from "./components/SetupWizardShellStep";
import { SetupWizardWelcomeStep } from "./components/SetupWizardWelcomeStep";
import {
  SETUP_WIZARD_STEP_LABELS,
  canContinueClusterStep,
  pendingClusterFromStep,
  stepsForMode,
  type PendingSetupCluster,
  type SetupWizardMode,
} from "./setupWizardModel";

interface Props {
  opened: boolean;
  mode: SetupWizardMode;
  servers: ServerProfile[];
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdBusy: boolean;
  defaultBaseFolder: string | null;
  uiDensity: UiDensity;
  openNativeTerminalOnStart: boolean;
  onPickSteamCmdPath: () => void;
  onInstallSteamCmd: () => void;
  onDefaultBaseFolderChange: (path: string | null) => void;
  onUiDensityChange: (density: UiDensity) => void;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
  onSkip: () => void;
  onDismiss: () => void;
  onPathsShellDone: () => void;
  onCreateServer: (cluster: PendingSetupCluster | null) => void;
  onImport: (cluster: PendingSetupCluster | null) => void;
  onExplore: (cluster: PendingSetupCluster | null) => void;
}

export function SetupWizard(props: Props): ReactElement {
  const steps = stepsForMode(props.mode);
  const [stepIndex, setStepIndex] = useState(0);
  const [shareCluster, setShareCluster] = useState(false);
  const [clusterId, setClusterId] = useState(() => suggestClusterId());
  const [clusterDir, setClusterDir] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [dirTouched, setDirTouched] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    if (!props.opened) {
      return;
    }
    setStepIndex(0);
    setShareCluster(false);
    setClusterId(suggestClusterId());
    setClusterDir("");
    setIdTouched(false);
    setDirTouched(false);
  }, [props.opened, props.mode]);

  const current = steps[stepIndex] ?? steps[0]!;
  const isLast = stepIndex >= steps.length - 1;
  const idError = useMemo(
    () => getClusterIdFormError(clusterId, clusterDir, props.servers),
    [clusterDir, clusterId, props.servers],
  );
  const dirError = useMemo(
    () => getClusterDirFormError(clusterDir),
    [clusterDir],
  );
  const clusterContinue = canContinueClusterStep({
    shareCluster,
    clusterId,
    clusterDir,
    servers: props.servers,
  });
  const canContinue = current !== "cluster" || clusterContinue;

  const pendingCluster = (): PendingSetupCluster | null =>
    pendingClusterFromStep({ shareCluster, clusterId, clusterDir });

  const handleDismiss = (): void => {
    if (props.mode === "first-run") {
      props.onSkip();
      return;
    }
    props.onDismiss();
  };

  const handleBrowse = async (): Promise<void> => {
    setBrowsing(true);
    try {
      const result = await window.api.pickPath(
        "directory",
        clusterDir.trim().length > 0 ? clusterDir : undefined,
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

  const goNext = (): void => {
    if (!canContinue) {
      return;
    }
    if (isLast && props.mode === "paths-shell") {
      props.onPathsShellDone();
      return;
    }
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  };

  return (
    <Modal
      opened={props.opened}
      onClose={handleDismiss}
      title={
        props.mode === "first-run" ? "Set up YARK" : "Setup — paths and Windows"
      }
      size="lg"
      centered
      closeOnClickOutside={false}
      overlayProps={{ mod: { "setup-wizard-overlay": true } }}
    >
      <Stack gap="md" data-setup-wizard data-setup-wizard-step={current}>
        <Group justify="flex-end">
          <Button variant="subtle" size="compact-xs" onClick={handleDismiss}>
            {props.mode === "first-run" ? "Skip setup" : "Close"}
          </Button>
        </Group>

        <Stepper
          active={stepIndex}
          allowNextStepsSelect={false}
          size="sm"
        >
          {steps.map((stepId) => (
            <Stepper.Step
              key={stepId}
              label={SETUP_WIZARD_STEP_LABELS[stepId]}
            />
          ))}
        </Stepper>

        {current === "welcome" && <SetupWizardWelcomeStep />}
        {current === "paths" && (
          <SetupWizardPathsStep
            steamCmdStatus={props.steamCmdStatus}
            steamCmdBusy={props.steamCmdBusy}
            defaultBaseFolder={props.defaultBaseFolder}
            onPickSteamCmdPath={props.onPickSteamCmdPath}
            onInstallSteamCmd={props.onInstallSteamCmd}
            onDefaultBaseFolderChange={props.onDefaultBaseFolderChange}
          />
        )}
        {current === "shell" && (
          <SetupWizardShellStep
            uiDensity={props.uiDensity}
            onUiDensityChange={props.onUiDensityChange}
            openNativeTerminalOnStart={props.openNativeTerminalOnStart}
            onOpenNativeTerminalOnStartChange={props.onOpenNativeTerminalOnStartChange}
          />
        )}
        {current === "cluster" && (
          <SetupWizardClusterStep
            shareCluster={shareCluster}
            clusterId={clusterId}
            clusterDir={clusterDir}
            idTouched={idTouched}
            dirTouched={dirTouched}
            browsing={browsing}
            idError={idError}
            dirError={dirError}
            onShareClusterChange={setShareCluster}
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
        {current === "action" && (
          <SetupWizardFirstActionStep
            onCreateServer={() => props.onCreateServer(pendingCluster())}
            onImport={() => props.onImport(pendingCluster())}
            onExplore={() => props.onExplore(pendingCluster())}
          />
        )}

        <Group justify="space-between">
          <Button
            variant="default"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((index) => Math.max(index - 1, 0))}
          >
            Back
          </Button>
          {current !== "action" && (
            <Button disabled={!canContinue} onClick={goNext}>
              {isLast && props.mode === "paths-shell" ? "Done" : "Continue"}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
