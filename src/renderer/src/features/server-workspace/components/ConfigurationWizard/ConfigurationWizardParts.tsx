import type { ReactElement, ReactNode, ChangeEventHandler } from "react";
import {
  ArrowRight,
  Check,
  CirclesThreePlus,
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
  wizardChanges,
  type ExperienceProfileId,
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

interface PresetSelectorProps {
  value: string;
  onChange: (value: string) => void;
  presets: readonly {
    id: string;
    name: string;
    description: string;
  }[];
  currentDescription: string;
  children: ReactNode;
}

export function PresetSelector({
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
      <AppSurfaceCard tone="flat" padding="sm" radius="md" className={classes.presetSummary}>
        <Stack gap={4}>
          <Text fw={700} size="sm">
            {selected?.name ?? "Current configuration"}
          </Text>
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
  if (!singlePlayerSettings) return `${formatRate(configured)}×`;
  return `${formatRate(configured)}× → ${formatRate(configured * singlePlayerFactor)}×`;
}

function formatRate(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

export function ChangeRow({
  change,
}: {
  change: ReturnType<typeof wizardChanges>[number];
}): ReactElement {
  return (
    <Group className={classes.changeRow} justify="space-between" align="center" wrap="nowrap" gap="lg">
      <Text fw={600} size="sm">{change.label}</Text>
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
