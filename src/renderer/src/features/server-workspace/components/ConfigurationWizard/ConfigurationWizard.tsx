import type { ReactElement } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  FloppyDisk,
  UsersThree,
  TreeEvergreen,
  Sword,
  Skull,
} from "@phosphor-icons/react";
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Stepper,
  Switch,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import type { ServerIniSnapshot, ServerProfile } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
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
import classes from "./ConfigurationWizard.module.css";

interface Props {
  server: ServerProfile;
  serverActive: boolean;
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
  maxPlayers: 70,
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
  structurePickupSeconds: 30,
};

const STEP_LABELS = ["Profile", "Pace", "Breeding", "World", "QoL", "Review"];
const STEP_COUNT = STEP_LABELS.length;
type DifficultyChoice = "current" | "120" | "150" | "180" | "300" | "custom";

export function ConfigurationWizard(props: Props): ReactElement {
  const compactProgress = useMediaQuery("(max-width: 1100px)", false);
  const [activeStep, setActiveStep] = useState(0);
  const [snapshot, setSnapshot] = useState<ServerIniSnapshot | null>(null);
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
  const form = useForm<ConfigurationWizardDraft>({
    mode: "controlled",
    initialValues: EMPTY_DRAFT,
  });

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
        setSnapshot(result.data);
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
  }, [props.server.id]);

  const changes = useMemo(
    () => wizardChanges(initialDraft, form.values),
    [form.values, initialDraft],
  );

  useEffect(() => {
    props.onDraftChange?.(changes.length > 0);
  }, [changes.length, props.onDraftChange]);

  const chooseProfile = (profile: ExperienceProfileId) => {
    if (profile === "current") {
      form.setValues({ ...initialDraft, profile: "current" });
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
        maxPlayers: initialDraft.maxPlayers,
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
    if (changes.length === 0 || saved) {
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

  const next = () => setActiveStep((current) => Math.min(current + 1, STEP_COUNT - 1));
  const previous = () => setActiveStep((current) => Math.max(current - 1, 0));

  const apply = async () => {
    if (snapshot === null) return;
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
      setSaved(true);
      form.resetDirty();
      props.onApplied();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={classes.root}>
        <Skeleton height={28} width="32%" />
        <Skeleton height={18} width="56%" mt="xs" />
        <Skeleton height={64} mt="xl" />
        <Skeleton height={280} mt="lg" />
      </div>
    );
  }

  if (saved) {
    return (
      <div className={classes.root}>
        <div className={classes.success}>
          <ThemeIcon size={56} radius="xl" color="green" variant="light">
            <Check size={28} weight="bold" />
          </ThemeIcon>
          <Title order={2}>Configuration applied</Title>
          <Text c="dimmed" ta="center" maw={520}>
            {changes.length} server settings were updated. Options not included in the
            wizard were left unchanged.
          </Text>
          {props.serverActive && (
            <Alert color="yellow" title="Restart pending" maw={520}>
              The new values will take effect when you restart the server.
            </Alert>
          )}
          <Button onClick={props.onCancel}>Back to server</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.root} data-configuration-wizard>
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
        {changes.length === 0 ? (
          <Alert color="blue">The draft matches the current configuration.</Alert>
        ) : (
          <Stack gap="xs">
            {changes.map((change) => (
              <ChangeRow key={change.field} change={change} />
            ))}
          </Stack>
        )}
      </Modal>

      <header className={classes.header}>
        <div>
          <Text c="dimmed" size="xs" fw={600}>
            {props.server.name} / Configuration wizard
          </Text>
          <Title order={2}>Set up the play experience</Title>
          <Text c="dimmed" size="sm">
            We start from your current values. Nothing is written until the final review.
          </Text>
        </div>
        <Button variant="subtle" color="gray" onClick={cancel}>
          Cancel
        </Button>
      </header>

      <div className={classes.progress}>
        {compactProgress ? (
          <Stack gap={6}>
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
          <Stepper active={activeStep} allowNextStepsSelect={false} size="sm">
            {STEP_LABELS.map((label) => (
              <Stepper.Step key={label} label={label} />
            ))}
          </Stepper>
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
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <ProfileCard
                id="current"
                name="Keep current configuration"
                description="Does not apply recommendations; lets you review and adjust your current values."
                selected={form.values.profile === "current"}
                onSelect={chooseProfile}
              />
              {EXPERIENCE_PROFILES.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  id={profile.id}
                  name={profile.name}
                  description={profile.description}
                  selected={form.values.profile === profile.id}
                  onSelect={chooseProfile}
                />
              ))}
            </SimpleGrid>
            <div className={classes.impactSetting}>
              <div>
                <Group gap="xs">
                  <Text fw={700}>Settings for one person or a small group</Text>
                  <Text className={classes.highImpactLabel}>HIGH IMPACT</Text>
                </Group>
                <Text c="dimmed" size="sm">
                  ARK adds bonuses to taming, breeding, progression,
                  and tamed creature stats.
                </Text>
              </div>
              <Switch
                checked={form.values.singlePlayerSettings}
                onChange={(event) =>
                  form.setFieldValue("singlePlayerSettings", event.currentTarget.checked)
                }
                aria-label="Settings for one person or a small group"
              />
            </div>
            {form.values.singlePlayerSettings && (
              <Alert color="yellow" title="Multipliers stack">
                This mode applies on top of the wizard presets. You will see the known
                effective result under Pace and Breeding; ARK also changes XP
                requirements, engrams, and tamed creature health and damage.
              </Alert>
            )}
          </WizardStep>
        )}

        {activeStep === 1 && (
          <WizardStep
            title="Set the progression pace"
            description="Choose how progression should feel. You can verify the exact values before applying."
          >
            <PresetSelector
              value={progressionPreset}
              onChange={chooseProgressionPreset}
              presets={PROGRESSION_PRESETS}
              currentDescription="Keep the values this server already uses."
            >
              <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
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
              </SimpleGrid>
            </PresetSelector>
            {form.values.singlePlayerSettings && (
              <Text c="yellow.3" size="xs">
                Single-player mode also reduces XP requirements, so the final XP effect
                cannot be expressed as a single multiplier.
              </Text>
            )}
            <DifficultyControl
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
                  label="Cuddle interval"
                  value={effectiveRateLabel(
                    form.values.cuddleIntervalMultiplier,
                    SINGLE_PLAYER_RATE_FACTORS.cuddleIntervalMultiplier,
                    form.values.singlePlayerSettings,
                  )}
                />
              </SimpleGrid>
            </PresetSelector>
            <Text c="dimmed" size="xs">
              For intervals, a lower value means less waiting. Actual times vary by species.
            </Text>
          </WizardStep>
        )}

        {activeStep === 3 && (
          <WizardStep
            title="Define how the world feels"
            description="Pick an intensity; the wizard coordinates capacity, density, day cycle, and survival."
          >
            <PresetSelector
              value={worldPreset}
              onChange={chooseWorldPreset}
              presets={WORLD_PRESETS}
              currentDescription="Keep the combination this server already uses."
            >
              <SimpleGrid cols={{ base: 1, xs: 2, sm: 4 }} spacing="xs">
                <PresetValue
                  label="Max players"
                  value={String(form.values.maxPlayers)}
                />
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
            description="These common settings change how the server feels, not its performance."
          >
            <Stack gap="xs">
              <SettingSwitch label="PvE server" description="Prevents direct combat between players." {...form.getInputProps("pve", { type: "checkbox" })} />
              <SettingSwitch label="Hardcore mode" description="On death, the character resets to level 1." {...form.getInputProps("hardcore", { type: "checkbox" })} />
              <SettingSwitch label="Show map location" description="Each player can see their exact location." {...form.getInputProps("showMapLocation", { type: "checkbox" })} />
              <SettingSwitch label="Show crosshair" description="Shows an on-screen aiming reference." {...form.getInputProps("crosshair", { type: "checkbox" })} />
              <SettingSwitch label="Allow third person" description="Players can switch the camera to third person." {...form.getInputProps("thirdPerson", { type: "checkbox" })} />
              <SettingSwitch label="Carry creatures with flyers in PvE" description="Allows picking up creatures with flyers." {...form.getInputProps("flyerCarryPve", { type: "checkbox" })} />
              <NumberInput
                label="Structure pickup time"
                description="Seconds available after placing them. Use 0 for immediate pickup."
                min={0}
                max={3600}
                suffix=" s"
                allowDecimal={false}
                {...form.getInputProps("structurePickupSeconds")}
              />
            </Stack>
          </WizardStep>
        )}

        {activeStep === 5 && (
          <WizardStep
            title="Review before applying"
            description="Only the settings listed in this summary will be changed."
          >
            {changes.length === 0 ? (
              <Alert color="blue" title="No changes">
                The draft matches the server's current configuration.
              </Alert>
            ) : (
              <Stack gap="xs">
                {changes.map((change) => (
                  <ChangeRow key={change.field} change={change} />
                ))}
              </Stack>
            )}
            {props.serverActive && (
              <Alert color="yellow" title="Requires a server restart" mt="md">
                You can save now; changes will take effect after the restart.
              </Alert>
            )}
          </WizardStep>
        )}
      </main>

      <footer className={classes.footer}>
        <Button variant="default" leftSection={<ArrowLeft size={16} />} onClick={previous} disabled={activeStep === 0 || saving}>
          Back
        </Button>
        <Button
          variant="subtle"
          color={changes.length > 0 ? "blue" : "gray"}
          size="compact-sm"
          leftSection={<Eye size={15} />}
          onClick={() => setChangesOpen(true)}
          aria-label={`View ${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
        >
          {changes.length} {changes.length === 1 ? "change" : "changes"}
        </Button>
        {activeStep < STEP_COUNT - 1 ? (
          <Button rightSection={<ArrowRight size={16} />} onClick={next}>
            Continue
          </Button>
        ) : (
          <Button
            leftSection={<FloppyDisk size={16} />}
            onClick={() => void apply()}
            loading={saving}
            disabled={changes.length === 0}
          >
            Apply changes
          </Button>
        )}
      </footer>
    </div>
  );
}

interface WizardStepProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

function WizardStep({ title, description, children }: WizardStepProps): ReactElement {
  return (
    <Stack gap="lg" className={classes.step}>
      <div>
        <Title order={3}>{title}</Title>
        <Text c="dimmed" size="sm">{description}</Text>
      </div>
      {children}
    </Stack>
  );
}

interface ProfileCardProps {
  id: ExperienceProfileId;
  name: string;
  description: string;
  selected: boolean;
  onSelect: (id: ExperienceProfileId) => void;
}

const PROFILE_ICONS = {
  current: Check,
  friends: UsersThree,
  communityPve: TreeEvergreen,
  communityPvp: Sword,
  hardcore: Skull,
};

function ProfileCard(props: ProfileCardProps): ReactElement {
  const Icon = PROFILE_ICONS[props.id];
  return (
    <UnstyledButton
      className={classes.profileCard}
      data-selected={props.selected || undefined}
      onClick={() => props.onSelect(props.id)}
      aria-pressed={props.selected}
    >
      <ThemeIcon variant={props.selected ? "light" : "default"} size={38} radius="md">
        <Icon size={20} />
      </ThemeIcon>
      <div>
        <Text fw={700}>{props.name}</Text>
        <Text c="dimmed" size="sm">{props.description}</Text>
      </div>
    </UnstyledButton>
  );
}

interface PresetSelectorProps {
  value: string;
  onChange: (value: string) => void;
  presets: readonly {
    id: string;
    name: string;
    description: string;
  }[];
  currentDescription: string;
  children: React.ReactNode;
}

function PresetSelector({
  value,
  onChange,
  presets,
  currentDescription,
  children,
}: PresetSelectorProps): ReactElement {
  const selected = presets.find((preset) => preset.id === value);
  return (
    <Stack gap="sm">
      <SegmentedControl
        value={value}
        onChange={onChange}
        fullWidth
        data={[
          { value: "current", label: "Current" },
          ...presets.map((preset) => ({ value: preset.id, label: preset.name })),
        ]}
        aria-label="Recommended level"
      />
      <div className={classes.presetSummary}>
        <div>
          <Text fw={700} size="sm">
            {selected?.name ?? "Current configuration"}
          </Text>
          <Text c="dimmed" size="xs">
            {selected?.description ?? currentDescription}
          </Text>
        </div>
        {children}
      </div>
    </Stack>
  );
}

function PresetValue({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className={classes.presetValue}>
      <Text c="dimmed" size="xs">
        {label}
      </Text>
      <Text fw={700} size="sm">
        {value}
      </Text>
    </div>
  );
}

interface DifficultyControlProps {
  choice: DifficultyChoice;
  draft: ConfigurationWizardDraft;
  onChoiceChange: (choice: string) => void;
  onCustomLevelChange: (level: number) => void;
}

function DifficultyControl({
  choice,
  draft,
  onChoiceChange,
  onCustomLevelChange,
}: DifficultyControlProps): ReactElement {
  const explicitDifficulty = draft.overrideOfficialDifficulty > 0;
  return (
    <Stack gap="sm">
      <div>
        <Text fw={700}>World difficulty</Text>
        <Text c="dimmed" size="xs">
          Controls wild levels and potential loot quality.
        </Text>
      </div>
      <SegmentedControl
        value={choice}
        onChange={onChoiceChange}
        fullWidth
        data={[
          { value: "current", label: "Current" },
          { value: "120", label: "Level 120" },
          { value: "150", label: "Level 150" },
          { value: "180", label: "Level 180" },
          { value: "300", label: "Level 300" },
          { value: "custom", label: "Custom" },
        ]}
        aria-label="World difficulty"
      />
      <div className={classes.difficultySummary}>
        <div>
          <Text fw={700} size="sm">
            {choice === "current"
              ? "Keep current configuration"
              : `Common max level ${draft.maxWildDinoLevel}`}
          </Text>
          <Text c="dimmed" size="xs">
            {explicitDifficulty
              ? `DifficultyOffset ${formatRate(draft.difficultyOffset)} · Override ${formatRate(draft.overrideOfficialDifficulty)}`
              : `DifficultyOffset ${formatRate(draft.difficultyOffset)} · no override; result depends on the map`}
          </Text>
        </div>
        {choice === "custom" && (
          <NumberInput
            label="Custom max level"
            description="The wizard will compute the required technical override."
            min={30}
            max={600}
            step={5}
            allowDecimal={false}
            value={draft.maxWildDinoLevel}
            onChange={(value) => {
              if (typeof value === "number") onCustomLevelChange(value);
            }}
          />
        )}
      </div>
      <Text c="dimmed" size="xs">
        When you pick a level, the wizard uses offset 1 and an explicit override for
        consistent results across maps. Some special creatures may spawn above the stated level.
      </Text>
    </Stack>
  );
}

function effectiveRateLabel(
  configured: number,
  singlePlayerFactor: number,
  singlePlayerSettings: boolean,
): string {
  if (!singlePlayerSettings) return `${formatRate(configured)}×`;
  return `${formatRate(configured)}× → ${formatRate(configured * singlePlayerFactor)}×`;
}

function formatRate(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function ChangeRow({
  change,
}: {
  change: ReturnType<typeof wizardChanges>[number];
}): ReactElement {
  return (
    <div className={classes.changeRow}>
      <Text fw={600} size="sm">{change.label}</Text>
      <Group gap="xs" wrap="nowrap">
        <Text c="dimmed" size="sm">{change.before}</Text>
        <ArrowRight size={14} />
        <Text size="sm" fw={600}>{change.after}</Text>
      </Group>
    </div>
  );
}

interface SettingSwitchProps {
  label: string;
  description: string;
  checked?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}

function SettingSwitch({ label, description, checked, onChange }: SettingSwitchProps): ReactElement {
  return (
    <div className={classes.switchRow}>
      <div>
        <Text fw={600} size="sm">{label}</Text>
        <Text c="dimmed" size="xs">{description}</Text>
      </div>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </div>
  );
}
