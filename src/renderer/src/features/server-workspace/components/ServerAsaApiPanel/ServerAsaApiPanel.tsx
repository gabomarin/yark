import type { ReactElement } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Progress,
  Stack,
  Text,
} from "@mantine/core";
import { DownloadSimple, FolderOpen, Trash } from "@phosphor-icons/react";
import type { ServerProfile } from "@shared/types";
import {
  formatSteamCmdByteProgress,
  hasMeaningfulSteamCmdByteProgress,
} from "@shared/steamcmd-progress";
import { useUiDensity } from "@app/AppProviders";
import { AppPanelConfirmModal } from "@ui/AppPanelConfirmModal/AppPanelConfirmModal";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { asaApiConfirmCopy } from "./asaApiPanelModel";
import { ServerAsaApiInstalledSection } from "./ServerAsaApiInstalledSection";
import { useServerAsaApiPanel } from "./useServerAsaApiPanel";
import classes from "./ServerAsaApiPanel.module.css";

interface Props {
  server: ServerProfile;
  onServerUpdated: () => void;
}

export function ServerAsaApiPanel(props: Props): ReactElement {
  const density = useUiDensity();
  const inputSize: "xs" | "sm" = density === "compact" ? "xs" : "sm";
  const panel = useServerAsaApiPanel(props.server, props.onServerUpdated);
  const confirmCopy = asaApiConfirmCopy(panel.confirm);
  const installedOnDisk = panel.status?.installedOnDisk === true;
  const asaOn = props.server.useAsaApi === true;
  const loaderOn = props.server.useAsaApiLoader === true;

  return (
    <>
      <AppSurfaceCard
        tone="flat"
        fill
        padding={0}
        radius="md"
        className={classes.panel}
        data-testid="server-asaapi-panel"
        data-asa-api-panel
      >
        <div className={classes.scroll}>
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Text fw={600}>Ark Server API</Text>
                <Text size="xs" c="dimmed">
                  Optional server-side plugins.
                </Text>
              </div>
              {installedOnDisk ? (
                <Group gap="xs">
                  <Button
                    size={inputSize}
                    variant="default"
                    leftSection={<DownloadSimple size={14} />}
                    loading={panel.isBusy("install")}
                    disabled={panel.locked && !panel.isBusy("install")}
                    onClick={() => void panel.onInstall()}
                  >
                    Check updates
                  </Button>
                  <Button
                    size={inputSize}
                    variant="light"
                    color="red"
                    leftSection={<Trash size={14} />}
                    loading={panel.isBusy("uninstall")}
                    disabled={panel.locked && !panel.isBusy("uninstall")}
                    onClick={panel.onUninstall}
                  >
                    Remove
                  </Button>
                </Group>
              ) : null}
            </Group>

            {panel.error !== null ? (
              <Alert color="red">{panel.error}</Alert>
            ) : null}

            {panel.installProgress !== null ? (
              <AppSurfaceCard tone="flat" padding="sm">
                <Stack gap="xs">
                  <Group gap="sm" wrap="nowrap" align="center">
                    <Loader
                      size="sm"
                      aria-label="Ark Server API install in progress"
                    />
                    <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
                      {panel.installProgress.label || "Working…"}
                    </Text>
                  </Group>
                  <Progress
                    value={panel.installProgress.percent ?? 12}
                    animated
                    striped
                  />
                  {hasMeaningfulSteamCmdByteProgress(
                    panel.installProgress.bytesDownloaded,
                    panel.installProgress.bytesTotal,
                  ) ? (
                    <Text size="xs" c="dimmed">
                      {formatSteamCmdByteProgress(
                        panel.installProgress.bytesDownloaded!,
                        panel.installProgress.bytesTotal!,
                      )}
                      {panel.installProgress.assetLabel
                        ? ` · ${panel.installProgress.assetLabel}`
                        : ""}
                    </Text>
                  ) : (
                    <Text size="xs" c="dimmed">
                      Usually about 25–30 MB. This can take a minute on slower
                      connections.
                    </Text>
                  )}
                </Stack>
              </AppSurfaceCard>
            ) : null}

            {panel.loading && panel.status === null ? (
              <Text size="sm" c="dimmed">
                Checking this install…
              </Text>
            ) : null}

            {panel.status !== null && !installedOnDisk ? (
              <EmptyState
                layout="stacked"
                icon={<DownloadSimple size={20} />}
                title="Not installed yet"
                description="Download is about 25–30 MB. Skip this if you only use mods from the Mods tab."
                action={
                  <Group gap="sm">
                    <Button
                      size={inputSize}
                      leftSection={<DownloadSimple size={14} />}
                      loading={panel.isBusy("install")}
                      disabled={panel.locked && !panel.isBusy("install")}
                      onClick={() => void panel.onInstall()}
                    >
                      Install
                    </Button>
                    <Button
                      size={inputSize}
                      variant="default"
                      leftSection={<FolderOpen size={14} />}
                      onClick={() =>
                        void window.api.openAsaApiWin64(props.server.id)
                      }
                    >
                      Open server folder
                    </Button>
                  </Group>
                }
              />
            ) : null}

            {panel.status !== null && installedOnDisk ? (
              <ServerAsaApiInstalledSection
                serverId={props.server.id}
                status={panel.status}
                versionHint={panel.versionHint}
                asaOn={asaOn}
                loaderOn={loaderOn}
                inputSize={inputSize}
                locked={panel.locked}
                isBusy={panel.isBusy}
                persistAsaApiFlags={panel.persistAsaApiFlags}
                onAddPluginZip={panel.onAddPluginZip}
                onPluginEnabled={panel.onPluginEnabled}
                onDeletePlugin={panel.onDeletePlugin}
                onClearCache={panel.onClearCache}
              />
            ) : null}
          </Stack>
        </div>
      </AppSurfaceCard>

      <AppPanelConfirmModal
        opened={panel.confirm !== null}
        onClose={panel.closeConfirm}
        onConfirm={panel.runConfirm}
        title={confirmCopy.title}
        meta={confirmCopy.meta}
        confirmLabel={confirmCopy.confirmLabel}
        confirmLoading={
          confirmCopy.busyKind !== null
            ? panel.isBusy(confirmCopy.busyKind)
            : false
        }
        contentProps={{ "data-asaapi-confirm-modal": "" }}
      >
        {panel.confirm?.kind === "uninstall" ? (
          <Text size="sm">
            Deletes the API, loader, and plugins from this server folder. Your
            game files stay so you can Start as usual. Stop the server first.
          </Text>
        ) : null}
        {panel.confirm?.kind === "clearCache" ? (
          <Text size="sm">
            Deletes cached Ark Server API zip downloads from YARK’s app data. The
            next Install will download again. Files already on this server stay.
          </Text>
        ) : null}
        {panel.confirm?.kind === "deletePlugin" ? (
          <Text size="sm">
            Permanently deletes the{" "}
            <Text span fw={600} inherit>
              {panel.confirm.plugin.name}
            </Text>{" "}
            folder from this server (Plugins or Disabled_Plugins). Stop the
            server first. This cannot be undone from YARK.
          </Text>
        ) : null}
      </AppPanelConfirmModal>
    </>
  );
}
