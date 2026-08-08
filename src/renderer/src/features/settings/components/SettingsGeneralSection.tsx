import type { ReactElement } from "react";
import { FolderOpen } from "@phosphor-icons/react";
import { Button, Group, SegmentedControl, Switch, Text, Title } from "@mantine/core";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import type { UiDensity } from "../settingsModel";
import classes from "../SettingsPage.module.css";

interface Props {
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
  uiDensity: UiDensity;
  onUiDensityChange: (density: UiDensity) => void;
  closeWindowToTray: boolean;
  onCloseWindowToTrayChange: (enabled: boolean) => void;
  trayCloseHintDismissed: boolean;
  onTrayCloseHintDismissedChange: (dismissed: boolean) => void;
  startWithWindows: boolean;
  onStartWithWindowsChange: (enabled: boolean) => void;
  desktopShellReady: boolean;
  defaultBaseFolder: string | null;
  onDefaultBaseFolderChange: (path: string | null) => void;
  onPickDefaultBaseFolder: () => void;
}

export function SettingsGeneralSection(props: Props): ReactElement {
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
          <Text size="sm" fw={600}>Close window to tray</Text>
          <Text size="xs" c="dimmed" mt={2}>
            Closing the window hides YARK in the system tray instead of quitting.
            Use the tray icon to show the window again or quit. Minimize still uses
            the taskbar. Quitting while servers are running always asks for
            confirmation (Stop or Cancel).
          </Text>
        </div>
        <div className={classes.settingControl}>
          <Switch
            checked={props.closeWindowToTray}
            disabled={!props.desktopShellReady}
            onChange={(event) =>
              props.onCloseWindowToTrayChange(event.currentTarget.checked)
            }
            aria-label="Close window to system tray"
          />
        </div>
      </div>

      {props.closeWindowToTray ? (
        <div className={classes.settingRow}>
          <div className={classes.settingCopy}>
            <Text size="sm" fw={600}>Show notification when hiding to tray</Text>
            <Text size="xs" c="dimmed" mt={2}>
              Windows toast when the window is hidden. Turn off if you do not want
              the reminder each time.
            </Text>
          </div>
          <div className={classes.settingControl}>
            <Switch
              checked={!props.trayCloseHintDismissed}
              disabled={!props.desktopShellReady}
              onChange={(event) =>
                props.onTrayCloseHintDismissedChange(!event.currentTarget.checked)
              }
              aria-label="Show notification when hiding to tray"
            />
          </div>
        </div>
      ) : null}

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>Start with Windows</Text>
          <Text size="xs" c="dimmed" mt={2}>
            Open YARK when you sign in to Windows. Does not start dedicated servers —
            use Server auto-start below for that.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <Switch
            checked={props.startWithWindows}
            disabled={!props.desktopShellReady}
            onChange={(event) =>
              props.onStartWithWindowsChange(event.currentTarget.checked)
            }
            aria-label="Start YARK with Windows"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>Command palette</Text>
          <Text size="xs" c="dimmed" mt={2}>
            Press <Text span fw={600} inherit>Ctrl</Text>+
            <Text span fw={600} inherit>K</Text> (or{" "}
            <Text span fw={600} inherit>⌘</Text>+
            <Text span fw={600} inherit>K</Text> on Mac) to jump to Servers,
            Clusters, Backups, Logs, Settings, or open a server workspace by name.
          </Text>
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>Display size</Text>
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
            aria-label="Display size"
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
