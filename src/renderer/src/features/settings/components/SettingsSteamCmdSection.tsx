import type { ReactElement } from "react";
import { Broom, CloudArrowDown, FolderOpen } from "@phosphor-icons/react";
import { Button, Group, Stack, Text, Title } from "@mantine/core";
import type { SteamCmdCacheKind, SteamCmdStatus } from "@shared/types";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
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
  const cacheActionsDisabled = !detected || props.steamCmdBusy === true;

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
          {detected ? "Ready" : "Needs setup"}
        </Text>
      </Group>

      <div className={classes.pathActionsRow}>
        <ReadonlyPath
          className={classes.pathChip}
          value={executablePath}
          emptyLabel="No steamcmd.exe selected yet"
          data-steamcmd-path
        />
        <Group gap="xs" wrap="wrap" className={classes.pathActions}>
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
        <Text size="sm" fw={600}>Shared caches</Text>
        <Text size="xs" c="dimmed">
          Free disk space or inspect folders
        </Text>
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
      </div>
    </section>
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

function CacheRow(props: CacheRowProps): ReactElement {
  return (
    <div className={classes.cacheRow}>
      <div className={classes.cacheCopy}>
        <Text size="sm" fw={600}>{props.label}</Text>
        <Text size="xs" c="dimmed">{props.description}</Text>
        <ReadonlyPath
          className={classes.cachePath}
          value={props.path}
          emptyLabel="Available after SteamCMD is set up"
          compact
        />
      </div>
      <Group gap="xs" wrap="nowrap" className={classes.cacheActions}>
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
