import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";
import { Alert, Button, Group, Modal, Stack, Stepper } from "@mantine/core";
import {
  getServerFolderNameError,
  isValidServerFolderName,
} from "@shared/server-install-path";
import { isOfficialMap, normalizeMapToken } from "@shared/map-identity";
import type { ImportInstallProbe, ModMetadata, ServerProfile } from "@shared/types";
import type { KnownClusterOption } from "@features/clusters/knownClusterOptions";
import { listKnownClusterOptions } from "@features/clusters/knownClusterOptions";
import {
  applyPreferredCluster,
  canImportInstallProceed,
  emptyImportForm,
  formToProfileInput,
  suggestionsToForm,
  type ImportFormState,
  type ImportInstallStep,
} from "../../importInstallModel";
import { ImportInstallEditStep } from "./ImportInstallEditStep";
import { ImportInstallPathStep } from "./ImportInstallPathStep";
import { ImportInstallReviewStep } from "./ImportInstallReviewStep";

/** Collapse the mods list by default when the inventory would dominate the step. */
const MODS_LIST_AUTO_COLLAPSE_AT = 8;

interface Props {
  opened: boolean;
  servers: ServerProfile[];
  onClose: () => void;
  onImported: (profile: ServerProfile) => void;
  onOpenClusters?: () => void;
  extraClusterOptions?: KnownClusterOption[];
}

