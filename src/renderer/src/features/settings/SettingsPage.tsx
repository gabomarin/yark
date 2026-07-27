import {
  ArrowSquareOut,
  CloudArrowDown,
  FolderOpen,
  TerminalWindow,
} from "@phosphor-icons/react";
import { Badge, Button, Group, Stack, Switch, Text, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import type { SteamCmdStatus } from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import classes from "./SettingsPage.module.css";

interface Props {
  appVersion: string;
  steamCmdStatus: SteamCmdStatus | null;
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
  onPickSteamCmdPath: () => void;
  onInstallSteamCmd: () => void;
  onOpenSteamCmdPage: () => void;
}

export function SettingsPage(props: Props): JSX.Element {
  const detected = props.steamCmdStatus?.detected === true;
  const executablePath = props.steamCmdStatus?.executablePath ?? null;

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
                Executable used to install, update, and verify server files. Operations and
                console output live on the SteamCMD page.
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
              <Button
                variant="subtle"
                leftSection={<ArrowSquareOut size={16} />}
                onClick={props.onOpenSteamCmdPage}
              >
                Open SteamCMD page
              </Button>
            </Group>
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
