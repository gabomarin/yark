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
  BREEDING_PRESETS,
  configurationWizardSchema,
  draftFromIniPayload,
  EXPERIENCE_PROFILES,
  PROGRESSION_PRESETS,
  SINGLE_PLAYER_RATE_FACTORS,
  wizardChanges,
  type ConfigurationWizardDraft,
  type BreedingPresetId,
  type ExperienceProfileId,
  type ProgressionPresetId,
} from "../configurationWizardModel";
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
  showMapLocation: true,
  crosshair: true,
  thirdPerson: true,
  flyerCarryPve: false,
  structurePickupSeconds: 30,
};

const STEP_LABELS = ["Perfil", "Ritmo", "Crianza", "Comodidad", "Revisión"];
type DifficultyChoice = "current" | "120" | "150" | "180" | "300" | "custom";

export function ConfigurationWizard(props: Props): JSX.Element {
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
      const result = await window.api.readServerIni(props.server.id);
      if (!alive) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error ?? "No se pudo leer la configuración actual");
        return;
      }
      const draft = draftFromIniPayload(result.data.payload);
      setSnapshot(result.data);
      setInitialDraft(draft);
      form.initialize(draft);
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
      title: "Salir del asistente",
      children: (
        <Text size="sm">
          El borrador tiene cambios que todavía no se han aplicado. Los INI del
          servidor permanecerán intactos.
        </Text>
      ),
      labels: { confirm: "Descartar borrador", cancel: "Continuar configurando" },
      confirmProps: { color: "red" },
      onConfirm: props.onCancel,
    });
  };

  const next = () => setActiveStep((current) => Math.min(current + 1, 4));
  const previous = () => setActiveStep((current) => Math.max(current - 1, 0));

  const apply = async () => {
    if (snapshot === null) return;
    setError(null);
    const parsed = configurationWizardSchema.safeParse(form.values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los valores del asistente");
      return;
    }

    setSaving(true);
    const latestResult = await window.api.readServerIni(props.server.id);
    if (!latestResult.ok) {
      setSaving(false);
      setError(
        latestResult.error ??
          "No se pudo volver a leer la configuración antes de aplicar",
      );
      return;
    }
    // Superponer únicamente los ajustes curados sobre la versión más reciente
    // evita borrar cambios externos realizados mientras el asistente estaba abierto.
    const payload = applyWizardDraftToIni(latestResult.data.payload, parsed.data);
    const previewResult = await window.api.previewServerIni(props.server.id, payload);
    if (!previewResult.ok || !previewResult.data.valid) {
      setSaving(false);
      setError(
        previewResult.ok
          ? previewResult.data.issues[0]?.message ?? "La configuración no es válida"
          : previewResult.error ?? "No se pudo validar la configuración",
      );
      return;
    }
    const result = await window.api.saveServerIni(props.server.id, payload);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo aplicar la configuración");
      return;
    }
    setSaved(true);
    form.resetDirty();
    props.onApplied();
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
          <Title order={2}>Configuración aplicada</Title>
          <Text c="dimmed" ta="center" maw={520}>
            Se actualizaron {changes.length} ajustes del servidor. Las opciones no
            incluidas en el asistente se conservaron sin cambios.
          </Text>
          {props.serverActive && (
            <Alert color="yellow" title="Reinicio pendiente" maw={520}>
              Los nuevos valores comenzarán a utilizarse cuando reinicies el servidor.
            </Alert>
          )}
          <Button onClick={props.onCancel}>Volver al servidor</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.root} data-configuration-wizard>
      <Modal
        opened={changesOpen}
        onClose={() => setChangesOpen(false)}
        title="Cambios del borrador"
        size="lg"
        centered
      >
        <Text c="dimmed" size="sm" mb="md">
          Estos valores todavía no se han aplicado. Podrás confirmarlos en el último
          paso.
        </Text>
        {changes.length === 0 ? (
          <Alert color="blue">El borrador coincide con la configuración actual.</Alert>
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
            {props.server.name} / Asistente de configuración
          </Text>
          <Title order={2}>Prepara la experiencia de juego</Title>
          <Text c="dimmed" size="sm">
            Partimos de tus valores actuales. Nada se escribe hasta la revisión final.
          </Text>
        </div>
        <Button variant="subtle" color="gray" onClick={cancel}>
          Cancelar
        </Button>
      </header>

      <div className={classes.progress}>
        {compactProgress ? (
          <Stack gap={6}>
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                Paso {activeStep + 1} de 5
              </Text>
              <Text size="sm" c="dimmed">
                {STEP_LABELS[activeStep]}
              </Text>
            </Group>
            <Progress value={((activeStep + 1) / 5) * 100} size="sm" />
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
            title="¿Qué tipo de servidor quieres?"
            description="Elige un punto de partida. Podrás ajustar cada valor antes de aplicar."
          >
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <ProfileCard
                id="current"
                name="Conservar configuración actual"
                description="No aplica recomendaciones; permite revisar y ajustar tus valores actuales."
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
                  <Text fw={700}>Ajustes para una persona o grupo pequeño</Text>
                  <Text className={classes.highImpactLabel}>ALTO IMPACTO</Text>
                </Group>
                <Text c="dimmed" size="sm">
                  ARK añade bonificaciones sobre domesticación, crianza, progresión
                  y estadísticas de criaturas domesticadas.
                </Text>
              </div>
              <Switch
                checked={form.values.singlePlayerSettings}
                onChange={(event) =>
                  form.setFieldValue("singlePlayerSettings", event.currentTarget.checked)
                }
                aria-label="Ajustes para una persona o grupo pequeño"
              />
            </div>
            {form.values.singlePlayerSettings && (
              <Alert color="yellow" title="Los multiplicadores se acumulan">
                Este modo se aplica además de los presets del asistente. Verás el
                resultado efectivo conocido en Ritmo y Crianza; ARK también modifica
                requisitos de experiencia, engramas, salud y daño de criaturas
                domesticadas.
              </Alert>
            )}
          </WizardStep>
        )}

        {activeStep === 1 && (
          <WizardStep
            title="Define el ritmo de progresión"
            description="Elige cómo quieres que se sienta el avance. Puedes verificar los valores exactos antes de aplicar."
          >
            <PresetSelector
              value={progressionPreset}
              onChange={chooseProgressionPreset}
              presets={PROGRESSION_PRESETS}
              currentDescription="Conserva los valores que ya tiene este servidor."
            >
              <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
                <PresetValue label="Experiencia" value={`${form.values.xpRate}×`} />
                <PresetValue label="Recolección" value={`${form.values.harvestRate}×`} />
                <PresetValue
                  label="Domesticación"
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
                El modo individual también reduce requisitos de experiencia; por eso
                el efecto final de XP no puede expresarse como un único multiplicador.
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
            title="Ajusta la crianza"
            description="Elige una intensidad; el asistente coordina incubación, crecimiento, apareamiento y cuidados."
          >
            <PresetSelector
              value={breedingPreset}
              onChange={chooseBreedingPreset}
              presets={BREEDING_PRESETS}
              currentDescription="Conserva la combinación que ya usa este servidor."
            >
              <SimpleGrid cols={{ base: 1, xs: 2, sm: 4 }} spacing="xs">
                <PresetValue
                  label="Incubación"
                  value={effectiveRateLabel(
                    form.values.eggHatchRate,
                    SINGLE_PLAYER_RATE_FACTORS.eggHatchRate,
                    form.values.singlePlayerSettings,
                  )}
                />
                <PresetValue
                  label="Maduración"
                  value={effectiveRateLabel(
                    form.values.maturationRate,
                    SINGLE_PLAYER_RATE_FACTORS.maturationRate,
                    form.values.singlePlayerSettings,
                  )}
                />
                <PresetValue
                  label="Espera para aparear"
                  value={effectiveRateLabel(
                    form.values.matingIntervalMultiplier,
                    SINGLE_PLAYER_RATE_FACTORS.matingIntervalMultiplier,
                    form.values.singlePlayerSettings,
                  )}
                />
                <PresetValue
                  label="Intervalo de cuidados"
                  value={effectiveRateLabel(
                    form.values.cuddleIntervalMultiplier,
                    SINGLE_PLAYER_RATE_FACTORS.cuddleIntervalMultiplier,
                    form.values.singlePlayerSettings,
                  )}
                />
              </SimpleGrid>
            </PresetSelector>
            <Text c="dimmed" size="xs">
              En los intervalos, un valor menor significa menos tiempo de espera. Los
              tiempos reales varían según la especie.
            </Text>
          </WizardStep>
        )}

        {activeStep === 3 && (
          <WizardStep
            title="Elige reglas de comodidad"
            description="Son ajustes habituales que cambian cómo se siente el servidor, no su rendimiento."
          >
            <Stack gap="xs">
              <SettingSwitch label="Servidor PvE" description="Evita el combate directo entre jugadores." {...form.getInputProps("pve", { type: "checkbox" })} />
              <SettingSwitch label="Modo hardcore" description="Al morir, el personaje vuelve al nivel inicial." {...form.getInputProps("hardcore", { type: "checkbox" })} />
              <SettingSwitch label="Mostrar posición en el mapa" description="Cada jugador puede consultar su ubicación exacta." {...form.getInputProps("showMapLocation", { type: "checkbox" })} />
              <SettingSwitch label="Mostrar mira" description="Muestra una referencia de apuntado en pantalla." {...form.getInputProps("crosshair", { type: "checkbox" })} />
              <SettingSwitch label="Permitir tercera persona" description="Los jugadores pueden cambiar la cámara a tercera persona." {...form.getInputProps("thirdPerson", { type: "checkbox" })} />
              <SettingSwitch label="Transportar criaturas con voladores en PvE" description="Permite recoger criaturas usando voladores." {...form.getInputProps("flyerCarryPve", { type: "checkbox" })} />
              <NumberInput
                label="Tiempo para recoger estructuras"
                description="Segundos disponibles después de colocarlas. Usa 0 para recogida inmediata."
                min={0}
                max={3600}
                suffix=" s"
                allowDecimal={false}
                {...form.getInputProps("structurePickupSeconds")}
              />
            </Stack>
          </WizardStep>
        )}

        {activeStep === 4 && (
          <WizardStep
            title="Revisa antes de aplicar"
            description="Solo se modificarán los ajustes que aparecen en este resumen."
          >
            {changes.length === 0 ? (
              <Alert color="blue" title="Sin cambios">
                El borrador coincide con la configuración actual del servidor.
              </Alert>
            ) : (
              <Stack gap="xs">
                {changes.map((change) => (
                  <ChangeRow key={change.field} change={change} />
                ))}
              </Stack>
            )}
            {props.serverActive && (
              <Alert color="yellow" title="Requiere reiniciar el servidor" mt="md">
                Puedes guardar ahora; los cambios comenzarán a utilizarse después del reinicio.
              </Alert>
            )}
          </WizardStep>
        )}
      </main>

      <footer className={classes.footer}>
        <Button variant="default" leftSection={<ArrowLeft size={16} />} onClick={previous} disabled={activeStep === 0 || saving}>
          Atrás
        </Button>
        <Button
          variant="subtle"
          color={changes.length > 0 ? "blue" : "gray"}
          size="compact-sm"
          leftSection={<Eye size={15} />}
          onClick={() => setChangesOpen(true)}
          aria-label={`Ver ${changes.length} ${changes.length === 1 ? "cambio" : "cambios"}`}
        >
          {changes.length} {changes.length === 1 ? "cambio" : "cambios"}
        </Button>
        {activeStep < 4 ? (
          <Button rightSection={<ArrowRight size={16} />} onClick={next}>
            Continuar
          </Button>
        ) : (
          <Button
            leftSection={<FloppyDisk size={16} />}
            onClick={() => void apply()}
            loading={saving}
            disabled={changes.length === 0}
          >
            Aplicar cambios
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

function WizardStep({ title, description, children }: WizardStepProps): JSX.Element {
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

function ProfileCard(props: ProfileCardProps): JSX.Element {
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
}: PresetSelectorProps): JSX.Element {
  const selected = presets.find((preset) => preset.id === value);
  return (
    <Stack gap="sm">
      <SegmentedControl
        value={value}
        onChange={onChange}
        fullWidth
        data={[
          { value: "current", label: "Actual" },
          ...presets.map((preset) => ({ value: preset.id, label: preset.name })),
        ]}
        aria-label="Nivel recomendado"
      />
      <div className={classes.presetSummary}>
        <div>
          <Text fw={700} size="sm">
            {selected?.name ?? "Configuración actual"}
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

function PresetValue({ label, value }: { label: string; value: string }): JSX.Element {
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
}: DifficultyControlProps): JSX.Element {
  const explicitDifficulty = draft.overrideOfficialDifficulty > 0;
  return (
    <Stack gap="sm">
      <div>
        <Text fw={700}>Dificultad del mundo</Text>
        <Text c="dimmed" size="xs">
          Determina los niveles salvajes y la calidad potencial del loot.
        </Text>
      </div>
      <SegmentedControl
        value={choice}
        onChange={onChoiceChange}
        fullWidth
        data={[
          { value: "current", label: "Actual" },
          { value: "120", label: "Nivel 120" },
          { value: "150", label: "Nivel 150" },
          { value: "180", label: "Nivel 180" },
          { value: "300", label: "Nivel 300" },
          { value: "custom", label: "Personalizado" },
        ]}
        aria-label="Dificultad del mundo"
      />
      <div className={classes.difficultySummary}>
        <div>
          <Text fw={700} size="sm">
            {choice === "current"
              ? "Conservar configuración actual"
              : `Nivel máximo común ${draft.maxWildDinoLevel}`}
          </Text>
          <Text c="dimmed" size="xs">
            {explicitDifficulty
              ? `DifficultyOffset ${formatRate(draft.difficultyOffset)} · Override ${formatRate(draft.overrideOfficialDifficulty)}`
              : `DifficultyOffset ${formatRate(draft.difficultyOffset)} · sin override; el resultado depende del mapa`}
          </Text>
        </div>
        {choice === "custom" && (
          <NumberInput
            label="Nivel máximo personalizado"
            description="El asistente calculará el override técnico necesario."
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
        Al elegir un nivel, el asistente usa offset 1 y un override explícito para
        obtener un resultado consistente entre mapas. Algunas criaturas especiales
        pueden aparecer por encima del nivel indicado.
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
}): JSX.Element {
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

function SettingSwitch({ label, description, checked, onChange }: SettingSwitchProps): JSX.Element {
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
