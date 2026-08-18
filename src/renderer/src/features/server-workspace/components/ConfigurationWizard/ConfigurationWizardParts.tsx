import type { ReactElement, ReactNode, ChangeEventHandler } from "react";
import {
  ArrowRight,
  Check,
  CirclesThreePlus,
  Lightning,
  UsersThree,
  TreeEvergreen,
  Sword,
  Skull,
} from "@phosphor-icons/react";
import {
  Badge,
  Group,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  formatWizardNumber,
  type ExperienceProfileId,
  type wizardChanges,
} from "../../configurationWizardModel";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import classes from "./ConfigurationWizard.module.css";

export function WizardShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <AppSurfaceCard
      tone="flat"
      fill
      padding={0}
      radius="md"
      className={classes.root}
      data-configuration-wizard
    >
      {children}
    </AppSurfaceCard>
  );
}

interface WizardStepProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function WizardStep({ title, description, children }: WizardStepProps): ReactElement {
  return (
    <Stack gap="md" className={classes.step}>
      <Stack gap={4}>
        <Title order={3}>{title}</Title>
        <Text c="dimmed" size="sm">
          {description}
        </Text>
      </Stack>
      {children}
    </Stack>
  );
}

interface ProfileCardProps {
  id: ExperienceProfileId;
  name: string;
  description: string;
  chips?: readonly string[];
  selected: boolean;
  onSelect: (id: ExperienceProfileId) => void;
}

const PROFILE_ICONS = {
  current: Check,
  cluster: CirclesThreePlus,
  friends: UsersThree,
  communityPve: TreeEvergreen,
  communityPvp: Sword,
  hardcore: Skull,
};

/** Selected icon accent — distinct per experience, not one shared blue. */
const PROFILE_ICON_ACCENT: Record<ExperienceProfileId, string> = {
  current: "ok",
  cluster: "blue",
  friends: "ok",
  communityPve: "ok",
  communityPvp: "fossil",
  hardcore: "danger",
};

