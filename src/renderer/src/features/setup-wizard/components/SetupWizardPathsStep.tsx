import type { ReactElement } from "react";
import { CloudArrowDown, FolderOpen } from "@phosphor-icons/react";
import { Button, Group, Stack, Text, Title } from "@mantine/core";
import type { SteamCmdStatus } from "@shared/types";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import classes from "../setupWizard.module.css";

interface Props {
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdBusy: boolean;
  defaultBaseFolder: string | null;
  onPickSteamCmdPath: () => void;
  onInstallSteamCmd: () => void;
  onDefaultBaseFolderChange: (path: string | null) => void;
}

export function SetupWizardPathsStep(props: Props): ReactElement {
  const detected = props.steamCmdStatus?.detected === true;
  const executablePath = props.steamCmdStatus?.executablePath ?? null;

  const pickDefaultBaseFolder = async (): Promise<void> => {
    const result = await window.api.pickPath(
      "directory",
      props.defaultBaseFolder ?? undefined,
      "Select default base folder for new servers",
    );
    if (!result.ok || result.data === null) {
      return;
    }
    props.onDefaultBaseFolderChange(result.data);
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
        <div>
          <Title order={4}>SteamCMD</Title>
          <Text size="xs" c="dimmed" mt={2}>
            Installs and updates dedicated server files. You can continue while it
            runs.
          </Text>
        </div>
        <Text
          size="xs"
          fw={600}
          className={detected ? classes.statusReady : classes.statusNeedsSetup}
        >
          {detected ? "Ready" : "Needs setup"}
        </Text>
      </Group>

      <div className={classes.pathRow}>
        <ReadonlyPath
          className={classes.pathChip}
          value={executablePath}
          emptyLabel="No steamcmd.exe selected yet"
          data-setup-steamcmd-path
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
              disabled={props.steamCmdBusy}
              onClick={props.onInstallSteamCmd}
            >
              Install SteamCMD
            </Button>
          )}
        </Group>
      </div>

      <div>
        <Title order={4}>Default base folder</Title>
        <Text size="xs" c="dimmed" mt={2} mb="xs">
          New servers are created here, each in its own named subfolder.
        </Text>
        <div className={classes.pathRow}>
          <ReadonlyPath
            className={classes.pathChip}
            value={props.defaultBaseFolder}
            emptyLabel="Not set — choose a folder when creating a server"
            data-setup-default-base-folder
          />
          <Group gap="xs" wrap="wrap" className={classes.pathActions}>
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
    </Stack>
  );
}
