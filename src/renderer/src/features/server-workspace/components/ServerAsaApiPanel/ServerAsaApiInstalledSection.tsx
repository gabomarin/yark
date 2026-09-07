import type { ReactElement } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { FolderOpen, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import type { AsaApiPluginInfo, AsaApiStatus } from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import {
  asaApiInjectLabel,
  pluginCountLabel,
  type AsaApiBusyKind,
} from "./asaApiPanelModel";
import classes from "./ServerAsaApiPanel.module.css";

interface Props {
  serverId: string;
  status: AsaApiStatus;
  versionHint: string | null;
  asaOn: boolean;
  loaderOn: boolean;
  inputSize: "xs" | "sm";
  locked: boolean;
  isBusy: (kind: AsaApiBusyKind) => boolean;
  persistAsaApiFlags: (next: {
    useAsaApi: boolean;
    useAsaApiLoader: boolean;
  }) => Promise<void>;
  onAddPluginZip: () => Promise<void>;
  onPluginEnabled: (
    plugin: AsaApiPluginInfo,
    enabled: boolean,
  ) => Promise<void>;
  onDeletePlugin: (plugin: AsaApiPluginInfo) => void;
  onClearCache: () => void;
}

export function ServerAsaApiInstalledSection(props: Props): ReactElement {
  const injectLabel = asaApiInjectLabel(props.asaOn, props.loaderOn);

  return (
    <>
      <div className={classes.statusGrid}>
        <AppSurfaceCard tone="flat" padding="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            On Start
          </Text>
          <Text size="sm" fw={600}>
            {injectLabel}
          </Text>
          <Text size="xs" c="dimmed">
            {props.status.versionDllPresent
              ? "Version.dll ready"
              : props.status.versionDllDisabledPresent
                ? "Version.dll set aside"
                : "Version.dll missing"}
          </Text>
        </AppSurfaceCard>
        <AppSurfaceCard tone="flat" padding="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            API version
          </Text>
          <Text size="sm" fw={600}>
            {props.versionHint ?? props.status.installedVersionLabel ?? "On disk"}
          </Text>
          <Text size="xs" c="dimmed">
            Update after game patches
          </Text>
        </AppSurfaceCard>
        <AppSurfaceCard tone="flat" padding="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Plugins
          </Text>
          <Text size="sm" fw={600}>
            {props.status.plugins.length === 0
              ? "None yet"
              : `${props.status.plugins.length} found`}
          </Text>
          <Text size="xs" c="dimmed">
            {pluginCountLabel(props.status.plugins)}
          </Text>
        </AppSurfaceCard>
      </div>

      <section>
        <Text className={classes.groupTitle}>When you Start</Text>
        <div
          className={`${classes.optionRow} ${
            props.asaOn ? "" : classes.optionRowDisabled
          }`}
        >
          <Group align="flex-start" gap="sm" wrap="nowrap">
            <Switch
              checked={props.asaOn}
              size="sm"
              disabled={props.locked}
              aria-label="Load Ark Server API when this server starts"
              onChange={(e) => {
                const next = e.currentTarget.checked;
                void props.persistAsaApiFlags({
                  useAsaApi: next,
                  useAsaApiLoader: next ? props.loaderOn : false,
                });
              }}
            />
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
              <Tooltip
                label="Loads the API with this server. YARK keeps tracking the normal game process so Start / Stop / Leave work as usual."
                multiline
                maw={360}
                withArrow
              >
                <span className={classes.optionLabel} tabIndex={0}>
                  Load on Start
                </span>
              </Tooltip>
              <Text size="xs" c="dimmed">
                Off by default. Turn off anytime to Start without the API.
              </Text>
            </Stack>
          </Group>
        </div>

        <div
          className={`${classes.optionRow} ${
            props.asaOn ? "" : classes.optionRowDisabled
          }`}
        >
          <Group align="flex-start" gap="sm" wrap="nowrap">
            <Switch
              checked={props.loaderOn}
              size="sm"
              disabled={props.locked || !props.asaOn}
              aria-label="Use the older AsaApiLoader instead"
              onChange={(e) => {
                void props.persistAsaApiFlags({
                  useAsaApi: true,
                  useAsaApiLoader: e.currentTarget.checked,
                });
              }}
            />
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
              <Tooltip
                label="Only needed if Version.dll does not work on this PC. Most operators can leave this off."
                multiline
                maw={360}
                withArrow
              >
                <span className={classes.optionLabel} tabIndex={0}>
                  Use older loader instead
                </span>
              </Tooltip>
              <Text size="xs" c="dimmed">
                Optional fallback. Leave off unless Version.dll fails.
              </Text>
            </Stack>
          </Group>
        </div>
      </section>

      <section>
        <Group justify="space-between" align="center" mb={6} wrap="wrap">
          <Text className={classes.groupTitle}>Plugins</Text>
          <Group gap="xs">
            <Button
              size={props.inputSize}
              variant="default"
              loading={props.isBusy("addPlugin")}
              disabled={props.locked && !props.isBusy("addPlugin")}
              leftSection={<Plus size={14} />}
              onClick={() => void props.onAddPluginZip()}
            >
              Add plugin zip
            </Button>
            <Button
              size={props.inputSize}
              variant="subtle"
              onClick={() => void window.api.openAsaApiPlugins(props.serverId)}
            >
              Open plugins folder
            </Button>
          </Group>
        </Group>
        {props.status.plugins.length === 0 ? (
          <EmptyState
            layout="stacked"
            icon={<FolderOpen size={20} />}
            title="No plugins yet"
            description="Add a plugin zip, or place each plugin in its own folder under ArkApi\Plugins (folder name = .dll name)."
          />
        ) : (
          <AppSurfaceCard tone="flat" padding={0}>
            <ul className={classes.pluginList}>
              {props.status.plugins.map((plugin) => (
                <li key={plugin.folderName} className={classes.pluginRow}>
                  <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Switch
                      checked={plugin.enabled}
                      size="sm"
                      disabled={props.locked}
                      aria-label={`Enable ${plugin.name}`}
                      onChange={(e) => {
                        void props.onPluginEnabled(
                          plugin,
                          e.currentTarget.checked,
                        );
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600}>
                        {plugin.name}
                      </Text>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {plugin.dllPresent
                          ? `${plugin.name}.dll`
                          : "DLL missing"}
                        {plugin.configFile
                          ? ` · ${plugin.configFile}`
                          : ""}
                      </Text>
                    </div>
                  </Group>
                  <Tooltip label={`Delete ${plugin.name}`} withArrow>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      size="sm"
                      aria-label={`Delete ${plugin.name}`}
                      loading={props.isBusy("deletePlugin")}
                      disabled={
                        props.locked && !props.isBusy("deletePlugin")
                      }
                      onClick={() => props.onDeletePlugin(plugin)}
                    >
                      <Trash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </AppSurfaceCard>
        )}
        <Text size="xs" c="dimmed" mt={6}>
          Add plugin zip installs into ArkApi\Plugins. Off moves a plugin to
          Disabled_Plugins; trash deletes it. Stop the server first.
        </Text>
      </section>

      <Alert color="yellow" icon={<WarningCircle size={16} />}>
        Experimental YARK integration – behavior and UI may change.
      </Alert>

      <Group justify="flex-end">
        <Button
          size={props.inputSize}
          variant="subtle"
          color="gray"
          loading={props.isBusy("clearCache")}
          disabled={props.locked && !props.isBusy("clearCache")}
          onClick={props.onClearCache}
        >
          Clear download cache
        </Button>
      </Group>
    </>
  );
}
