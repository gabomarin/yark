import {
  Circle,
  Dna,
  FileText,
  GearSix,
  HardDrives,
  ShareNetwork,
  SquaresFour,
} from "@phosphor-icons/react";
import {
  Button,
  Divider,
  Group,
  Stack as MantineStack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
import classes from "./Sidebar.module.css";

export type Route = "overview" | "clusters" | "backups" | "logs" | "settings";

interface NavItem {
  id: Route;
  label: string;
  icon: typeof HardDrives;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Servers", icon: SquaresFour },
  { id: "clusters", label: "Clusters", icon: ShareNetwork },
  { id: "backups", label: "Backups", icon: HardDrives },
  { id: "logs", label: "Logs", icon: FileText },
  { id: "settings", label: "Settings", icon: GearSix },
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
  const density = useUiDensity();
  const compact = density === "compact";
  const brandIconSize = compact ? 16 : 20;
  const navIconSize = compact ? 16 : 18;
  // Keep secondary sidebar copy readable in Compact without enlarging Comfortable.
  const metadataTextSize = compact ? "sm" : "xs";
  const versionTextSize = compact ? "md" : "sm";

  const steamCmdLabel = !props.steamCmdDetected
    ? "SteamCMD: not detected"
    : props.steamCmdRunning
      ? "SteamCMD: running"
      : "SteamCMD: connected";

  return (
    <MantineStack gap={compact ? "sm" : "md"} className={classes.sidebar}>
      <Group gap={compact ? "xs" : "sm"} className={classes.brand}>
        <div className={classes.brandMark} aria-hidden="true">
          <Dna size={brandIconSize} weight="duotone" className={classes.brandIcon} />
        </div>
        <div className={classes.brandCopy}>
          <Text fw={700}>YARK</Text>
          <Text size={metadataTextSize} c="dimmed">server manager</Text>
        </div>
      </Group>

      <MantineStack gap={compact ? "xxs" : "xs"} className={classes.nav}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === props.route;
          return (
            <Button
              key={item.id}
              size="md"
              variant={active ? "light" : "subtle"}
              justify="flex-start"
              leftSection={<Icon size={navIconSize} weight={active ? "fill" : "regular"} />}
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
        size="md"
        variant="subtle"
        justify="flex-start"
        leftSection={
          <Circle
            size={compact ? 10 : 12}
            weight="fill"
            className={props.steamCmdDetected ? classes.okDot : classes.badDot}
          />
        }
        className={classes.navButton}
        onClick={() => props.onNavigate("settings")}
      >
        {steamCmdLabel}
      </Button>

      <div className={classes.versionChip}>
        <Tooltip
          label="Version published by Wildcard's official network status. Updates are determined from the public SteamCMD build."
          multiline
          w={260}
          position="right"
        >
          <Text size={metadataTextSize} fw={600}>Official version ARK</Text>
        </Tooltip>
        <Text size={versionTextSize} className={classes.versionValue}>
          {props.officialVersion ?? "Not detected"}
        </Text>
      </div>

      <Text size={metadataTextSize} c="dimmed">v{props.appVersion}</Text>
    </MantineStack>
  );
}
