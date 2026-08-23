import { useForm, type UseFormReturnType } from "@mantine/form";
import { modals } from "@mantine/modals";
import { defaultClusterIniFileSelection } from "@shared/cluster-ini-file-selection";
import type {
  ClusterIniTemplate,
  ServerIniSnapshot,
  ServerProfile,
} from "@shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyDifficultyLevel,
  applyWizardDraftToIni,
  configurationWizardSchema,
  draftFromIniPayload,
  wizardChanges,
  type ConfigurationWizardDraft,
  type BreedingPresetId,
  type ExperienceProfileId,
  type ProgressionPresetId,
  type WorldPresetId,
} from "../../../configuration-wizard/configurationWizardModel";
import { showOperatorToast } from "@ui/operatorToast";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import {
  draftForBreedingPreset,
  draftForDifficultyChoice,
  draftForProfileChoice,
  draftForProgressionPreset,
  draftForWorldPreset,
  EMPTY_WIZARD_DRAFT,
} from "../model/configurationWizardChoosers";
import { type DifficultyChoice } from "../WizardDifficultyControl";
import { STEP_COUNT } from "../wizardSteps";

export interface UseConfigurationWizardOptions {
  server: ServerProfile;
  serverActive: boolean;
  /** First-run create workspace — prefer “Use default configuration” copy. */
  onboarding?: boolean;
  onCancel: () => void;
  onApplied: () => void;
  onDraftChange?: (dirty: boolean) => void;
}

