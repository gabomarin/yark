import type { ReactElement } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CirclesThreePlus,
  Eye,
  FloppyDisk,
  X,
} from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Progress,
  SimpleGrid,
  Skeleton,
  Stack,
  Stepper,
  Switch,
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
  BREEDING_PRESETS,
  configurationWizardSchema,
  draftFromIniPayload,
  EXPERIENCE_PROFILES,
  PROGRESSION_PRESETS,
  SINGLE_PLAYER_RATE_FACTORS,
  WORLD_PRESETS,
  wizardChanges,
  type ConfigurationWizardDraft,
  type BreedingPresetId,
  type ExperienceProfileId,
  type ProgressionPresetId,
  type WorldPresetId,
} from "../../configurationWizardModel";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { showOperatorToast } from "@ui/operatorToast";
import {
  ChangeRow,
  effectiveRateLabel,
  PresetSelector,
  PresetValue,
  ProfileCard,
  SettingSwitch,
  WizardShell,
  WizardStep,
} from "./ConfigurationWizardParts";
import {
  WizardDifficultyControl,
  type DifficultyChoice,
} from "./WizardDifficultyControl";
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

const STEP_LABELS = ["Profile", "Pace", "Breeding", "World", "QoL", "Review"];
const STEP_COUNT = STEP_LABELS.length;

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
      try {
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
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
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
    void (async () => {
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
      } finally {
        if (alive) setClusterTemplateReady(true);
      }
    })();
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
    try {
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
    } finally {
      setSaving(false);
    }
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
    try {
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
    } finally {
      setSaving(false);
    }
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
      <Modal
        opened={changesOpen}
        onClose={() => setChangesOpen(false)}
        title="Draft changes"
        size="lg"
        centered
      >
        <Text c="dimmed" size="sm" mb="md">
          These values have not been applied yet. You can confirm them on the last
          step.
        </Text>
        {changes.length === 0 && !clusterPathSelected ? (
          <Alert color="blue">The draft matches the current configuration.</Alert>
        ) : clusterPathSelected ? (
          <Alert color="blue" title="Cluster defaults">
            Apply will copy the full “{clusterId}” INI template onto this server
            ({useClusterSeed ? "Seed" : "Restore"}). Ports, passwords, and session
            name stay on this profile.
          </Alert>
        ) : (
          <Stack gap="xs">
            {changes.map((change) => (
              <ChangeRow key={change.field} change={change} />
            ))}
          </Stack>
        )}
      </Modal>

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
          <WizardStep
            title="What kind of server do you want?"
            description="Pick a starting point. You can fine-tune each value before applying."
          >
            {clusterId !== null && clusterTemplateReady && (
              <Stack gap="sm">
                {clusterTemplate !== null ? (
                  <ProfileCard
                    id="cluster"
                    name="Match cluster defaults"
                    description={`Pull the shared INI from “${clusterId}”. Ports, session name, and passwords on this server stay put.`}
                    chips={["Cluster template", "Skips ahead"]}
                    selected={clusterPathSelected}
                    onSelect={chooseProfile}
                  />
                ) : (
                  <Alert color="blue" title="No cluster INI template yet">
                    This server is in “{clusterId}”, but that cluster has no saved INI
                    template. Create one on the Clusters page, then reopen this wizard to
                    match fleet defaults in one step.
                  </Alert>
                )}
                <Divider
                  label="Or use a different preset"
                  labelPosition="center"
                  className={classes.profilePresetDivider}
                />
              </Stack>
            )}

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <ProfileCard
                id="current"
                name={
                  useDefaultCopy
                    ? "Use default configuration"
                    : "Keep current configuration"
                }
                description={
                  useDefaultCopy
                    ? "YARK’s stock rates. You’ll still walk the steps before anything is written."
                    : "Leave what’s already on disk and only change what you decide in the next steps."
                }
                chips={useDefaultCopy ? ["Defaults"] : ["No preset"]}
                selected={form.values.profile === "current"}
                onSelect={chooseProfile}
              />
              {EXPERIENCE_PROFILES.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  id={profile.id}
                  name={profile.name}
                  description={profile.description}
                  chips={profile.chips}
                  selected={form.values.profile === profile.id}
                  onSelect={chooseProfile}
                />
              ))}
            </SimpleGrid>

            {clusterPathSelected ? (
              <Alert color="blue" title="Cluster path">
                Continue goes straight to review. Apply copies the full cluster INI
                template onto this server (same as Seed / Restore on Clusters).
              </Alert>
            ) : (
              <>
                <Alert color="fossil" className={classes.impactAlert}>
                  <Group justify="space-between" align="center" gap="md" wrap="nowrap">
                    <Stack gap={6} style={{ minWidth: 0 }}>
                      <Group gap="xs" wrap="nowrap">
                        <Text component="span" fw={700} size="sm">
                          Enable single-player settings
                        </Text>
                        <Badge size="xs" color="fossil" variant="light" tt="none">
                          High impact
                        </Badge>
                      </Group>
                      <Text size="sm" c="dimmed">
                        Meant for small tribes. When this is on, the rates you pick in
                        Pace and Breeding are only the starting point. ARK multiplies
                        them again, and those steps show the combined result. You also
                        level and unlock engrams faster, and your tames gain extra
                        health and damage.
                      </Text>
                    </Stack>
                    <Switch
                      checked={form.values.singlePlayerSettings}
                      onChange={(event) =>
                        form.setFieldValue(
                          "singlePlayerSettings",
                          event.currentTarget.checked,
                        )
                      }
                      aria-label="Enable single-player settings"
                    />
                  </Group>
                </Alert>
              </>
            )}
          </WizardStep>
        )}

        {activeStep === 1 && (
          <WizardStep
            title="Set the progression pace"
            description="Choose how progression should feel. Exact rates stay visible before you apply."
          >
            <PresetSelector
              value={progressionPreset}
              onChange={chooseProgressionPreset}
              presets={PROGRESSION_PRESETS}
              currentDescription="Keep the values this server already uses."
              paced
              ariaLabel="Progression pace"
            >
              <SimpleGrid cols={{ base: 1, xs: 2, sm: 4 }} spacing="xs">
                <PresetValue label="Experience" value={`${form.values.xpRate}×`} />
                <PresetValue label="Harvesting" value={`${form.values.harvestRate}×`} />
                <PresetValue
                  label="Taming"
                  value={effectiveRateLabel(
                    form.values.tamingRate,
                    SINGLE_PLAYER_RATE_FACTORS.tamingRate,
                    form.values.singlePlayerSettings,
                  )}
                />
                <PresetValue
                  label="Resource respawn"
                  value={`${form.values.resourcesRespawnPeriodMultiplier}×`}
                />
              </SimpleGrid>
            </PresetSelector>
            <Text c="dimmed" size="xs">
              For resource respawn, a lower value means nodes come back sooner.
            </Text>
            {form.values.singlePlayerSettings && (
              <Text c="yellow.3" size="xs">
                Single-player mode also reduces XP requirements, so the final XP effect
                cannot be expressed as a single multiplier.
              </Text>
            )}
            <WizardDifficultyControl
              choice={difficultyChoice}
              draft={form.values}
              onChoiceChange={chooseDifficulty}
              onCustomLevelChange={(level) => {
                setDifficultyChoice("custom");
                form.setValues(applyDifficultyLevel(form.values, level));
              }}
            />
          </WizardStep>
        )}

        {activeStep === 2 && (
          <WizardStep
            title="Tune breeding"
            description="Pick an intensity; the wizard coordinates hatching, growth, mating, and care."
          >
            <PresetSelector
              value={breedingPreset}
              onChange={chooseBreedingPreset}
              presets={BREEDING_PRESETS}
              currentDescription="Keep the combination this server already uses."
              paced
              ariaLabel="Breeding pace"
            >
              <SimpleGrid cols={{ base: 1, xs: 2, sm: 4 }} spacing="xs">
                <PresetValue
                  label="Hatching"
                  value={effectiveRateLabel(
                    form.values.eggHatchRate,
                    SINGLE_PLAYER_RATE_FACTORS.eggHatchRate,
                    form.values.singlePlayerSettings,
                  )}
                />
                <PresetValue
                  label="Maturation"
                  value={effectiveRateLabel(
                    form.values.maturationRate,
                    SINGLE_PLAYER_RATE_FACTORS.maturationRate,
                    form.values.singlePlayerSettings,
                  )}
                />
                <PresetValue
                  label="Mating wait"
                  value={effectiveRateLabel(
                    form.values.matingIntervalMultiplier,
                    SINGLE_PLAYER_RATE_FACTORS.matingIntervalMultiplier,
                    form.values.singlePlayerSettings,
                  )}
                />
                <PresetValue
                  label="Mating speed"
                  value={`${form.values.matingSpeedMultiplier}×`}
                />
                <PresetValue
                  label="Cuddle interval"
                  value={effectiveRateLabel(
                    form.values.cuddleIntervalMultiplier,
                    SINGLE_PLAYER_RATE_FACTORS.cuddleIntervalMultiplier,
                    form.values.singlePlayerSettings,
                  )}
                />
                <PresetValue
                  label="Imprint amount"
                  value={`${form.values.babyImprintAmountMultiplier}×`}
                />
                <PresetValue
                  label="Cuddle grace"
                  value={`${form.values.babyCuddleGracePeriodMultiplier}×`}
                />
              </SimpleGrid>
            </PresetSelector>
            <Text c="dimmed" size="xs">
              Cuddle interval scales with maturation so imprint can still reach 100%.
              Faster presets give more % per cuddle so you can miss a few care windows;
              no preset is meant for a single one-shot cuddle on long raises.
            </Text>
          </WizardStep>
        )}

        {activeStep === 3 && (
          <WizardStep
            title="Define how the world feels"
            description="Pick an intensity from Very easy to Very hard. Max players stays in server settings."
          >
            <PresetSelector
              value={worldPreset}
              onChange={chooseWorldPreset}
              presets={WORLD_PRESETS}
              currentDescription="Keep the combination this server already uses."
              worldFeel
              ariaLabel="World feel"
            >
              <SimpleGrid cols={{ base: 1, xs: 2, sm: 4 }} spacing="xs">
                <PresetValue
                  label="Dinosaur density"
                  value={`${form.values.dinoCountMultiplier}×`}
                />
                <PresetValue
                  label="Node health"
                  value={`${form.values.harvestHealthMultiplier}×`}
                />
                <PresetValue
                  label="Structure resistance"
                  value={`${form.values.structureResistanceMultiplier}×`}
                />
                <PresetValue
                  label="Day speed"
                  value={`${form.values.dayCycleSpeedScale}×`}
                />
                <PresetValue
                  label="Night speed"
                  value={`${form.values.nightTimeSpeedScale}×`}
                />
                <PresetValue
                  label="Food drain"
                  value={`${form.values.playerCharacterFoodDrainMultiplier}×`}
                />
                <PresetValue
                  label="Water drain"
                  value={`${form.values.playerCharacterWaterDrainMultiplier}×`}
                />
              </SimpleGrid>
            </PresetSelector>
            <Text c="dimmed" size="xs">
              For food and water, a lower value means less hunger and thirst. For night,
              a higher value shortens darkness.
            </Text>
          </WizardStep>
        )}

        {activeStep === 4 && (
          <WizardStep
            title="Choose comfort rules"
            description="Common comfort settings, not performance tuning."
          >
            <Stack gap="xs">
              <SettingSwitch label="PvE server" description="Prevents direct combat between players." {...form.getInputProps("pve", { type: "checkbox" })} />
              <SettingSwitch label="Hardcore mode" description="On death, the character resets to level 1." {...form.getInputProps("hardcore", { type: "checkbox" })} />
              <SettingSwitch label="Show map location" description="Each player can see their exact location." {...form.getInputProps("showMapLocation", { type: "checkbox" })} />
              <SettingSwitch label="Show crosshair" description="Shows an on-screen aiming reference." {...form.getInputProps("crosshair", { type: "checkbox" })} />
              <SettingSwitch label="Allow third person" description="Players can switch the camera to third person." {...form.getInputProps("thirdPerson", { type: "checkbox" })} />
              <SettingSwitch label="Carry creatures with flyers in PvE" description="Allows picking up creatures with flyers." {...form.getInputProps("flyerCarryPve", { type: "checkbox" })} />
              <SettingSwitch
                label="Allow cave building in PvE"
                description="Lets tribes build inside caves on PvE servers."
                {...form.getInputProps("allowCaveBuildingPve", { type: "checkbox" })}
              />
              <SettingSwitch
                label="Show floating damage text"
                description="Shows damage numbers when hitting creatures or structures."
                {...form.getInputProps("showFloatingDamageText", { type: "checkbox" })}
              />
              <SettingSwitch
                label="Always allow structure pickup"
                description="Skip the post-placement timer so structures can be picked up anytime."
                {...form.getInputProps("alwaysAllowStructurePickup", { type: "checkbox" })}
              />
              <NumberInput
                label="Structure pickup time"
                description={
                  form.values.alwaysAllowStructurePickup
                    ? "Not used while always-allow pickup is on."
                    : "Seconds available after placing them. Use 0 for immediate pickup."
                }
                min={0}
                max={3600}
                suffix=" s"
                allowDecimal={false}
                disabled={form.values.alwaysAllowStructurePickup}
                {...form.getInputProps("structurePickupSeconds")}
              />
            </Stack>
          </WizardStep>
        )}

        {activeStep === 5 && (
          <WizardStep
            title={
              clusterPathSelected
                ? "Review cluster defaults"
                : "Review before applying"
            }
            description={
              clusterPathSelected
                ? "Apply copies the full cluster INI template onto this server. Ports, session name, and passwords stay owned by this profile."
                : "Only the settings listed below will change. Everything else stays as-is."
            }
          >
            {clusterPathSelected ? (
              <Stack gap="md">
                <AppSurfaceCard tone="flat" padding="md" radius="md">
                  <Stack gap="sm">
                    <Group gap="xs">
                      <Badge variant="light" color="blue" tt="none">
                        Cluster template
                      </Badge>
                      <Text fw={700}>{clusterId}</Text>
                    </Group>
                    <Text size="sm" c="dimmed">
                      Files: GameUserSettings.ini and Game.ini. This uses the same
                      composition as Clusters ({useClusterSeed ? "Seed" : "Restore"}
                      ): template content with this server’s identity keys reapplied.
                    </Text>
                    <Text size="sm" c="dimmed">
                      A local pre-template snapshot is taken before writing.
                    </Text>
                  </Stack>
                </AppSurfaceCard>
                {props.serverActive && (
                  <Alert color="fossil" title="Server must be stopped">
                    Stop the server before applying cluster defaults.
                  </Alert>
                )}
              </Stack>
            ) : (
              <>
                {changes.length === 0 ? (
                  <Alert color="blue" title="No changes">
                    The draft matches the server&apos;s current configuration.
                  </Alert>
                ) : (
                  <Stack gap="xs">
                    {changes.map((change) => (
                      <ChangeRow key={change.field} change={change} />
                    ))}
                  </Stack>
                )}
                {props.serverActive && (
                  <Alert color="fossil" title="Requires a server restart" mt="md">
                    You can save now; changes will take effect after the restart.
                  </Alert>
                )}
              </>
            )}
          </WizardStep>
        )}
      </main>

      <footer className={classes.footer}>
        <Button
          variant="default"
          leftSection={<X size={16} weight="bold" />}
          onClick={cancel}
          disabled={saving}
        >
          Cancel
        </Button>
        {activeStep !== STEP_COUNT - 1 ? (
          <Button
            variant="subtle"
            color={draftDirty ? "blue" : "gray"}
            size="compact-sm"
            leftSection={<Eye size={15} />}
            onClick={() => setChangesOpen(true)}
            aria-label={
              clusterPathSelected
                ? "View cluster defaults summary"
                : `View ${changes.length} ${changes.length === 1 ? "change" : "changes"}`
            }
          >
            {clusterPathSelected
              ? "Cluster copy"
              : `${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
          </Button>
        ) : (
          <span className={classes.footerCenterSlot} aria-hidden />
        )}
        <Group gap="sm" justify="flex-end" wrap="nowrap">
          <Button
            variant="default"
            leftSection={<ArrowLeft size={16} weight="bold" />}
            onClick={previous}
            disabled={activeStep === 0 || saving}
          >
            Back
          </Button>
          {activeStep < STEP_COUNT - 1 ? (
            <Button
              rightSection={<ArrowRight size={16} weight="bold" />}
              onClick={next}
            >
              Continue
            </Button>
          ) : (
            <Button
              leftSection={
                clusterPathSelected ? (
                  <CirclesThreePlus size={16} weight="bold" />
                ) : (
                  <FloppyDisk size={16} weight="bold" />
                )
              }
              onClick={() => void apply()}
              loading={saving}
              disabled={
                clusterPathSelected
                  ? props.serverActive || clusterTemplate === null
                  : changes.length === 0
              }
            >
              {clusterPathSelected ? "Apply cluster defaults" : "Apply changes"}
            </Button>
          )}
        </Group>
      </footer>
    </WizardShell>
  );
}
