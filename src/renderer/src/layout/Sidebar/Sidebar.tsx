import {
  ArrowsClockwise,
  Circle,
  Dna,
  FileText,
  HardDrives,
  SquaresFour,
} from "@phosphor-icons/react";
import {
  Button,
  Divider,
  Group,
  Stack as MantineStack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import classes from "./Sidebar.module.css";

export type Route = "overview" | "clusters" | "backups" | "steamcmd" | "logs" | "settings";

interface NavItem {
  id: Route;
  label: string;
  icon: typeof HardDrives;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Servers", icon: SquaresFour },
  { id: "backups", label: "Backups", icon: HardDrives },
  { id: "steamcmd", label: "SteamCMD", icon: ArrowsClockwise },
  { id: "logs", label: "Logs", icon: FileText },
];

interface Props {
  route: Route;
  onNavigate: (route: Route) => void;
  steamCmdDetected: boolean;
  steamCmdRunning: boolean;
  officialVersion: string | null;
  appVersion: string;
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
}

export function Sidebar(props: Props): JSX.Element {
  const steamCmdLabel = !props.steamCmdDetected
    ? "SteamCMD: not detected"
    : props.steamCmdRunning
      ? "SteamCMD: running"
      : "SteamCMD: connected";

  return (
    <MantineStack gap="md" className={classes.sidebar}>
      <Group gap="sm" className={classes.brand}>
        <div className={classes.brandMark} aria-hidden="true">
          <Dna size={20} weight="duotone" className={classes.brandIcon} />
        </div>
        <div className={classes.brandCopy}>
          <Text fw={700}>YARK</Text>
          <Text size="xs" c="dimmed">server manager</Text>
        </div>
      </Group>

      <MantineStack gap={6} className={classes.nav}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === props.route;
          return (
            <Button
              key={item.id}
              variant={active ? "light" : "subtle"}
              justify="flex-start"
              leftSection={<Icon size={18} weight={active ? "fill" : "regular"} />}
              className={classes.navButton}
              data-active={active || undefined}
              onClick={() => props.onNavigate(item.id)}
            >
              {item.label}
            </Button>
          );
        })}
      </MantineStack>

      <Divider className={classes.rule} />

      <Button
        variant="subtle"
        justify="flex-start"
        leftSection={<Circle size={12} weight="fill" className={props.steamCmdDetected ? classes.okDot : classes.badDot} />}
        className={classes.navButton}
        onClick={() => props.onNavigate("steamcmd")}
      >
        {steamCmdLabel}
      </Button>

      <div className={classes.preference}>
        <Text size="xs" fw={600}>Preferences</Text>
        <Switch
          size="xs"
          checked={props.openNativeTerminalOnStart}
          onChange={(event) =>
            props.onOpenNativeTerminalOnStartChange(event.currentTarget.checked)
          }
          label="Show console on start"
        />
      </div>

      <div className={classes.versionChip}>
        <Tooltip
          label="Version published by Wildcard's official network status. Updates are determined from the public SteamCMD build."
          multiline
          w={260}
          position="right"
        >
          <Text size="xs" fw={600}>Official version ARK</Text>
        </Tooltip>
        <Text size="sm" className={classes.versionValue}>
          {props.officialVersion ?? "Not detected"}
        </Text>
      </div>

      <Text size="xs" c="dimmed">v{props.appVersion}</Text>
    </MantineStack>
  );
}
