import type { ReactElement } from "react";
import { Check } from "@phosphor-icons/react";
import {
  Alert,
  Button,
  Group,
  Progress,
  Skeleton,
  Stack,
  Stepper,
  Text,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { defaultClusterIniFileSelection } from "@shared/cluster-ini-file-selection";
import type {
  ClusterIniTemplate,
  ServerIniSnapshot,
  ServerProfile,
} from "@shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyExperienceProfile,
  applyBreedingPreset,
  applyDifficultyLevel,
  applyProgressionPreset,
  applyWizardDraftToIni,
  applyWorldPreset,
  configurationWizardSchema,
  draftFromIniPayload,
  EXPERIENCE_PROFILES,
  wizardChanges,
  type ConfigurationWizardDraft,
  type BreedingPresetId,
  type ExperienceProfileId,
  type ProgressionPresetId,
  type WorldPresetId,
} from "../../configurationWizardModel";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { showOperatorToast } from "@ui/operatorToast";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { WizardShell } from "./ConfigurationWizardParts";
import { type DifficultyChoice } from "./WizardDifficultyControl";
import { WizardBreedingStep } from "./WizardBreedingStep";
import { WizardChangesModal } from "./WizardChangesModal";
import { WizardFooter } from "./WizardFooter";
import { WizardPaceStep } from "./WizardPaceStep";
import { WizardProfileStep } from "./WizardProfileStep";
import { WizardQolStep } from "./WizardQolStep";
import { WizardReviewStep } from "./WizardReviewStep";
import { WizardWorldStep } from "./WizardWorldStep";
import { STEP_COUNT, STEP_LABELS } from "./wizardSteps";
import classes from "./ConfigurationWizard.module.css";

interface Props {
  server: ServerProfile;
  serverActive: boolean;
  /** First-run create workspace — prefer “Use default configuration” copy. */
  onboarding?: boolean;
  onCancel: () => void;
  onApplied: () => void;
  onDraftChange?: (dirty: boolean) => void;
}

const EMPTY_DRAFT: ConfigurationWizardDraft = {
  profile: "current",
  singlePlayerSettings: false,
  pve: false,
  hardcore: false,
  xpRate: 1,
  harvestRate: 1,
  tamingRate: 1,
  maxWildDinoLevel: 150,
  difficultyOffset: 1,
  overrideOfficialDifficulty: 0,
  eggHatchRate: 1,
  maturationRate: 1,
  matingIntervalMultiplier: 1,
  cuddleIntervalMultiplier: 1,
  matingSpeedMultiplier: 1,
  babyImprintAmountMultiplier: 1,
  babyCuddleGracePeriodMultiplier: 1,
  resourcesRespawnPeriodMultiplier: 1,
  dinoCountMultiplier: 1,
  harvestHealthMultiplier: 1,
  dayCycleSpeedScale: 1,
  nightTimeSpeedScale: 1,
  playerCharacterFoodDrainMultiplier: 1,
  playerCharacterWaterDrainMultiplier: 1,
  structureResistanceMultiplier: 1,
  showMapLocation: true,
  crosshair: true,
  thirdPerson: true,
  flyerCarryPve: false,
  allowCaveBuildingPve: false,
  showFloatingDamageText: false,
  alwaysAllowStructurePickup: false,
  structurePickupSeconds: 30,
};

