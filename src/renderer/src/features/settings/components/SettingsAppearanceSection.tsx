import type { ReactElement } from "react";
import { SegmentedControl, Text, Title } from "@mantine/core";
import { THEME_FAMILY_LIST, themeVariantsForFamily } from "@theme/themes";
import { isThemeFamilyId, isThemeScheme, isWorkspacePanelsId } from "@shared/settings/appearance";
import { WORKSPACE_PANELS_OPTION_LIST, resolveWorkspacePanelsOption } from "@shared/workspace/workspacePanels";
import type { ThemeFamilyId, ThemeScheme, UiDensity, WorkspacePanelsId } from "../settingsModel";
import classes from "../SettingsPage.module.css";

interface Props {
  uiDensity: UiDensity;
  onUiDensityChange: (density: UiDensity) => void;
  family: ThemeFamilyId;
  onFamilyChange: (family: ThemeFamilyId) => void;
  scheme: ThemeScheme;
  onSchemeChange: (scheme: ThemeScheme) => void;
  workspacePanels: WorkspacePanelsId;
  onWorkspacePanelsChange: (panels: WorkspacePanelsId) => void;
}

/**
 * Appearance (#PUX-004 Track B, family split #PUX-005-B). Display size, theme
 * family, scheme and where the server workspace puts its panels - the four "how
 * it looks on this PC" choices, so density lives here instead of in General.
 * Every id control renders its registry, so shipping another family, variant or
 * option is data, not a UI change.
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
              Theme family
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              The visual language of the shell.
            </Text>
          </div>
          <div className={classes.settingControl}>
            <SegmentedControl
              size="xs"
              value={props.family}
              onChange={(value) => {
                if (isThemeFamilyId(value) && value !== props.family) {
                  props.onFamilyChange(value);
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
              Theme
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              The shell colours.
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
              data={themeVariantsForFamily(props.family).map((theme) => ({ label: theme.label, value: theme.scheme }))}
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
