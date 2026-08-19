import type { ReactElement } from "react";
import {
  ArrowCircleUp,
  Circle,
  DownloadSimple,
  FileText,
  GearSix,
  HardDrives,
  ShareNetwork,
  SquaresFour,
} from "@phosphor-icons/react";
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  NavLink,
  Stack as MantineStack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
import type { OfficialNetworkStatus } from "@shared/types";
import { Fragment } from "react";
import yarkLogo from "../../assets/brand/yark-logo.png";
import classes from "./Sidebar.module.css";

export type Route = "overview" | "downloads" | "clusters" | "backups" | "logs" | "settings";

interface NavItem {
  id: Route;
  label: string;
  icon: typeof HardDrives;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Servers", icon: SquaresFour },
  { id: "clusters", label: "Clusters", icon: ShareNetwork },
  { id: "downloads", label: "Downloads", icon: DownloadSimple },
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
  /** When set, show the update icon next to the version label. */
  yarkUpdateAvailableVersion?: string | null;
  /** Opens What's new — wired only to the `vX.Y.Z` text, not the full row. */
  onWhatsNewClick?: () => void;
  /** Opens Settings → About — wired only to the update icon. */
  onYarkUpdateClick?: () => void;
  /** Icon-only chrome rail (#107 recipe). */
  iconMode?: boolean;
  downloadCount?: number;
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
  const iconMode = props.iconMode === true;
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
  /** Hardcoded lg/md → compact md|sm, else lg|md (#233). */
  const steamCmdIconSize = compact ? "md" : "lg";
  const steamCmdButtonSize = compact ? "sm" : "md";

  const versionTooltip = officialVersionTooltip(
    props.officialVersion,
    props.officialNetworkStatus,
  );
  const updateAvailable =
    props.yarkUpdateAvailableVersion != null
    && props.yarkUpdateAvailableVersion !== "";
  const versionLabel = (
    <Text
      size={metadataTextSize}
      c={updateAvailable ? undefined : "dimmed"}
      className={updateAvailable ? classes.appVersionUpdateText : undefined}
      component="span"
    >
      v{props.appVersion}
    </Text>
  );