export function ConfigurationWizard(props: Props): ReactElement {
  const { onDraftChange } = props;
  const compactProgress = useMediaQuery("(max-width: 1100px)", false);
  const [activeStep, setActiveStep] = useState(0);
  const snapshotRef = useRef<ServerIniSnapshot | null>(null);
  const [initialDraft, setInitialDraft] =
    useState<ConfigurationWizardDraft>(EMPTY_DRAFT);
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
    initialValues: EMPTY_DRAFT,
  });

  const clusterId = props.server.clusterId?.trim() || null;
  const clusterPathSelected = form.values.profile === "cluster";
  const useDefaultCopy = props.onboarding === true;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      await runWithFinally(
        async () => {
          const result = await window.api.readServerIni(props.server.id);
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
  }, [props.server.id]);

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
    if (profile === "current") {
      form.setValues({ ...initialDraft, profile: "current" });
      setProgressionPreset("current");
      setBreedingPreset("current");
      setWorldPreset("current");
      setDifficultyChoice("current");
      return;
    }
    if (profile === "cluster") {
      form.setValues({ ...initialDraft, profile: "cluster" });
      setProgressionPreset("current");
      setBreedingPreset("current");
      setWorldPreset("current");
      setDifficultyChoice("current");
      return;
    }
    form.setValues(applyExperienceProfile(form.values, profile));
    const selectedProfile = EXPERIENCE_PROFILES.find(
      (candidate) => candidate.id === profile,
    );
    if (selectedProfile !== undefined) {
      setProgressionPreset(selectedProfile.progressionPreset);
      setBreedingPreset(selectedProfile.breedingPreset);
      setWorldPreset(selectedProfile.worldPreset);
      setDifficultyChoice("150");
    }
  };

  const chooseProgressionPreset = (preset: string) => {
    if (preset === "current") {
      form.setValues({
        ...form.values,
        xpRate: initialDraft.xpRate,
        harvestRate: initialDraft.harvestRate,
        tamingRate: initialDraft.tamingRate,
        resourcesRespawnPeriodMultiplier:
          initialDraft.resourcesRespawnPeriodMultiplier,
      });
      setProgressionPreset("current");
      return;
    }
    const presetId = preset as ProgressionPresetId;
    form.setValues(applyProgressionPreset(form.values, presetId));
    setProgressionPreset(presetId);
  };

  const chooseBreedingPreset = (preset: string) => {
    if (preset === "current") {
      form.setValues({
        ...form.values,
        eggHatchRate: initialDraft.eggHatchRate,
        maturationRate: initialDraft.maturationRate,
        matingIntervalMultiplier: initialDraft.matingIntervalMultiplier,
        cuddleIntervalMultiplier: initialDraft.cuddleIntervalMultiplier,
        matingSpeedMultiplier: initialDraft.matingSpeedMultiplier,
        babyImprintAmountMultiplier: initialDraft.babyImprintAmountMultiplier,
        babyCuddleGracePeriodMultiplier:
          initialDraft.babyCuddleGracePeriodMultiplier,
      });
      setBreedingPreset("current");
      return;
    }
    const presetId = preset as BreedingPresetId;
    form.setValues(applyBreedingPreset(form.values, presetId));
    setBreedingPreset(presetId);
  };

  const chooseWorldPreset = (preset: string) => {
    if (preset === "current") {
      form.setValues({
        ...form.values,
        dinoCountMultiplier: initialDraft.dinoCountMultiplier,
        harvestHealthMultiplier: initialDraft.harvestHealthMultiplier,
        dayCycleSpeedScale: initialDraft.dayCycleSpeedScale,
        nightTimeSpeedScale: initialDraft.nightTimeSpeedScale,
        playerCharacterFoodDrainMultiplier:
          initialDraft.playerCharacterFoodDrainMultiplier,
        playerCharacterWaterDrainMultiplier:
          initialDraft.playerCharacterWaterDrainMultiplier,
        structureResistanceMultiplier: initialDraft.structureResistanceMultiplier,
      });
      setWorldPreset("current");
      return;
    }
    const presetId = preset as WorldPresetId;
    form.setValues(applyWorldPreset(form.values, presetId));
    setWorldPreset(presetId);
  };

  const chooseDifficulty = (choice: string) => {
    const nextChoice = choice as DifficultyChoice;
    setDifficultyChoice(nextChoice);
    if (nextChoice === "current") {
      form.setValues({
        ...form.values,
        maxWildDinoLevel: initialDraft.maxWildDinoLevel,
        difficultyOffset: initialDraft.difficultyOffset,
        overrideOfficialDifficulty: initialDraft.overrideOfficialDifficulty,
      });
      return;
    }
    const level =
      nextChoice === "custom" ? form.values.maxWildDinoLevel : Number(nextChoice);
    form.setValues(applyDifficultyLevel(form.values, level));
  };

  const cancel = () => {
    if (!draftDirty || saved) {
      props.onCancel();
      return;
    }
    modals.openConfirmModal({
      title: "Leave the wizard",
      children: (
        <Text size="sm">
          The draft has changes that have not been applied yet. The server INI files
          will remain untouched.
        </Text>
      ),
      labels: { confirm: "Discard draft", cancel: "Keep editing" },
      confirmProps: { color: "red" },
      onConfirm: props.onCancel,
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
        { ...EMPTY_DRAFT, profile: "current" },
        { ...initialDraft, profile: "current" },
      ).length === 0
    );
  }, [initialDraft]);

  const useClusterSeed =
    props.onboarding === true || draftLooksLikeDefaults;

  const applyClusterDefaults = async () => {
    if (clusterId === null || clusterTemplate === null) return;
    setError(null);
    if (props.serverActive) {
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
              props.server.id,
              files,
            )
          : await window.api.previewClusterIniRestore(
              clusterId,
              props.server.id,
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
              props.server.id,
              files,
            )
          : await window.api.restoreClusterIniFromTemplate(
              clusterId,
              props.server.id,
              files,
            );
        if (!applyResult.ok) {
          setError(applyResult.error ?? "Could not apply cluster defaults");
          return;
        }
        showOperatorToast({
          title: "Cluster defaults applied",
          message: `INI files on ${props.server.name} now match the “${clusterId}” cluster template.`,
        });
        setSaved(true);
        form.resetDirty();
        props.onApplied();
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
        const latestResult = await window.api.readServerIni(props.server.id);
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
        const previewResult = await window.api.previewServerIni(props.server.id, payload);
        if (!previewResult.ok || !previewResult.data.valid) {
          setError(
            previewResult.ok
              ? previewResult.data.issues[0]?.message ?? "Configuration is not valid"
              : previewResult.error ?? "Could not validate the configuration",
          );
          return;
        }
        const result = await window.api.saveServerIni(props.server.id, payload);
        if (!result.ok) {
          setError(result.error ?? "Could not apply the configuration");
          return;
        }
        const appliedCount = previewResult.data.changedCount;
        showOperatorToast({
          title: "Configuration applied",
          message: `${appliedCount} setting${appliedCount === 1 ? " was" : "s were"} updated on ${props.server.name}.`,
        });
        setSaved(true);
        form.resetDirty();
        props.onApplied();
      },
      () => {
        setSaving(false);
      },
    );
  };

  if (loading) {
    return (
      <WizardShell>
        <Skeleton height={28} width="32%" />
        <Skeleton height={18} width="56%" mt="xs" />
        <Skeleton height={64} mt="xl" />
        <Skeleton height={280} mt="lg" />
      </WizardShell>
    );
  }

  if (saved) {
    return (
      <WizardShell>
        <div className={classes.success}>
          <EmptyState
            layout="stacked"
            titleOrder="h3"
            icon={<Check size={28} weight="bold" />}
            title="Configuration applied"
            description="Only the settings in this wizard were changed. Everything else was left as-is."
            action={<Button onClick={props.onCancel}>Back to server</Button>}
          >
            {props.serverActive && (
              <Alert color="fossil" title="Restart pending" maw={520}>
                The new values will take effect when you restart the server.
              </Alert>
            )}
          </EmptyState>
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell>
      <WizardChangesModal
        opened={changesOpen}
        onClose={() => setChangesOpen(false)}
        changes={changes}
        clusterPathSelected={clusterPathSelected}
        clusterId={clusterId}
        useClusterSeed={useClusterSeed}
      />

      <header className={classes.header}>
        <Stack gap={4}>
          <Text className={classes.metaLabel} c="dimmed" size="xs" fw={700}>
            {props.server.name} / Configuration wizard
          </Text>
          <Title order={2}>Set up the play experience</Title>
          <Text c="dimmed" size="sm">
            We start from your current values. Nothing is written until the final review.
          </Text>
        </Stack>
      </header>

      <div className={classes.progress}>
        {compactProgress ? (
          <Stack gap="xxs">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                Step {activeStep + 1} of {STEP_COUNT}
              </Text>
              <Text size="sm" c="dimmed">
                {STEP_LABELS[activeStep]}
              </Text>
            </Group>
            <Progress value={((activeStep + 1) / STEP_COUNT) * 100} size="sm" />
          </Stack>
        ) : (
          <Stack gap="xs">
            <Text className={classes.metaLabel} c="dimmed" size="xs" fw={700}>
              Step {activeStep + 1} of {STEP_COUNT} · {STEP_LABELS[activeStep]}
            </Text>
            <Stepper active={activeStep} allowNextStepsSelect={false} size="sm">
              {STEP_LABELS.map((label) => (
                <Stepper.Step key={label} label={label} />
              ))}
            </Stepper>
          </Stack>
        )}
      </div>

      <main className={classes.content}>
        {error !== null && (
          <Alert color="red" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {activeStep === 0 && (
          <WizardProfileStep
            clusterId={clusterId}
            clusterTemplateReady={clusterTemplateReady}
            clusterTemplate={clusterTemplate}
            clusterPathSelected={clusterPathSelected}
            useDefaultCopy={useDefaultCopy}
            profile={form.values.profile}
            singlePlayerSettings={form.values.singlePlayerSettings}
            onSelectProfile={chooseProfile}
            onSinglePlayerSettingsChange={(checked) =>
              form.setFieldValue("singlePlayerSettings", checked)
            }
          />
        )}

        {activeStep === 1 && (
          <WizardPaceStep
            draft={form.values}
            progressionPreset={progressionPreset}
            difficultyChoice={difficultyChoice}
            onProgressionPresetChange={chooseProgressionPreset}
            onDifficultyChoiceChange={chooseDifficulty}
            onCustomLevelChange={(level) => {
              setDifficultyChoice("custom");
              form.setValues(applyDifficultyLevel(form.values, level));
            }}
          />
        )}

        {activeStep === 2 && (
          <WizardBreedingStep
            draft={form.values}
            breedingPreset={breedingPreset}
            onBreedingPresetChange={chooseBreedingPreset}
          />
        )}

        {activeStep === 3 && (
          <WizardWorldStep
            draft={form.values}
            worldPreset={worldPreset}
            onWorldPresetChange={chooseWorldPreset}
          />
        )}

        {activeStep === 4 && <WizardQolStep form={form} />}

        {activeStep === 5 && (
          <WizardReviewStep
            clusterPathSelected={clusterPathSelected}
            clusterId={clusterId}
            useClusterSeed={useClusterSeed}
            serverActive={props.serverActive}
            changes={changes}
          />
        )}
      </main>

      <WizardFooter
        activeStep={activeStep}
        saving={saving}
        draftDirty={draftDirty}
        changes={changes}
        clusterPathSelected={clusterPathSelected}
        clusterTemplate={clusterTemplate}
        serverActive={props.serverActive}
        onCancel={cancel}
        onPrevious={previous}
        onNext={next}
        onApply={() => void apply()}
        onViewChanges={() => setChangesOpen(true)}
      />
    </WizardShell>
  );
}
