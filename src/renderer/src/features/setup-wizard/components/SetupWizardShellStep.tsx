import type { ReactElement } from "react";
import { SegmentedControl, Stack, Switch, Text, Title } from "@mantine/core";
import type { ThemeFamilyId, ThemeScheme, UiDensity } from "@features/settings/settingsModel";
import type { DesktopShellPreferencesController } from "@features/settings/hooks/useDesktopShellPreferences";
import { isThemeFamilyId, isThemeScheme } from "@shared/settings/appearance";
import { THEME_FAMILY_LIST, themeVariantsForFamily } from "@theme/themes";
import classes from "../setupWizard.module.css";

interface Props {
  uiDensity: UiDensity;
  onUiDensityChange: (density: UiDensity) => void;
  themeFamily: ThemeFamilyId;
  onThemeFamilyChange: (family: ThemeFamilyId) => void;
  scheme: ThemeScheme;
  onSchemeChange: (scheme: ThemeScheme) => void;
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
  desktopShell: DesktopShellPreferencesController;
}

export function SetupWizardShellStep(props: Props): ReactElement {
  const desktopShell = props.desktopShell;

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
          <Text size="sm" fw={600}>
            Show server console on start
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Opens the ARK dedicated-server console window when a server starts, including Start, Restart, and Auto-start
            with YARK.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <Switch
            checked={props.openNativeTerminalOnStart}
            onChange={(event) => props.onOpenNativeTerminalOnStartChange(event.currentTarget.checked)}
            aria-label="Show native console when a server starts"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>
            Start with Windows
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Open YARK when you sign in. Dedicated servers start only if you enable auto-start on each one.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <Switch
            checked={desktopShell.startWithWindows}
            disabled={!desktopShell.desktopShellReady}
            onChange={(event) => desktopShell.onStartWithWindowsChange(event.currentTarget.checked)}
            aria-label="Start YARK with Windows"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>
            Close window to tray
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            The close button hides YARK in the tray. Servers keep running until you quit from the tray menu or the
            sidebar Quit control.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <Switch
            checked={desktopShell.closeWindowToTray}
            disabled={!desktopShell.desktopShellReady}
            onChange={(event) => desktopShell.onCloseWindowToTrayChange(event.currentTarget.checked)}
            aria-label="Close window to system tray"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>
            Display size
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Compact fits more on screen. Comfortable uses larger type and spacing. Change it later in Settings →
            Appearance.
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

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>
            Theme family
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            The visual language of the shell. The same choice as Settings → Appearance.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <SegmentedControl
            size="xs"
            value={props.themeFamily}
            onChange={(value) => {
              if (isThemeFamilyId(value) && value !== props.themeFamily) {
                props.onThemeFamilyChange(value);
              }
            }}
            data={THEME_FAMILY_LIST.map((family) => ({ label: family.label, value: family.id }))}
            aria-label="Theme family"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>
            Color scheme
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Choose the light or dark scheme.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <SegmentedControl
            size="xs"
            value={props.scheme}
            onChange={(value) => {
              if (isThemeScheme(value) && value !== props.scheme) {
                props.onSchemeChange(value);
              }
            }}
            data={themeVariantsForFamily(props.themeFamily).map((theme) => ({
              label: theme.label,
              value: theme.scheme,
            }))}
            aria-label="Color scheme"
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
