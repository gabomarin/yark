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
  { id: "overview", label: "Servidores", icon: SquaresFour },
  { id: "steamcmd", label: "SteamCMD", icon: ArrowsClockwise },
  { id: "logs", label: "Registros", icon: FileText },
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
    ? "SteamCMD: no detectado"
    : props.steamCmdRunning
      ? "SteamCMD: en ejecución"
      : "SteamCMD: conectado";

  return (
    <MantineStack gap="md" className={classes.sidebar}>
      <Group gap="sm" className={classes.brand}>
        <div className={classes.brandMark} aria-hidden="true">
          <Dna size={20} weight="duotone" className={classes.brandIcon} />
        </div>
        <div className={classes.brandCopy}>
          <Text fw={700}>ARK Server GBO</Text>
          <Text size="xs" c="dimmed">Operaciones de mundos ASA</Text>
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

      <div className={classes.preference}>
        <Text size="xs" fw={600}>Preferencias</Text>
        <Switch
          size="xs"
          checked={props.openNativeTerminalOnStart}
          onChange={(event) =>
            props.onOpenNativeTerminalOnStartChange(event.currentTarget.checked)
          }
          label="Mostrar consola al iniciar"
        />
      </div>

      <div className={classes.versionChip}>
        <Tooltip
          label="Versión publicada por el estado oficial de red de Wildcard. Las actualizaciones se determinan con el build público de SteamCMD."
          multiline
          w={260}
          position="right"
        >
          <Text size="xs" fw={600}>Versión oficial ARK</Text>
        </Tooltip>
        <Text size="sm" className={classes.versionValue}>
          {props.officialVersion ?? "No detectada"}
        </Text>
      </div>

      <Text size="xs" c="dimmed">v{props.appVersion}</Text>
    </MantineStack>
  );
}