  return (
    <MantineStack
      gap={compact ? "sm" : "md"}
      align={iconMode ? "center" : undefined}
      className={classes.sidebar}
      data-icon-mode={iconMode || undefined}
    >
      <div className={classes.brandRow}>
        <Tooltip
          label="Quick jump · Ctrl+K"
          position="right"
          withArrow
          openDelay={200}
        >
          <div className={classes.brand}>
            <img
              src={yarkLogo}
              alt="YARK server manager"
              className={classes.brandLockup}
              draggable={false}
            />
          </div>
        </Tooltip>
      </div>

      <MantineStack
        gap={compact ? "xxs" : "xs"}
        align={iconMode ? "center" : undefined}
        className={classes.nav}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === props.route;
          const link = (
            <NavLink
              component="button"
              type="button"
              active={active}
              label={iconMode ? undefined : item.label}
              aria-label={item.label}
              leftSection={
                <Icon size={navIconSize} weight={active ? "fill" : "regular"} />
              }
              rightSection={
                !iconMode && item.id === "downloads" && (props.downloadCount ?? 0) > 0 ? (
                  <Text
                    component="span"
                    size="xs"
                    fw={600}
                    c="blue"
                    aria-label={`${props.downloadCount} downloads`}
                  >
                    {props.downloadCount}
                  </Text>
                ) : undefined
              }
              className={classes.navLink}
              onClick={() => props.onNavigate(item.id)}
            />
          );
          if (!iconMode) {
            return <Fragment key={item.id}>{link}</Fragment>;
          }
          return (
            <Tooltip key={item.id} label={item.label} position="right" withArrow openDelay={200}>
              {link}
            </Tooltip>
          );
        })}
      </MantineStack>

      <Divider className={classes.rule} />

      {iconMode ? (
        <Tooltip label={steamCmdLabel} position="right" withArrow>
          <ActionIcon
            variant="subtle"
            size={steamCmdIconSize}
            aria-label={steamCmdLabel}
            className={classes.steamCmdIcon}
            onClick={() => props.onNavigate("settings")}
          >
            <Circle
              size={compact ? 10 : 12}
              weight="fill"
              className={props.steamCmdDetected ? classes.okDot : classes.badDot}
            />
          </ActionIcon>
        </Tooltip>
      ) : (
        <Button
          size={steamCmdButtonSize}
          variant="subtle"
          justify="center"
          leftSection={
            <Circle
              size={compact ? 10 : 12}
              weight="fill"
              className={props.steamCmdDetected ? classes.okDot : classes.badDot}
            />
          }
          className={classes.steamCmdButton}
          onClick={() => props.onNavigate("settings")}
        >
          {steamCmdLabel}
        </Button>
      )}

      {!iconMode && (
        <div className={classes.versionChip}>
          <Tooltip label="ARK Official Server Network" position="right">
            <Text size={metadataTextSize} fw={600} ta="center" className={classes.versionLabel}>
              ARK official version
            </Text>
          </Tooltip>
          <div className={classes.versionRow}>
            <Tooltip
              label={versionTooltip}
              multiline={deploying || offline}
              w={deploying || offline ? 260 : undefined}
              position="right"
            >
              <Group gap={6} wrap="nowrap" justify="center">
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
                <Text size={versionTextSize} ta="center" className={versionToneClass}>
                  {props.officialVersion ?? "Not detected"}
                </Text>
              </Group>
            </Tooltip>
          </div>
        </div>
      )}

      {iconMode ? (
        <Group gap={4} wrap="nowrap" justify="center" className={classes.appVersionRow}>
          {updateAvailable && props.onYarkUpdateClick !== undefined && (
            <Tooltip
              label={`Update ${props.yarkUpdateAvailableVersion} available — open Settings`}
              position="right"
              withArrow
            >
              <UnstyledButton
                className={classes.appVersionUpdateIconBtn}
                onClick={props.onYarkUpdateClick}
                aria-label={`YARK update available, version ${props.yarkUpdateAvailableVersion}`}
                data-yark-update-version
              >
                <ArrowCircleUp
                  size={compact ? 12 : 14}
                  weight="bold"
                  className={classes.appVersionUpdateIcon}
                  aria-hidden
                />
              </UnstyledButton>
            </Tooltip>
          )}
          {props.onWhatsNewClick !== undefined ? (
            <Tooltip label={`YARK v${props.appVersion} — What's new`} position="right" withArrow>
              <UnstyledButton
                className={
                  updateAvailable ? classes.appVersionLabelUpdate : classes.appVersionLabelRail
                }
                onClick={props.onWhatsNewClick}
                aria-label={`What's new in YARK v${props.appVersion}`}
                data-yark-app-version
              >
                {versionLabel}
              </UnstyledButton>
            </Tooltip>
          ) : (
            <Text
              size={metadataTextSize}
              c="dimmed"
              data-yark-app-version
              className={classes.appVersionLabelRail}
            >
              v{props.appVersion}
            </Text>
          )}
        </Group>
      ) : (
        <Group gap={5} wrap="nowrap" justify="center" className={classes.appVersionRow}>
          {updateAvailable && props.onYarkUpdateClick !== undefined && (
            <Tooltip
              label={`YARK update available (v${props.yarkUpdateAvailableVersion}) — open Settings to update`}
              multiline
              w={220}
              position="right"
            >
              <UnstyledButton
                className={classes.appVersionUpdateIconBtn}
                onClick={props.onYarkUpdateClick}
                aria-label={`YARK update available, version ${props.yarkUpdateAvailableVersion}`}
                data-yark-update-version
              >
                <ArrowCircleUp
                  size={compact ? 13 : 15}
                  weight="bold"
                  className={classes.appVersionUpdateIcon}
                  aria-hidden
                />
              </UnstyledButton>
            </Tooltip>
          )}
          {props.onWhatsNewClick !== undefined ? (
            <Tooltip label="What's new in this version" position="right">
              <UnstyledButton
                className={
                  updateAvailable ? classes.appVersionLabelUpdate : classes.appVersionLabel
                }
                onClick={props.onWhatsNewClick}
                aria-label={`What's new in YARK v${props.appVersion}`}
                data-yark-app-version
              >
                {versionLabel}
              </UnstyledButton>
            </Tooltip>
          ) : (
            <Text
              size={metadataTextSize}
              c="dimmed"
              data-yark-app-version
              className={classes.appVersionLabel}
            >
              v{props.appVersion}
            </Text>
          )}
        </Group>
      )}
    </MantineStack>
  );
}
