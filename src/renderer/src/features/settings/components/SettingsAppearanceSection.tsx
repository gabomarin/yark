import type { ReactElement } from "react";
import { SegmentedControl, Text, Title } from "@mantine/core";
import { APP_THEME_LIST } from "@theme/themes";
import { isThemeId, isWorkspacePanelsId } from "@shared/settings/appearance";
import { WORKSPACE_PANELS_OPTION_LIST, resolveWorkspacePanelsOption } from "@shared/workspace/workspacePanels";
import type { ThemeId, UiDensity, WorkspacePanelsId } from "../settingsModel";
import classes from "../SettingsPage.module.css";

interface Props {
  uiDensity: UiDensity;
  onUiDensityChange: (density: UiDensity) => void;
  themeId: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  workspacePanels: WorkspacePanelsId;
  onWorkspacePanelsChange: (panels: WorkspacePanelsId) => void;
}

/**
 * Appearance (#PUX-004 Track B). Display size, theme and where the server
 * workspace puts its panels - the three "how it looks on this PC" choices, so
 * density lives here instead of in General. Both id controls render their
 * registry, so shipping another theme or option is data, not a UI change.
 */
export function SettingsAppearanceSection(props: Props): ReactElement {
  return (
    <section className={classes.section} aria-labelledby="settings-appearance" data-settings-appearance>
      <Title order={3} size="h4" id="settings-appearance">
        Appearance
      </Title>
      <Text size="sm" c="dimmed">
        Theme, size and how the server workspace arranges its panels.
      </Text>

      <div className={classes.settingStack}>
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

        <div className={classes.settingRow}>
          <div className={classes.settingCopy}>
            <Text size="sm" fw={600}>
              Theme
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              The shell colours.
            </Text>
          </div>
          <div className={classes.settingControl}>
            <SegmentedControl
              size="xs"
              value={props.themeId}
              onChange={(value) => {
                if (isThemeId(value) && value !== props.themeId) {
                  props.onThemeChange(value);
                }
              }}
              data={APP_THEME_LIST.map((theme) => ({ label: theme.label, value: theme.id }))}
              aria-label="Theme"
            />
          </div>
        </div>

        <div className={classes.settingRow}>
          <div className={classes.settingCopy}>
            <Text size="sm" fw={600}>
              Server panels
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              {resolveWorkspacePanelsOption(props.workspacePanels).description}
            </Text>
          </div>
          <div className={classes.settingControl}>
            <SegmentedControl
              size="xs"
              value={props.workspacePanels}
              onChange={(value) => {
                if (isWorkspacePanelsId(value) && value !== props.workspacePanels) {
                  props.onWorkspacePanelsChange(value);
                }
              }}
              data={WORKSPACE_PANELS_OPTION_LIST.map((option) => ({ label: option.label, value: option.id }))}
              aria-label="Server panels"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
