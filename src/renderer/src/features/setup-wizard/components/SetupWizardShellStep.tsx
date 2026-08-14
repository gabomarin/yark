import type { ReactElement } from "react";
import { SegmentedControl, Stack, Switch, Text, Title } from "@mantine/core";
import type { UiDensity } from "@features/settings/settingsModel";
import { useDesktopShellPreferences } from "@features/settings/useDesktopShellPreferences";
import classes from "../setupWizard.module.css";

interface Props {
  uiDensity: UiDensity;
  onUiDensityChange: (density: UiDensity) => void;
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
}

export function SetupWizardShellStep(props: Props): ReactElement {
  const desktopShell = useDesktopShellPreferences();

  return (
    <Stack gap="md">
      <div>
        <Title order={4}>Windows shell</Title>
        <Text size="xs" c="dimmed" mt={2}>
          How YARK sits on this PC. Changes apply right away.
        </Text>
      </div>

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
          <Text size="sm" fw={600}>Start with Windows</Text>
          <Text size="xs" c="dimmed" mt={2}>
            Open YARK when you sign in. Dedicated servers start only if you enable
            auto-start on each one.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <Switch
            checked={desktopShell.startWithWindows}
            disabled={!desktopShell.desktopShellReady}
            onChange={(event) =>
              desktopShell.onStartWithWindowsChange(event.currentTarget.checked)
            }
            aria-label="Start YARK with Windows"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>Close window to tray</Text>
          <Text size="xs" c="dimmed" mt={2}>
            The close button hides YARK in the tray. Servers keep running until you
            quit from the tray icon.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <Switch
            checked={desktopShell.closeWindowToTray}
            disabled={!desktopShell.desktopShellReady}
            onChange={(event) =>
              desktopShell.onCloseWindowToTrayChange(event.currentTarget.checked)
            }
            aria-label="Close window to system tray"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>Display size</Text>
          <Text size="xs" c="dimmed" mt={2}>
            Compact fits more on screen. Comfortable uses larger type and spacing.
          </Text>
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
      {desktopShell.shellError !== null && (
        <Text size="xs" c="red">
          {desktopShell.shellError}
        </Text>
      )}
    </Stack>
  );
}
