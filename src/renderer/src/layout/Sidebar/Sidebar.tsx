import type { ReactElement } from "react";
import {
  Circle,
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
import type { OfficialNetworkStatus } from "@shared/types";
import yarkLogo from "../../assets/brand/yark-logo.png";
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
  officialNetworkStatus: OfficialNetworkStatus;
  appVersion: string;
}

function officialVersionTooltip(
  version: string | null,
  networkStatus: OfficialNetworkStatus,
): string {
  if (networkStatus === "deploying" && version !== null) {
    return `Wildcard is deploying version ${version}.`;
  }
  if (networkStatus === "offline" && version !== null) {
    return `Official network reports Offline (v${version}).`;
  }
  if (networkStatus === "offline") {
    return "Official network reports Offline.";
  }
  return "ARK Official Server Network";
}

export function Sidebar(props: Props): ReactElement {
  const density = useUiDensity();
  const compact = density === "compact";
  const navIconSize = compact ? 16 : 18;
  // Keep secondary sidebar copy readable in Compact without enlarging Comfortable.
  const metadataTextSize = compact ? "sm" : "xs";
  const versionTextSize = compact ? "md" : "sm";
  const deploying = props.officialNetworkStatus === "deploying";
  const offline = props.officialNetworkStatus === "offline";
  const versionToneClass = deploying
    ? classes.versionValueDeploying
    : offline
      ? classes.versionValueOffline
      : classes.versionValue;
  const statusDotClass = deploying
    ? classes.deployingDot
    : offline
      ? classes.badDot
      : classes.okDot;

  const steamCmdLabel = !props.steamCmdDetected
    ? "SteamCMD missing"
    : props.steamCmdRunning
      ? "SteamCMD busy"
      : "SteamCMD ready";

  const versionTooltip = officialVersionTooltip(
    props.officialVersion,
    props.officialNetworkStatus,
  );

  return (
    <MantineStack gap={compact ? "sm" : "md"} className={classes.sidebar}>
      <div className={classes.brand}>
        <img
          src={yarkLogo}
          alt="YARK server manager"
          className={classes.brandLockup}
          draggable={false}
        />
      </div>

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
        className={`${classes.navButton} ${classes.steamCmdButton}`}
        onClick={() => props.onNavigate("settings")}
      >
        {steamCmdLabel}
      </Button>

      <div className={classes.versionChip}>
        <Tooltip label="ARK Official Server Network" position="right">
          <Text size={metadataTextSize} fw={600}>Official version ARK</Text>
        </Tooltip>
        <Tooltip label={versionTooltip} multiline={deploying || offline} w={deploying || offline ? 260 : undefined} position="right">
          <Group gap={6} wrap="nowrap" className={classes.versionRow}>
            {(deploying || offline) && (
              <Circle
                size={compact ? 8 : 9}
                weight="fill"
                className={statusDotClass}
                aria-label={
                  deploying ? "Official network deploying" : "Official network offline"
                }
              />
            )}
            <Text size={versionTextSize} className={versionToneClass}>
              {props.officialVersion ?? "Not detected"}
            </Text>
          </Group>
        </Tooltip>
      </div>

      <Text size={metadataTextSize} c="dimmed">v{props.appVersion}</Text>
    </MantineStack>
  );
}
