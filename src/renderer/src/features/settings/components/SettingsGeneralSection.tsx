import { FolderOpen } from "@phosphor-icons/react";
import { Button, Group, SegmentedControl, Switch, Text, Title } from "@mantine/core";
import type { UiDensity } from "../settingsModel";
import classes from "../SettingsPage.module.css";

interface Props {
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
  uiDensity: UiDensity;
  onUiDensityChange: (density: UiDensity) => void;
  defaultBaseFolder: string | null;
  onDefaultBaseFolderChange: (path: string | null) => void;
  onPickDefaultBaseFolder: () => void;
}

export function SettingsGeneralSection(props: Props): JSX.Element {
  return (
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
            checked={props.openNativeTerminalOnStart}
            onChange={(event) =>
              props.onOpenNativeTerminalOnStartChange(event.currentTarget.checked)
            }
            aria-label="Show native console when starting or restarting a server"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>UI density</Text>
        </div>
        <div className={classes.settingControl}>
          <SegmentedControl
            size="xs"
            value={props.uiDensity}
            onChange={(value) => {
              if (value === "comfortable" || value === "compact") {
                props.onUiDensityChange(value);
              }
            }}
            data={[
              { label: "Comfortable", value: "comfortable" },
              { label: "Compact", value: "compact" },
            ]}
            aria-label="UI density"
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
