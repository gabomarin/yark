import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Stack, Stepper, Text } from "@mantine/core";
import type { ConfigTransferSelection } from "@shared/config-transfer";
import { emptyConfigTransferSelection } from "@shared/config-transfer";
import type {
  ConfigTransferDescribeResult,
  ConfigTransferPreview,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import {
  allTargetsEligible,
  formatTargetNames,
  listCopyTargets,
  runtimeStatus,
  selectionHasWork,
  type CopyConfigurationStep,
} from "../../copyConfigurationModel";
import { CopyConfigCategoriesStep } from "./CopyConfigCategoriesStep";
import { CopyConfigDoneStep } from "./CopyConfigDoneStep";
import { CopyConfigPreviewStep } from "./CopyConfigPreviewStep";
import { CopyConfigSourceTargetStep } from "./CopyConfigSourceTargetStep";
import { CopyConfigWizardFooter } from "./CopyConfigWizardFooter";
import type { CopyConfigTargetOutcome } from "./copyConfigurationWizardTypes";

interface Props {
  opened: boolean;
  initialSourceId: string | null;
  initialTargetId?: string | null;
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  onClose: () => void;
  onCompleted: (targetIds: string[]) => void;
}

export function CopyConfigurationWizard(props: Props): ReactElement {
  const [step, setStep] = useState<CopyConfigurationStep>(1);
  const [sourceId, setSourceId] = useState<string | null>(
    () => props.initialSourceId,
  );
  const [targetIds, setTargetIds] = useState<string[]>(() =>
    props.initialTargetId !== null && props.initialTargetId !== undefined
      ? [props.initialTargetId]
      : [],
  );
  const [selection, setSelection] = useState<ConfigTransferSelection>(
    emptyConfigTransferSelection,
  );
  const [describe, setDescribe] = useState<ConfigTransferDescribeResult | null>(
    null,
  );
  const [previews, setPreviews] = useState<ConfigTransferPreview[]>([]);
  const [outcomes, setOutcomes] = useState<CopyConfigTargetOutcome[]>([]);
  const [neverOpen, setNeverOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [passwordConfirmed, setPasswordConfirmed] = useState(false);
  const [loadingDescribe, setLoadingDescribe] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetOptions = useMemo(
    () => listCopyTargets(props.servers, sourceId ?? ""),
    [props.servers, sourceId],
  );

  const source = props.servers.find((s) => s.id === sourceId) ?? null;
  const sourceStatus = sourceId
    ? runtimeStatus(props.statuses, sourceId)
    : "stopped";
  const targetsOk = allTargetsEligible(targetIds, props.statuses);
  const targetLabel = formatTargetNames(props.servers, targetIds);

  const loadDescribe = useCallback(async (id: string): Promise<void> => {
    setLoadingDescribe(true);
    setError(null);
    try {
      const res = await window.api.describeConfigTransferSource(id);
      if (!res.ok) {
        setError(res.error ?? "Could not read source configuration");
        setDescribe(null);
        return;
      }
      setDescribe(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDescribe(null);
    } finally {
      setLoadingDescribe(false);
    }
  }, []);

  const goCategories = async (): Promise<void> => {
    if (sourceId === null || targetIds.length === 0 || !targetsOk) return;
    setPreviews([]);
    setOutcomes([]);
    setStep(2);
    await loadDescribe(sourceId);
  };

  const buildPreview = async (): Promise<void> => {
    if (
      sourceId === null ||
      targetIds.length === 0 ||
      !selectionHasWork(selection)
    ) {
      return;
    }
    setLoadingPreview(true);
    setError(null);
    setConfirmed(false);
    setPasswordConfirmed(false);
    try {
      const next: ConfigTransferPreview[] = [];
      for (const targetId of targetIds) {
        const res = await window.api.previewConfigTransfer(
          sourceId,
          targetId,
          selection,
        );
        if (!res.ok) {
          const name =
            props.servers.find((s) => s.id === targetId)?.name ?? targetId;
          setError(res.error ?? `Could not build preview for “${name}”`);
          setPreviews([]);
          return;
        }
        next.push(res.data);
      }
      setPreviews(next);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPreviews([]);
    } finally {
      setLoadingPreview(false);
    }
  };

  const applyCopy = async (): Promise<void> => {
    if (
      sourceId === null ||
      previews.length === 0 ||
      !confirmed ||
      (selection.passwords && !passwordConfirmed)
    ) {
      return;
    }
    setCommitting(true);
    setError(null);
    const nextOutcomes: CopyConfigTargetOutcome[] = [];
    try {
      for (const preview of previews) {
        try {
          const res = await window.api.commitConfigTransfer(
            sourceId,
            preview.targetId,
            selection,
            preview.fingerprint,
          );
          if (!res.ok) {
            nextOutcomes.push({
              targetId: preview.targetId,
              targetName: preview.targetName,
              ok: false,
              error: res.error ?? "Configuration copy failed",
            });
            continue;
          }
          nextOutcomes.push({
            targetId: preview.targetId,
            targetName: preview.targetName,
            ok: true,
            result: res.data,
          });
        } catch (err) {
          nextOutcomes.push({
            targetId: preview.targetId,
            targetName: preview.targetName,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      setOutcomes(nextOutcomes);
      setStep(4);
      if (nextOutcomes.every((o) => !o.ok)) {
        setError("Configuration copy failed for every selected target.");
      }
    } finally {
      setCommitting(false);
    }
  };

  const canLeaveStep1 =
    sourceId !== null &&
    targetIds.length > 0 &&
    !targetIds.includes(sourceId) &&
    targetsOk;

  const canApply =
    confirmed &&
    (!selection.passwords || passwordConfirmed) &&
    previews.length > 0 &&
    previews.every((p) => p.iniPreview.valid) &&
    !committing;

  return (
    <Modal
      opened={props.opened}
      onClose={() => {
        if (!committing) props.onClose();
      }}
      closeOnClickOutside={!committing}
      closeOnEscape={!committing}
      title="Copy configuration"
      size="xl"
      data-copy-configuration-wizard
      styles={{
        body: {
          maxHeight: "min(78vh, 820px)",
          overflowY: "auto",
        },
      }}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Choose stopped targets, then pick what to copy from this server.
        </Text>

        <Stepper active={step - 1} allowNextStepsSelect={false} size="sm">
          <Stepper.Step label="Targets" />
          <Stepper.Step label="What to copy" />
          <Stepper.Step label="Preview" />
          <Stepper.Step label="Done" />
        </Stepper>

        {error !== null && step < 4 && (
          <Alert color="red" title="Could not continue">
            {error}
          </Alert>
        )}

        {step === 1 && sourceId !== null && (
          <CopyConfigSourceTargetStep
            sourceName={source?.name ?? "…"}
            sourceStatus={sourceStatus}
            sourceMap={source?.map ?? "—"}
            sourceClusterId={source?.clusterId ?? null}
            targetIds={targetIds}
            targetOptions={targetOptions}
            statuses={props.statuses}
            neverOpen={neverOpen}
            onTargetIdsChange={setTargetIds}
            onToggleNeverOpen={() => setNeverOpen((v) => !v)}
          />
        )}

        {step === 2 && (
          <CopyConfigCategoriesStep
            sourceName={source?.name ?? "…"}
            targetLabel={targetLabel}
            selection={selection}
            describe={describe}
            loadingDescribe={loadingDescribe}
            onChange={setSelection}
          />
        )}

        {step === 3 && previews.length > 0 && (
          <CopyConfigPreviewStep
            previews={previews}
            passwordsSelected={selection.passwords}
            confirmed={confirmed}
            passwordConfirmed={passwordConfirmed}
            onConfirmedChange={setConfirmed}
            onPasswordConfirmedChange={setPasswordConfirmed}
          />
        )}

        {step === 4 && outcomes.length > 0 && (
          <CopyConfigDoneStep
            sourceName={source?.name ?? "the source"}
            servers={props.servers}
            outcomes={outcomes}
            onClose={props.onClose}
            onCompleted={props.onCompleted}
          />
        )}

        {step < 4 && (
          <CopyConfigWizardFooter
            step={step}
            canLeaveStep1={canLeaveStep1}
            canPreview={selectionHasWork(selection)}
            canApply={canApply}
            loadingPreview={loadingPreview}
            committing={committing}
            previewCount={previews.length}
            onClose={props.onClose}
            onBack={() => setStep((s) => (s - 1) as CopyConfigurationStep)}
            onNext={() => void goCategories()}
            onPreview={() => void buildPreview()}
            onApply={() => void applyCopy()}
          />
        )}
      </Stack>
    </Modal>
  );
}
