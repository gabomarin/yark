import type { ReactElement } from "react";
import { FolderOpen } from "@phosphor-icons/react";
import { Button, Group, Switch, Text, Title } from "@mantine/core";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import classes from "../SettingsPage.module.css";

interface Props {
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
  defaultBaseFolder: string | null;
  onDefaultBaseFolderChange: (path: string | null) => void;
  onPickDefaultBaseFolder: () => void;
}

export function SettingsServersSection(props: Props): ReactElement {
  return (
    <section className={classes.section} aria-labelledby="settings-servers">
      <Title order={3} size="h4" id="settings-servers">
        Servers
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
            New servers are created here, each in its own named subfolder.
          </Text>
        </div>
        <div className={classes.pathActionsRow} data-default-base-folder>
          <ReadonlyPath
            className={classes.pathChip}
            value={props.defaultBaseFolder}
            emptyLabel="Not set — choose a folder when creating a server"
          />
          <Group gap="xs" wrap="wrap" className={classes.pathActions}>
            <Button
              size="xs"
              variant="default"
              leftSection={<FolderOpen size={14} />}
              onClick={props.onPickDefaultBaseFolder}
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
  );
}
