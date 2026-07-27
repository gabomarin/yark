import { useEffect, useState } from "react";
import {
  Broom,
  CaretDown,
  CaretRight,
  CloudArrowDown,
  FolderOpen,
} from "@phosphor-icons/react";
import {
  Button,
  Group,
  Stack,
  Switch,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import type { AppDataFolderInfo, AppDataFolderKind } from "@shared/ipc";
import type { SteamCmdCacheKind, SteamCmdStatus } from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import classes from "./SettingsPage.module.css";

interface Props {
  appVersion: string;
  steamCmdStatus: SteamCmdStatus | null;
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
  defaultBaseFolder: string | null;
  onDefaultBaseFolderChange: (path: string | null) => void;
  onPickSteamCmdPath: () => void;
  onInstallSteamCmd: () => void;
  onOpenSteamCmdCache: (kind: SteamCmdCacheKind) => void;
  onClearSteamCmdCache: (kind: SteamCmdCacheKind) => void;
  steamCmdBusy?: boolean;
}

export function SettingsPage(props: Props): JSX.Element {
  const [cachesOpen, setCachesOpen] = useState(false);
  const [dataFoldersOpen, setDataFoldersOpen] = useState(false);
  const [dataFolders, setDataFolders] = useState<AppDataFolderInfo[]>([]);
  const [dataFoldersError, setDataFoldersError] = useState<string | null>(null);
  const detected = props.steamCmdStatus?.detected === true;
  const executablePath = props.steamCmdStatus?.executablePath ?? null;
  const depotCacheDir = props.steamCmdStatus?.depotCacheDir ?? null;
  const contentCacheDir = props.steamCmdStatus?.contentCacheDir ?? null;
  const cacheActionsDisabled = !detected || props.steamCmdBusy === true;
  const steamCmdStatusLabel = detected ? "Ready" : "Needs setup";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await window.api.listAppDataFolders();
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setDataFoldersError(result.error ?? "Could not list app data folders");
        setDataFolders([]);
        return;
      }
      setDataFoldersError(null);
      setDataFolders(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickDefaultBaseFolder = async () => {
    const current = props.defaultBaseFolder ?? undefined;
    const result = await window.api.pickPath(
      "directory",
      current,
      "Select default base folder for new servers",
    );
    if (!result.ok || result.data === null) {
      return;
    }
    props.onDefaultBaseFolderChange(result.data);
  };

  const openDataFolder = async (kind: AppDataFolderKind) => {
    setDataFoldersError(null);
    const result = await window.api.openAppDataFolder(kind);
    if (!result.ok) {
      setDataFoldersError(result.error ?? "Could not open folder");
    }
  };

  return (
    <PageScaffold
      title="Settings"
      subtitle="Preferences that apply to the whole app"
    >
      <Stack gap="md" data-settings-page>
        <AppSurfaceCard tone="cool">
          <Stack gap="md">
            <section className={classes.section} aria-labelledby="settings-general">
              <Title order={3} size="h4" id="settings-general">
                General
              </Title>
              <div className={classes.settingRow}>
                <div className={classes.settingCopy}>
                  <Text size="sm" fw={600}>Show server console on start</Text>
                  <Text size="xs" c="dimmed" mt={2}>
                    Opens the ARK dedicated-server console window when you start or restart a
                    server.
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

              <div className={classes.settingBlock}>
                <div className={classes.settingCopy}>
                  <Text size="sm" fw={600}>Default base folder</Text>
                  <Text size="xs" c="dimmed" mt={2}>
                    Prefills the base folder when you create a new server. Each server still
                    gets its own subfolder named after it.
                  </Text>
                </div>
                <div className={classes.steamCmdRow} data-default-base-folder>
                  <Text
                    className={`${classes.pathValue} ${props.defaultBaseFolder === null ? classes.pathValueMuted : ""}`}
                  >
                    {props.defaultBaseFolder ?? "Not set — choose a folder when creating a server"}
                  </Text>
                  <Group gap="xs" wrap="wrap" className={classes.steamCmdActions}>
                    <Button
                      size="xs"
                      variant="default"
                      leftSection={<FolderOpen size={14} />}
                      onClick={() => void pickDefaultBaseFolder()}
                    >
                      Choose…
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      disabled={props.defaultBaseFolder === null}
                      onClick={() => props.onDefaultBaseFolderChange(null)}
                    >
                      Clear
                    </Button>
                  </Group>
                </div>
              </div>
            </section>

            <div className={classes.sectionRule} />

            <section className={classes.section} aria-labelledby="settings-steamcmd">
              <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
                <div className={classes.settingCopy}>
                  <Title order={3} size="h4" id="settings-steamcmd">
                    SteamCMD
                  </Title>
                  <Text size="xs" c="dimmed" mt={2}>
                    Tool that downloads and updates ARK server files.
                  </Text>
                </div>
                <Text
                  size="xs"
                  fw={600}
                  className={detected ? classes.statusReady : classes.statusNeedsSetup}
                >
                  {steamCmdStatusLabel}
                </Text>
              </Group>

              <div className={classes.steamCmdRow}>
                <Text
                  className={`${classes.pathValue} ${executablePath === null ? classes.pathValueMuted : ""}`}
                  data-steamcmd-path
                >
                  {executablePath ?? "No steamcmd.exe selected yet"}
                </Text>
                <Group gap="xs" wrap="wrap" className={classes.steamCmdActions}>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<FolderOpen size={14} />}
                    onClick={props.onPickSteamCmdPath}
                  >
                    Choose…
                  </Button>
                  {!detected && (
                    <Button
                      size="xs"
                      leftSection={<CloudArrowDown size={14} />}
                      onClick={props.onInstallSteamCmd}
                    >
                      Install SteamCMD
                    </Button>
                  )}
                </Group>
              </div>

              <div className={classes.cacheSection} data-steamcmd-caches>
                <UnstyledButton
                  className={classes.cacheToggle}
                  onClick={() => setCachesOpen((open) => !open)}
                  aria-expanded={cachesOpen}
                >
                  <Group gap={6} wrap="nowrap">
                    {cachesOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
                    <Text size="sm" fw={600}>Shared caches</Text>
                    <Text size="xs" c="dimmed">
                      Free disk space or inspect folders
                    </Text>
                  </Group>
                </UnstyledButton>

                {cachesOpen && (
                  <Stack gap="sm" className={classes.cacheList}>
                    <CacheRow
                      label="Download cache"
                      description="Temporary files Steam already downloaded. Clear this to free disk space — the next install or update will download them again."
                      path={depotCacheDir}
                      disabled={cacheActionsDisabled}
                      onOpen={() => props.onOpenSteamCmdCache("depot")}
                      onClear={() => props.onClearSteamCmdCache("depot")}
                    />
                    <CacheRow
                      label="Shared server files"
                      description="A ready-made copy of the ARK server used to set up new servers faster. Clearing it means the next install rebuilds that copy first."
                      path={contentCacheDir}
                      disabled={cacheActionsDisabled}
                      onOpen={() => props.onOpenSteamCmdCache("content")}
                      onClear={() => props.onClearSteamCmdCache("content")}
                    />
                  </Stack>
                )}
              </div>
            </section>

            <div className={classes.sectionRule} />

            <section className={classes.section} aria-labelledby="settings-data">
              <div className={classes.cacheSection} data-app-data-folders>
                <UnstyledButton
                  className={classes.cacheToggle}
                  onClick={() => setDataFoldersOpen((open) => !open)}
                  aria-expanded={dataFoldersOpen}
                  aria-controls="settings-data"
                >
                  <Group gap={6} wrap="nowrap">
                    {dataFoldersOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
                    <Text size="sm" fw={600} id="settings-data">App data folders</Text>
                    <Text size="xs" c="dimmed">
                      Open YARK’s local files in Explorer
                    </Text>
                  </Group>
                </UnstyledButton>

                {dataFoldersOpen && (
                  <Stack gap="sm" className={classes.cacheList}>
                    {dataFoldersError !== null && (
                      <Text size="xs" c="red">{dataFoldersError}</Text>
                    )}
                    {dataFolders.map((folder) => (
                      <div key={folder.kind} className={classes.cacheRow}>
                        <div className={classes.cacheCopy}>
                          <Text size="sm" fw={600}>{folder.label}</Text>
                          <Text size="xs" className={classes.cachePath} title={folder.path}>
                            {folder.path}
                          </Text>
                        </div>
                        <Group gap={6} wrap="nowrap" className={classes.cacheActions}>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            leftSection={<FolderOpen size={14} />}
                            onClick={() => void openDataFolder(folder.kind)}
                          >
                            Open
                          </Button>
                        </Group>
                      </div>
                    ))}
                  </Stack>
                )}
              </div>
            </section>
          </Stack>
        </AppSurfaceCard>

        <Text size="xs" c="dimmed" className={classes.about}>
          YARK server manager · v{props.appVersion}
        </Text>
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
          {props.path ?? "Available after SteamCMD is set up"}
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