export function ProfileCard(props: ProfileCardProps): ReactElement {
  const Icon = PROFILE_ICONS[props.id];
  const accent = PROFILE_ICON_ACCENT[props.id];
  return (
    <UnstyledButton
      className={classes.profileCard}
      data-selected={props.selected || undefined}
      data-accent={accent}
      onClick={() => props.onSelect(props.id)}
      aria-pressed={props.selected}
    >
      <ThemeIcon
        variant="default"
        size={32}
        radius="sm"
        className={classes.profileCardIcon}
      >
        <Icon size={18} weight="duotone" className={classes.profileCardGlyph} />
      </ThemeIcon>
      <Stack gap={6} className={classes.profileCardBody}>
        <Text fw={700}>{props.name}</Text>
        <Text c="dimmed" size="sm">
          {props.description}
        </Text>
        {props.chips !== undefined && props.chips.length > 0 && (
          <Group gap={6}>
            {props.chips.map((chip) => (
              <Badge key={chip} size="xs" variant="outline" color="gray" tt="none" radius="sm">
                {chip}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>
    </UnstyledButton>
  );
}

export function OfficialMatchBadge(): ReactElement {
  return (
    <Badge size="xs" variant="light" color="blue" tt="none" radius="sm">
      WildCard official
    </Badge>
  );
}

interface PresetSelectorProps {
  value: string;
  onChange: (value: string) => void;
  presets: readonly {
    id: string;
    name: string;
    description: string;
    official?: boolean;
  }[];
  currentDescription: string;
  children: ReactNode;
  /** Color the indicator by rate preset (Base→red … Very fast→green). */
  paced?: boolean;
  /** Color like world difficulty (Very easy→green … Very hard→red). */
  worldFeel?: boolean;
  ariaLabel?: string;
}

/** Pace / breeding rate tones — slow waits read as red, faster as green. */
export function pacePresetColor(value: string): string {
  switch (value) {
    case "base":
      return "red";
    case "balanced":
      return "fossil";
    case "fast":
    case "veryFast":
      return "green";
    default:
      return "gray";
  }
}

/** World-feel intensity — same green→red scale as world difficulty tiers. */
export function worldFeelPresetColor(value: string): string {
  switch (value) {
    case "veryEasy":
      return "green";
    case "easy":
      return "teal";
    case "medium":
      return "blue";
    case "hard":
      return "orange";
    case "veryHard":
      return "red";
    default:
      return "gray";
  }
}

function pacedPresetLabel(preset: { id: string; name: string }): ReactNode {
  if (preset.id !== "veryFast") return preset.name;
  return (
    <Group gap={4} wrap="nowrap" justify="center">
      <span>{preset.name}</span>
      <Lightning size={14} weight="fill" color="var(--app-color-fossil)" aria-hidden />
    </Group>
  );
}

function presetControlColor(
  value: string,
  paced: boolean,
  worldFeel: boolean,
): string | undefined {
  if (paced) return pacePresetColor(value);
  if (worldFeel) return worldFeelPresetColor(value);
  return undefined;
}

export function PresetSelector({
  value,
  onChange,
  presets,
  currentDescription,
  children,
  paced = false,
  worldFeel = false,
  ariaLabel = "Recommended level",
}: PresetSelectorProps): ReactElement {
  const selected = presets.find((preset) => preset.id === value);
  const showOfficial = selected?.official === true;
  return (
    <Stack gap="sm">
      <SegmentedControl
        value={value}
        onChange={onChange}
        fullWidth
        color={presetControlColor(value, paced, worldFeel)}
        data={[
          { value: "current", label: "Current" },
          ...presets.map((preset) => ({
            value: preset.id,
            label: paced ? pacedPresetLabel(preset) : preset.name,
          })),
        ]}
        aria-label={ariaLabel}
      />
      <AppSurfaceCard tone="flat" padding="sm" radius="md" className={classes.presetSummary}>
        <Stack gap={4}>
          <Group gap="xs" wrap="wrap" align="center">
            <Text fw={700} size="sm">
              {selected?.name ?? "Current configuration"}
            </Text>
            {showOfficial && <OfficialMatchBadge />}
          </Group>
          <Text c="dimmed" size="xs">
            {selected?.description ?? currentDescription}
          </Text>
        </Stack>
        {children}
      </AppSurfaceCard>
    </Stack>
  );
}

export function PresetValue({ label, value }: { label: string; value: string }): ReactElement {
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

export function effectiveRateLabel(
  configured: number,
  singlePlayerFactor: number,
  singlePlayerSettings: boolean,
): string {
  if (!singlePlayerSettings) return `${formatWizardNumber(configured)}×`;
  return `${formatWizardNumber(configured)}× → ${formatWizardNumber(configured * singlePlayerFactor)}×`;
}

export function ChangeRow({
  change,
}: {
  change: ReturnType<typeof wizardChanges>[number];
}): ReactElement {
  return (
    <Group className={classes.changeRow} justify="space-between" align="flex-start" wrap="nowrap" gap="lg">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text fw={600} size="sm">
          {change.label}
        </Text>
        <Text c="dimmed" size="xs">
          {change.iniKey}
        </Text>
      </Stack>
      <Group gap="xs" wrap="nowrap">
        <Text c="dimmed" size="sm">{change.before}</Text>
        <ArrowRight size={14} />
        <Text size="sm" fw={600}>{change.after}</Text>
      </Group>
    </Group>
  );
}

interface SettingSwitchProps {
  label: string;
  description: string;
  checked?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}

export function SettingSwitch({
  label,
  description,
  checked,
  onChange,
}: SettingSwitchProps): ReactElement {
  return (
    <Group className={classes.switchRow} justify="space-between" align="center" wrap="nowrap" gap="lg">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text fw={600} size="sm">{label}</Text>
        <Text c="dimmed" size="xs">{description}</Text>
      </Stack>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </Group>
  );
}
