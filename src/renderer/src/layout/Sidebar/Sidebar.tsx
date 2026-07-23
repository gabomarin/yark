import {
  ArrowsClockwise,
  Circle,
  CloudArrowDown,
  FileText,
  Gear,
  HardDrives,
  SquaresFour,
  Stack,
} from "@phosphor-icons/react";
import { Button, Divider, Group, Stack as MantineStack, Text } from "@mantine/core";
import classes from "./Sidebar.module.css";

export type Route = "overview" | "clusters" | "backups" | "steamcmd" | "logs" | "settings";

interface NavItem {
  id: Route;
  label: string;
  icon: typeof HardDrives;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: SquaresFour },
  { id: "clusters", label: "Clusters", icon: Stack },
  { id: "backups", label: "Backups", icon: CloudArrowDown },
  { id: "steamcmd", label: "SteamCMD", icon: ArrowsClockwise },
  { id: "logs", label: "Logs", icon: FileText },
  { id: "settings", label: "Settings", icon: Gear },
];

interface Props {
  route: Route;
  onNavigate: (route: Route) => void;
  steamCmdDetected: boolean;
  steamCmdRunning: boolean;
  officialVersion: string | null;
  appVersion: string;
}

export function Sidebar(props: Props): JSX.Element {
  const steamCmdLabel = !props.steamCmdDetected
    ? "SteamCMD: no detectado"
    : props.steamCmdRunning
      ? "SteamCMD: en ejecución"
      : "SteamCMD: conectado";

  return (
    <MantineStack gap="md" className={classes.sidebar}>
      <Group gap="sm" className={classes.brand}>
        <HardDrives size={24} weight="duotone" className={classes.brandIcon} />
        <div>
          <Text fw={700}>ARK Server GBO</Text>
          <Text size="sm" c="dimmed">Panel multi-servidor local</Text>
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

      <Divider color="rgba(255,255,255,0.08)" />

      <Button
        variant="subtle"
        justify="flex-start"
        leftSection={<Circle size={12} weight="fill" className={props.steamCmdDetected ? classes.okDot : classes.badDot} />}
        className={classes.navButton}
        onClick={() => props.onNavigate("steamcmd")}
      >
        {steamCmdLabel}
      </Button>

      <div className={classes.versionChip}>
        <Text size="xs" fw={600}>Official Version</Text>
        <Text size="sm">{props.officialVersion ?? "No detectada"}</Text>
      </div>

      <Text size="xs" c="dimmed">v{props.appVersion}</Text>
    </MantineStack>
  );
}