export function ImportInstallWizard(props: Props): ReactElement {
  const [step, setStep] = useState<ImportInstallStep>(1);
  const [installDir, setInstallDir] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<ImportInstallProbe | null>(null);
  const [allowIncompleteInstall, setAllowIncompleteInstall] = useState(false);
  const [modsOpen, setModsOpen] = useState(false);
  const [modMetadata, setModMetadata] = useState<Record<string, ModMetadata>>({});
  const [form, setForm] = useState<ImportFormState>(emptyImportForm);

  const knownClusters = useMemo(
    () =>
      listKnownClusterOptions(props.servers, {
        extra: props.extraClusterOptions,
      }),
    [props.extraClusterOptions, props.servers],
  );
  const preferredCluster =
    props.extraClusterOptions?.length === 1 ? props.extraClusterOptions[0] : undefined;

  const handleModMetadataChange = useCallback(
    (patch: Record<string, ModMetadata>) => {
      setModMetadata((previous) => ({ ...previous, ...patch }));
    },
    [],
  );

  // Parent remounts this wizard on each open (`key={importWizardKey}`) so form
  // state starts fresh without an adjust-on-prop-change close effect.

  const applyProbe = (next: ImportInstallProbe): void => {
    // Keep UI path in sync with backend normalizeWindowsPath (trailing separators, etc.).
    setInstallDir(next.installDir);
    setProbe(next);
    setAllowIncompleteInstall(false);
    setForm(
      applyPreferredCluster(suggestionsToForm(next.suggestions), preferredCluster),
    );
    setModMetadata({});
    setModsOpen(
      next.suggestions.mods.length > 0 &&
        next.suggestions.mods.length < MODS_LIST_AUTO_COLLAPSE_AT,
    );
  };

  const nameError =
    form.name.trim().length > 0 && !isValidServerFolderName(form.name)
      ? getServerFolderNameError(form.name)
      : null;

  const canContinueStep1 =
    installDir.trim().length > 0 &&
    probe !== null &&
    probe.installDir === installDir.trim() &&
    canImportInstallProceed(probe, allowIncompleteInstall);

  const probePath = async (path: string): Promise<ImportInstallProbe | null> => {
    const trimmed = path.trim();
    if (trimmed.length === 0) {
      setError("Choose an install folder first");
      return null;
    }
    setProbing(true);
    setError(null);
    try {
      const result = await window.api.probeImportInstall(trimmed);
      if (!result.ok) {
        setError(result.error ?? "Could not inspect install");
        setProbe(null);
        return null;
      }
      applyProbe(result.data);
      // Always return the probe — incomplete may continue after opt-in (#283).
      setError(null);
      return result.data;
    } finally {
      setProbing(false);
    }
  };

  const handleBrowse = async (): Promise<void> => {
    setBrowsing(true);
    setError(null);
    try {
      const result = await window.api.pickPath(
        "directory",
        installDir.trim().length > 0 ? installDir : undefined,
        "Select the ASA install root (contains ShooterGame)",
      );
      if (!result.ok) {
        setError(result.error ?? "Could not open folder picker");
        return;
      }
      if (result.data !== null) {
        setInstallDir(result.data);
        setProbe(null);
        setAllowIncompleteInstall(false);
        setModMetadata({});
        await probePath(result.data);
      }
    } finally {
      setBrowsing(false);
    }
  };

  const handleContinueFromStep1 = async (): Promise<void> => {
    let current = probe;
    let optedIn = allowIncompleteInstall;
    if (current === null || current.installDir !== installDir.trim()) {
      const previousOptIn = allowIncompleteInstall;
      current = await probePath(installDir);
      if (current === null) return;
      // applyProbe clears the checkbox; restore when the new probe is still incomplete.
      optedIn =
        previousOptIn &&
        current.alreadyManagedBy === null &&
        !current.nestedSubfolder &&
        current.installation.health === "incomplete";
      if (optedIn) {
        setAllowIncompleteInstall(true);
      }
    }
    if (!canImportInstallProceed(current, optedIn)) return;
    setStep(2);
  };

  const handleImport = async (): Promise<void> => {
    if (probe === null || !canImportInstallProceed(probe, allowIncompleteInstall)) {
      return;
    }
    if (nameError !== null) {
      setError(nameError);
      return;
    }
    const mapToken = normalizeMapToken(form.map);
    if (mapToken.length === 0) {
      setError("Map required");
      return;
    }
    if (/\s/.test(mapToken)) {
      setError("Map token must not contain spaces");
      return;
    }
    if (!isOfficialMap(mapToken) && !mapToken.includes("_WP")) {
      setError("Custom map token usually ends with _WP (example: Svartalfheim_WP)");
      return;
    }

    const inputOrError = formToProfileInput(
      { ...form, map: mapToken },
      probe.installDir,
      probe.suggestions.mods,
      modMetadata,
    );
    if ("error" in inputOrError) {
      setError(inputOrError.error);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await window.api.importExistingServer(inputOrError, {
        allowIncompleteInstall:
          probe.installation.health === "incomplete"
            ? allowIncompleteInstall
            : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not import install");
        return;
      }
      props.onImported(result.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="Import install"
      size="lg"
      centered
      closeOnClickOutside={!saving && !probing}
      closeOnEscape={!saving && !probing}
      withCloseButton={!saving && !probing}
    >
      <Stack gap="md">
        <Stepper active={step - 1} allowNextStepsSelect={false} size="sm">
          <Stepper.Step label="Choose folder" />
          <Stepper.Step label="Review detection" />
          <Stepper.Step label="Edit & import" />
        </Stepper>

        {error !== null && (step !== 1 || probe === null) && (
          <Alert color="red" title="Could not continue">
            {error}
          </Alert>
        )}

        {step === 1 && (
          <ImportInstallPathStep
            installDir={installDir}
            browsing={browsing}
            probing={probing}
            probe={probe}
            allowIncompleteInstall={allowIncompleteInstall}
            onAllowIncompleteInstallChange={setAllowIncompleteInstall}
            onInstallDirChange={(value) => {
              setInstallDir(value);
              setProbe(null);
              setAllowIncompleteInstall(false);
              setModMetadata({});
              setError(null);
            }}
            onBrowse={() => void handleBrowse()}
            onUseSuggestedDir={(path) => {
              setInstallDir(path);
              setProbe(null);
              setAllowIncompleteInstall(false);
              setModMetadata({});
              setError(null);
              void probePath(path);
            }}
          />
        )}

        {step === 2 && probe !== null && (
          <ImportInstallReviewStep
            probe={probe}
            modsOpen={modsOpen}
            onModsOpenChange={setModsOpen}
            modMetadata={modMetadata}
            onModMetadataChange={handleModMetadataChange}
          />
        )}

        {step === 3 && probe !== null && (
          <ImportInstallEditStep
            servers={props.servers}
            form={form}
            installDir={probe.installDir}
            nameError={nameError}
            knownClusters={knownClusters}
            mapMods={Object.values(modMetadata)}
            onOpenClusters={props.onOpenClusters}
            onChange={setForm}
          />
        )}

        <Group justify="space-between">
          <Button
            variant="subtle"
            color="gray"
            disabled={saving || probing}
            onClick={() => {
              if (step === 1) {
                props.onClose();
                return;
              }
              setStep((step - 1) as ImportInstallStep);
              setError(null);
            }}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          <Group gap="xs">
            {step === 1 && (
              <Button
                loading={probing}
                disabled={!canContinueStep1 || browsing}
                onClick={() => void handleContinueFromStep1()}
              >
                Continue
              </Button>
            )}
            {step === 2 && (
              <Button onClick={() => setStep(3)}>Continue</Button>
            )}
            {step === 3 && (
              <Button loading={saving} onClick={() => void handleImport()}>
                Import profile
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
