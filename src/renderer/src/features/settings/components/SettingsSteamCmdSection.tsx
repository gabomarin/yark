import type { ReactElement } from "react";
import { Broom, CloudArrowDown, FolderOpen } from "@phosphor-icons/react";
import { Button, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { SteamCmdCacheKind, SteamCmdStatus } from "@shared/types";
import { steamCmdProgressFallbackLabel } from "@shared/server/steamcmd-progress";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { AppPathRow } from "@ui/AppPathRow/AppPathRow";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import { STEAMCMD_PATH_ATTR } from "../settingsTestIds";
import classes from "../SettingsPage.module.css";

interface Props {
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdBusy?: boolean;
  onPickSteamCmdPath: () => void;
  onInstallSteamCmd: () => void;
  onOpenSteamCmdCache: (kind: SteamCmdCacheKind) => void;
  onClearSteamCmdCache: (kind: SteamCmdCacheKind) => void;
}

export function SettingsSteamCmdSection(props: Props): ReactElement {
  const detected = props.steamCmdStatus?.detected === true;
  const executablePath = props.steamCmdStatus?.executablePath ?? null;
  const depotCacheDir = props.steamCmdStatus?.depotCacheDir ?? null;
  const contentCacheDir = props.steamCmdStatus?.contentCacheDir ?? null;
  const steamCmdBusy = props.steamCmdBusy === true;
  const installingSteamCmd =
    steamCmdBusy && props.steamCmdStatus?.operation === "install-steamcmd";
  /* A paused job still counts as busy (update-service: busy = live || queued,
   * where queued includes `paused`), so say why instead of leaving a dead button. */
  const busyHoverHint = "SteamCMD is busy";
  const cacheDisabledHint = !detected
    ? "Set up SteamCMD first"
    : steamCmdBusy
      ? busyHoverHint
      : null;
  const activity = (
    props.steamCmdStatus?.progressLabel ??
    steamCmdProgressFallbackLabel(props.steamCmdStatus?.operation ?? null)
  ).replace(/\.$/, "");
  const queuedCount = props.steamCmdStatus?.queuedCount ?? 0;

  return (
    <section className={classes.section} aria-labelledby="settings-steamcmd">
      <Group justify="space-between" align="center" gap="sm" wrap="wrap">
        <Title order={3} size="h4" id="settings-steamcmd">
          SteamCMD
        </Title>
        <Text
          size="xs"
          fw={600}
          className={detected ? classes.statusReady : classes.statusNeedsSetup}
        >
          {detected ? "Ready" : installingSteamCmd ? "Installing…" : "Needs setup"}
        </Text>
      </Group>

      {steamCmdBusy && (
        <AppAlert
          variant="light"
          color="blue"
          title={installingSteamCmd ? "Installing SteamCMD" : "SteamCMD is busy"}
          data-steamcmd-busy
        >
          {installingSteamCmd ? (
            "The executable path and the shared caches unlock when it finishes."
          ) : (
            <>
              {activity}. The executable path and the shared caches are locked until the
              job finishes or is cancelled.
              {queuedCount > 0
                ? ` ${queuedCount} more ${queuedCount === 1 ? "job" : "jobs"} queued behind it.`
                : ""}
            </>
          )}
        </AppAlert>
      )}

      <AppPathRow
        actions={
          <>
            <Tooltip label={busyHoverHint} disabled={!steamCmdBusy}>
              <span>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<FolderOpen size={14} />}
                  disabled={steamCmdBusy}
                  onClick={props.onPickSteamCmdPath}
                >
                  Choose…
                </Button>
              </span>
            </Tooltip>
            {!detected && (
              <Button
                size="xs"
                leftSection={<CloudArrowDown size={14} />}
                disabled={steamCmdBusy}
                loading={installingSteamCmd}
                onClick={props.onInstallSteamCmd}
              >
                Install SteamCMD
              </Button>
            )}
          </>
        }
      >
        <ReadonlyPath
          value={executablePath}
          emptyLabel="No steamcmd.exe selected yet"
          {...{ [STEAMCMD_PATH_ATTR]: true }}
        />
      </AppPathRow>

      <div className={classes.cacheSection} data-steamcmd-caches>
        <Text size="sm" fw={600}>Shared caches</Text>
        <Text size="xs" c="dimmed">
          Free disk space or inspect folders
        </Text>
        <Stack gap="sm" className={classes.cacheList}>
          <CacheRow
            label="Download cache"
            description="Temporary files Steam already downloaded. Clear this to free disk space – the next install or update will download them again."
            path={depotCacheDir}
            disabledHint={cacheDisabledHint}
            onOpen={() => props.onOpenSteamCmdCache("depot")}
            onClear={() => props.onClearSteamCmdCache("depot")}
          />
          <CacheRow
            label="Shared server files"
            description="A ready-made copy of the ARK server used to set up new servers faster. Clearing it means the next install rebuilds that copy first."
            path={contentCacheDir}
            disabledHint={cacheDisabledHint}
            onOpen={() => props.onOpenSteamCmdCache("content")}
            onClear={() => props.onClearSteamCmdCache("content")}
          />
        </Stack>
      </div>
    </section>
  );
}

interface CacheRowProps {
  label: string;
  description: string;
  path: string | null;
  /** Why the row is locked, or null when the actions are live. */
  disabledHint: string | null;
  onOpen: () => void;
  onClear: () => void;
}

function CacheRow(props: CacheRowProps): ReactElement {
  return (
    <div className={classes.cacheRow}>
      <Text size="sm" fw={600}>{props.label}</Text>
      <Text size="xs" c="dimmed">{props.description}</Text>
      <AppPathRow
        actions={
          <Tooltip label={props.disabledHint ?? ""} disabled={props.disabledHint === null}>
            <Group gap="xs" wrap="nowrap">
              <Button
                variant="subtle"
                leftSection={<FolderOpen size={14} />}
                disabled={props.disabledHint !== null || props.path === null}
                onClick={props.onOpen}
              >
                Open
              </Button>
              <Button
                variant="subtle"
                color="red"
                leftSection={<Broom size={14} />}
                disabled={props.disabledHint !== null || props.path === null}
                onClick={props.onClear}
              >
                Clear
              </Button>
            </Group>
          </Tooltip>
        }
      >
        <ReadonlyPath
          value={props.path}
          emptyLabel="Available after SteamCMD is set up"
          compact
        />
      </AppPathRow>
    </div>
  );
}
