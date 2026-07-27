import {
  Broom,
  CloudArrowDown,
  FolderOpen,
  TerminalWindow,
} from "@phosphor-icons/react";
import { Badge, Button, Group, Stack, Switch, Text, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import type { SteamCmdCacheKind, SteamCmdStatus } from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import classes from "./SettingsPage.module.css";

interface Props {
  appVersion: string;
  steamCmdStatus: SteamCmdStatus | null;
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
  onPickSteamCmdPath: () => void;
  onInstallSteamCmd: () => void;
  onOpenSteamCmdCache: (kind: SteamCmdCacheKind) => void;
  onClearSteamCmdCache: (kind: SteamCmdCacheKind) => void;
  steamCmdBusy?: boolean;
}

export function SettingsPage(props: Props): JSX.Element {
  const detected = props.steamCmdStatus?.detected === true;
  const executablePath = props.steamCmdStatus?.executablePath ?? null;
  const depotCacheDir = props.steamCmdStatus?.depotCacheDir ?? null;
  const contentCacheDir = props.steamCmdStatus?.contentCacheDir ?? null;
  const cacheActionsDisabled = !detected || props.steamCmdBusy === true;

  return (
    <PageScaffold
      title="Settings"
      subtitle="Application preferences that apply across all servers"
      fillViewport
    >
      <Stack gap="md" className={classes.content} data-settings-page>
        <AppSurfaceCard tone="cool">
          <Stack gap="md">
            <div>
              <Title order={3} size="h4">SteamCMD</Title>
              <Text size="sm" c="dimmed" mt={4}>
                Executable used to install, update, and verify server files. Live progress
                appears in the floating panel during a job; history is per server under
                Logs → Updates.
              </Text>
            </div>

            <Group gap="xs" wrap="wrap">
              <Badge
                size="sm"
                variant="light"
                color={detected ? "green" : "yellow"}
              >
                {detected ? "Configured" : "Not configured"}
              </Badge>
            </Group>

            <Text size="sm" fw={600}>Executable path</Text>
            <Text
              className={`${classes.pathValue} ${executablePath === null ? classes.pathValueMuted : ""}`}
              data-steamcmd-path
            >
              {executablePath ?? "No steamcmd.exe selected yet"}
            </Text>

            <Group gap="sm" wrap="wrap" className={classes.actions}>
              <Button
                variant="default"
                leftSection={<FolderOpen size={16} />}
                onClick={props.onPickSteamCmdPath}
              >
                Choose steamcmd.exe
              </Button>
              {!detected && (
                <Button
                  leftSection={<CloudArrowDown size={16} />}
                  onClick={props.onInstallSteamCmd}
                >
                  Install SteamCMD
                </Button>
              )}
            </Group>

            <div className={classes.cacheSection} data-steamcmd-caches>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" className={classes.cacheHeading}>
                Shared caches
              </Text>
              <CacheRow
                label="Depotcache"
                description="Compressed Steam downloads reused across installs and updates."
                path={depotCacheDir}
                disabled={cacheActionsDisabled}
                onOpen={() => props.onOpenSteamCmdCache("depot")}
                onClear={() => props.onClearSteamCmdCache("depot")}
              />
              <CacheRow
                label="ASA content cache"
                description="Expanded install tree copied to each server (avoids re-downloading)."
                path={contentCacheDir}
                disabled={cacheActionsDisabled}
                onOpen={() => props.onOpenSteamCmdCache("content")}
                onClear={() => props.onClearSteamCmdCache("content")}
              />
            </div>
          </Stack>
        </AppSurfaceCard>

        <AppSurfaceCard tone="cool">
          <div className={classes.settingRow}>
            <div className={classes.settingCopy}>
              <Title order={3} size="h4">Native server console</Title>
              <Text size="sm" c="dimmed" mt={4}>
                When starting or restarting a server, open the dedicated server&apos;s Windows
                console window so live output is visible outside YARK.
              </Text>
            </div>
            <div className={classes.settingControl}>
              <Switch
                size="md"
                checked={props.openNativeTerminalOnStart}
                onChange={(event) =>
                  props.onOpenNativeTerminalOnStartChange(event.currentTarget.checked)
                }
                aria-label="Show native console when starting or restarting a server"
              />
            </div>
          </div>
        </AppSurfaceCard>

        <AppSurfaceCard tone="flat">
          <Group gap="sm" wrap="nowrap">
            <TerminalWindow size={18} />
            <div>
              <Text fw={600} size="sm">YARK server manager</Text>
              <Text size="xs" c="dimmed">Version {props.appVersion}</Text>
            </div>
          </Group>
        </AppSurfaceCard>
      </Stack>
    </PageScaffold>
  );
}

interface CacheRowProps {
  label: string;
  description: string;
  path: string | null;
  disabled: boolean;
  onOpen: () => void;
  onClear: () => void;
}

function CacheRow(props: CacheRowProps): JSX.Element {
  return (
    <div className={classes.cacheRow}>
      <div className={classes.cacheCopy}>
        <Text size="sm" fw={600}>{props.label}</Text>
        <Text size="xs" c="dimmed">{props.description}</Text>
        <Text size="xs" className={classes.cachePath} title={props.path ?? undefined}>
          {props.path ?? "Available after SteamCMD is configured"}
        </Text>
      </div>
      <Group gap={6} wrap="nowrap" className={classes.cacheActions}>
        <Button
          size="compact-xs"
          variant="subtle"
          leftSection={<FolderOpen size={14} />}
          disabled={props.disabled || props.path === null}
          onClick={props.onOpen}
        >
          Open
        </Button>
        <Button
          size="compact-xs"
          variant="subtle"
          color="red"
          leftSection={<Broom size={14} />}
          disabled={props.disabled || props.path === null}
          onClick={props.onClear}
        >
          Clear
        </Button>
      </Group>
    </div>
  );
}
