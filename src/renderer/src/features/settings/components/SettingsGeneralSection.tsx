import type { ReactElement } from "react";
import { Button, SegmentedControl, Switch, Text, Title } from "@mantine/core";
import type { UiDensity } from "../settingsModel";
import classes from "../SettingsPage.module.css";

interface Props {
  uiDensity: UiDensity;
  onUiDensityChange: (density: UiDensity) => void;
  closeWindowToTray: boolean;
  onCloseWindowToTrayChange: (enabled: boolean) => void;
  trayCloseHintDismissed: boolean;
  onTrayCloseHintDismissedChange: (dismissed: boolean) => void;
  startWithWindows: boolean;
  onStartWithWindowsChange: (enabled: boolean) => void;
  osNotifyEnabled: boolean;
  onOsNotifyEnabledChange: (enabled: boolean) => void;
  osNotifyCrash: boolean;
  onOsNotifyCrashChange: (enabled: boolean) => void;
  osNotifySteamCmd: boolean;
  onOsNotifySteamCmdChange: (enabled: boolean) => void;
  osNotifyYarkUpdate: boolean;
  onOsNotifyYarkUpdateChange: (enabled: boolean) => void;
  desktopShellReady: boolean;
  onRunSetupAgain?: () => void;
}

export function SettingsGeneralSection(props: Props): ReactElement {
  return (
    <section className={classes.section} aria-labelledby="settings-general">
      <Title order={3} size="h4" id="settings-general">
        General
      </Title>

      <div className={classes.settingStack}>
        <div className={classes.settingRow}>
          <div className={classes.settingCopy}>
            <Text size="sm" fw={600}>
              Close window to tray
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              Closing the window hides YARK in the tray. Use the tray icon or Quit to show it again or exit.
            </Text>
          </div>
          <div className={classes.settingControl}>
            <Switch
              checked={props.closeWindowToTray}
              disabled={!props.desktopShellReady}
              onChange={(event) => props.onCloseWindowToTrayChange(event.currentTarget.checked)}
              aria-label="Close window to system tray"
            />
          </div>
        </div>

        <div className={classes.settingGroup}>
          <div className={classes.settingRow}>
            <div className={classes.settingCopy}>
              <Text size="sm" fw={600}>
                Desktop alerts
              </Text>
              <Text size="xs" c="dimmed" mt={2}>
                Windows notifications for the events below. Turn off to stay quiet.
              </Text>
            </div>
            <div className={classes.settingControl}>
              <Switch
                checked={props.osNotifyEnabled}
                disabled={!props.desktopShellReady}
                onChange={(event) => props.onOsNotifyEnabledChange(event.currentTarget.checked)}
                aria-label="Desktop alerts"
              />
            </div>
          </div>

          <div className={classes.settingGroupChild}>
            <div className={classes.settingCopy}>
              <Text size="sm" fw={600}>
                Server crash
              </Text>
              <Text size="xs" c="dimmed" mt={2}>
                When a dedicated server stops unexpectedly.
              </Text>
            </div>
            <div className={classes.settingControl}>
              <Switch
                checked={props.osNotifyCrash}
                disabled={!props.desktopShellReady || !props.osNotifyEnabled}
                onChange={(event) => props.onOsNotifyCrashChange(event.currentTarget.checked)}
                aria-label="Alert on server crash"
              />
            </div>
          </div>

          <div className={classes.settingGroupChild}>
            <div className={classes.settingCopy}>
              <Text size="sm" fw={600}>
                Installs and updates
              </Text>
              <Text size="xs" c="dimmed" mt={2}>
                When installing, updating, or checking server files finishes or fails.
              </Text>
            </div>
            <div className={classes.settingControl}>
              <Switch
                checked={props.osNotifySteamCmd}
                disabled={!props.desktopShellReady || !props.osNotifyEnabled}
                onChange={(event) => props.onOsNotifySteamCmdChange(event.currentTarget.checked)}
                aria-label="Alert on installs and updates"
              />
            </div>
          </div>

          <div className={classes.settingGroupChild}>
            <div className={classes.settingCopy}>
              <Text size="sm" fw={600}>
                YARK updates
              </Text>
              <Text size="xs" c="dimmed" mt={2}>
                When a new YARK version is available or ready to install.
              </Text>
            </div>
            <div className={classes.settingControl}>
              <Switch
                checked={props.osNotifyYarkUpdate}
                disabled={!props.desktopShellReady || !props.osNotifyEnabled}
                onChange={(event) => props.onOsNotifyYarkUpdateChange(event.currentTarget.checked)}
                aria-label="Alert on YARK updates"
              />
            </div>
          </div>

          {props.closeWindowToTray ? (
            <div className={classes.settingGroupChild}>
              <div className={classes.settingCopy}>
                <Text size="sm" fw={600}>
                  Hide to tray
                </Text>
                <Text size="xs" c="dimmed" mt={2}>
                  Reminder that YARK is still running after you close the window.
                </Text>
              </div>
              <div className={classes.settingControl}>
                <Switch
                  checked={!props.trayCloseHintDismissed}
                  disabled={!props.desktopShellReady || !props.osNotifyEnabled}
                  onChange={(event) => props.onTrayCloseHintDismissedChange(!event.currentTarget.checked)}
                  aria-label="Alert when hiding to tray"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className={classes.settingRow}>
          <div className={classes.settingCopy}>
            <Text size="sm" fw={600}>
              Start with Windows
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              Open YARK at Windows sign-in. Does not start dedicated servers.
            </Text>
          </div>
          <div className={classes.settingControl}>
            <Switch
              checked={props.startWithWindows}
              disabled={!props.desktopShellReady}
              onChange={(event) => props.onStartWithWindowsChange(event.currentTarget.checked)}
              aria-label="Start YARK with Windows"
            />
          </div>
        </div>

        <div className={classes.settingRow}>
          <div className={classes.settingCopy}>
            <Text size="sm" fw={600}>
              Quick jump
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              Press Ctrl+K to jump to a page or open a server by name.
            </Text>
          </div>
        </div>

        <div className={classes.settingRow}>
          <div className={classes.settingCopy}>
            <Text size="sm" fw={600}>
              Display size
            </Text>
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

        {props.onRunSetupAgain !== undefined && (
          <div className={classes.settingRow}>
            <div className={classes.settingCopy}>
              <Text size="sm" fw={600}>
                Setup assistant
              </Text>
              <Text size="xs" c="dimmed" mt={2}>
                Review SteamCMD, folder, and Windows options. Empty fleet also offers a first map.
              </Text>
            </div>
            <div className={classes.settingControl}>
              <Button size="xs" variant="default" onClick={props.onRunSetupAgain}>
                Open setup assistant
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