export function useConfigurationWizard(options: UseConfigurationWizardOptions): {
  form: UseFormReturnType<ConfigurationWizardDraft>;
  activeStep: number;
  loading: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  changesOpen: boolean;
  setChangesOpen: (open: boolean) => void;
  progressionPreset: ProgressionPresetId | "current";
  breedingPreset: BreedingPresetId | "current";
  worldPreset: WorldPresetId | "current";
  difficultyChoice: DifficultyChoice;
  clusterId: string | null;
  clusterTemplate: ClusterIniTemplate | null;
  clusterTemplateReady: boolean;
  clusterPathSelected: boolean;
  useDefaultCopy: boolean;
  useClusterSeed: boolean;
  changes: ReturnType<typeof wizardChanges>;
  draftDirty: boolean;
  chooseProfile: (profile: ExperienceProfileId) => void;
  chooseProgressionPreset: (preset: string) => void;
  chooseBreedingPreset: (preset: string) => void;
  chooseWorldPreset: (preset: string) => void;
  chooseDifficulty: (choice: string) => void;
  chooseCustomDifficultyLevel: (level: number) => void;
  cancel: () => void;
  next: () => void;
  previous: () => void;
  apply: () => Promise<void>;
} {
  const { onDraftChange } = options;
  const [activeStep, setActiveStep] = useState(0);
  const snapshotRef = useRef<ServerIniSnapshot | null>(null);
  const [initialDraft, setInitialDraft] =
    useState<ConfigurationWizardDraft>(EMPTY_WIZARD_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [progressionPreset, setProgressionPreset] = useState<
    ProgressionPresetId | "current"
  >("current");
  const [breedingPreset, setBreedingPreset] = useState<
    BreedingPresetId | "current"
  >("current");
  const [worldPreset, setWorldPreset] = useState<WorldPresetId | "current">(
    "current",
  );
  const [difficultyChoice, setDifficultyChoice] =
    useState<DifficultyChoice>("current");
  const [error, setError] = useState<string | null>(null);
  const [clusterTemplate, setClusterTemplate] = useState<
    ClusterIniTemplate | null
  >(null);
  const [clusterTemplateReady, setClusterTemplateReady] = useState(false);
  const form = useForm<ConfigurationWizardDraft>({
    mode: "controlled",
    initialValues: EMPTY_WIZARD_DRAFT,
  });

  const clusterId = options.server.clusterId?.trim() || null;
  const clusterPathSelected = form.values.profile === "cluster";
  const useDefaultCopy = options.onboarding === true;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      await runWithFinally(
        async () => {
          const result = await window.api.readServerIni(options.server.id);
          if (!alive) return;
          if (!result.ok) {
            setError(result.error ?? "Could not read the current configuration");
            return;
          }
          const draft = draftFromIniPayload(result.data.payload);
          snapshotRef.current = result.data;
          setInitialDraft(draft);
          form.initialize(draft);
        },
        () => {
          if (alive) {
            setLoading(false);
          }
        },
      );
    };
    void load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form is stable from useForm, only reload on server id change
  }, [options.server.id]);

  useEffect(() => {
    let alive = true;
    setClusterTemplateReady(false);
    setClusterTemplate(null);
    if (clusterId === null) {
      setClusterTemplateReady(true);
      return () => {
        alive = false;
      };
    }
    void runWithFinally(
      async () => {
        try {
          const result = await window.api.getClusterIniTemplate(clusterId);
          if (!alive) return;
          if (result.ok && result.data !== null) {
            setClusterTemplate(result.data);
          } else {
            setClusterTemplate(null);
          }
        } catch {
          if (alive) setClusterTemplate(null);
        }
      },
      () => {
        if (alive) setClusterTemplateReady(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [clusterId]);

  const changes = useMemo(
    () => wizardChanges(initialDraft, form.values),
    [form.values, initialDraft],
  );

  const draftDirty = changes.length > 0 || clusterPathSelected;

  useEffect(() => {
    onDraftChange?.(draftDirty);
  }, [draftDirty, onDraftChange]);

  const chooseProfile = (profile: ExperienceProfileId) => {
    const { draft, presets } = draftForProfileChoice(
      profile,
      form.values,
      initialDraft,
    );
    form.setValues(draft);
    setProgressionPreset(presets.progressionPreset);
    setBreedingPreset(presets.breedingPreset);
    setWorldPreset(presets.worldPreset);
    setDifficultyChoice(presets.difficultyChoice);
  };

  const chooseProgressionPreset = (preset: string) => {
    const result = draftForProgressionPreset(preset, form.values, initialDraft);
    form.setValues(result.draft);
    setProgressionPreset(result.progressionPreset);
  };

  const chooseBreedingPreset = (preset: string) => {
    const result = draftForBreedingPreset(preset, form.values, initialDraft);
    form.setValues(result.draft);
    setBreedingPreset(result.breedingPreset);
  };

  const chooseWorldPreset = (preset: string) => {
    const result = draftForWorldPreset(preset, form.values, initialDraft);
    form.setValues(result.draft);
    setWorldPreset(result.worldPreset);
  };

  const chooseDifficulty = (choice: string) => {
    const result = draftForDifficultyChoice(choice, form.values, initialDraft);
    form.setValues(result.draft);
    setDifficultyChoice(result.difficultyChoice);
  };

  const chooseCustomDifficultyLevel = (level: number) => {
    setDifficultyChoice("custom");
    form.setValues(applyDifficultyLevel(form.values, level));
  };

  const cancel = () => {
    if (!draftDirty || saved) {
      options.onCancel();
      return;
    }
    modals.openConfirmModal({
      title: "Leave the wizard",
      children:
        "The draft has changes that have not been applied yet. The server INI files will remain untouched.",
      labels: { confirm: "Discard draft", cancel: "Keep editing" },
      confirmProps: { color: "red" },
      onConfirm: options.onCancel,
    });
  };

  const next = () => {
    if (clusterPathSelected) {
      setActiveStep(STEP_COUNT - 1);
      return;
    }
    setActiveStep((current) => Math.min(current + 1, STEP_COUNT - 1));
  };
  const previous = () => {
    if (clusterPathSelected && activeStep === STEP_COUNT - 1) {
      setActiveStep(0);
      return;
    }
    setActiveStep((current) => Math.max(current - 1, 0));
  };

  const draftLooksLikeDefaults = useMemo(() => {
    return (
      wizardChanges(
        { ...EMPTY_WIZARD_DRAFT, profile: "current" },
        { ...initialDraft, profile: "current" },
      ).length === 0
    );
  }, [initialDraft]);

  const useClusterSeed =
    options.onboarding === true || draftLooksLikeDefaults;

  const applyClusterDefaults = async () => {
    if (clusterId === null || clusterTemplate === null) return;
    setError(null);
    if (options.serverActive) {
      setError("Stop the server before applying cluster defaults.");
      return;
    }
    setSaving(true);
    const files = defaultClusterIniFileSelection();
    await runWithFinally(
      async () => {
        const previewResult = useClusterSeed
          ? await window.api.previewClusterIniSeed(
              clusterId,
              options.server.id,
              files,
            )
          : await window.api.previewClusterIniRestore(
              clusterId,
              options.server.id,
              files,
            );
        if (!previewResult.ok) {
          setError(previewResult.error ?? "Could not preview cluster defaults");
          return;
        }
        if (!previewResult.data.preview.valid) {
          setError(
            previewResult.data.preview.issues[0]?.message ??
              "Cluster template preview is not valid",
          );
          return;
        }
        const applyResult = useClusterSeed
          ? await window.api.seedClusterIniFromTemplate(
              clusterId,
              options.server.id,
              files,
            )
          : await window.api.restoreClusterIniFromTemplate(
              clusterId,
              options.server.id,
              files,
            );
        if (!applyResult.ok) {
          setError(applyResult.error ?? "Could not apply cluster defaults");
          return;
        }
        showOperatorToast({
          title: "Cluster defaults applied",
          message: `INI files on ${options.server.name} now match the “${clusterId}” cluster template.`,
        });
        setSaved(true);
        form.resetDirty();
        options.onApplied();
      },
      () => {
        setSaving(false);
      },
    );
  };

  const apply = async () => {
    if (clusterPathSelected) {
      await applyClusterDefaults();
      return;
    }
    if (snapshotRef.current === null) return;
    setError(null);
    const parsed = configurationWizardSchema.safeParse(form.values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the wizard values");
      return;
    }

    setSaving(true);
    await runWithFinally(
      async () => {
        const latestResult = await window.api.readServerIni(options.server.id);
        if (!latestResult.ok) {
          setError(
            latestResult.error ??
              "Could not re-read the configuration before applying",
          );
          return;
        }
        // Overlay only curated settings onto the latest version so
        // external changes made while the wizard was open are not wiped.
        const payload = applyWizardDraftToIni(latestResult.data.payload, parsed.data);
        const previewResult = await window.api.previewServerIni(
          options.server.id,
          payload,
        );
        if (!previewResult.ok || !previewResult.data.valid) {
          setError(
            previewResult.ok
              ? previewResult.data.issues[0]?.message ?? "Configuration is not valid"
              : previewResult.error ?? "Could not validate the configuration",
          );
          return;
        }
        const result = await window.api.saveServerIni(options.server.id, payload);
        if (!result.ok) {
          setError(result.error ?? "Could not apply the configuration");
          return;
        }
        const appliedCount = previewResult.data.changedCount;
        showOperatorToast({
          title: "Configuration applied",
          message: `${appliedCount} setting${appliedCount === 1 ? " was" : "s were"} updated on ${options.server.name}.`,
        });
        setSaved(true);
        form.resetDirty();
        options.onApplied();
      },
      () => {
        setSaving(false);
      },
    );
  };

  return {
    form,
    activeStep,
    loading,
    saving,
    saved,
    error,
    setError,
    changesOpen,
    setChangesOpen,
    progressionPreset,
    breedingPreset,
    worldPreset,
    difficultyChoice,
    clusterId,
    clusterTemplate,
    clusterTemplateReady,
    clusterPathSelected,
    useDefaultCopy,
    useClusterSeed,
    changes,
    draftDirty,
    chooseProfile,
    chooseProgressionPreset,
    chooseBreedingPreset,
    chooseWorldPreset,
    chooseDifficulty,
    chooseCustomDifficultyLevel,
    cancel,
    next,
    previous,
    apply,
  };
}
