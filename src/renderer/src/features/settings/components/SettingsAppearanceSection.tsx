import type { ReactElement } from "react";
import { SegmentedControl, Text, Title } from "@mantine/core";
import { APP_THEME_LIST } from "@theme/themes";
import { LAYOUT_PROFILE_LIST, resolveLayoutProfile } from "@shared/layout/layoutProfiles";
import type { LayoutProfileId, ThemeId, UiDensity } from "../settingsModel";
import classes from "../SettingsPage.module.css";

interface Props {
  uiDensity: UiDensity;
  onUiDensityChange: (density: UiDensity) => void;
  themeId: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  layoutProfile: LayoutProfileId;
  onLayoutProfileChange: (layout: LayoutProfileId) => void;
}

/**
 * Appearance (#PUX-004 Track B). Density and theme are the same kind of choice -
 * how the shell reads on this PC - so they live together instead of splitting
 * density into General. The theme control renders the registry, so a new theme
 * is a registry entry, not a UI change.
 */
export function SettingsAppearanceSection(props: Props): ReactElement {
  return (
    <section className={classes.section} aria-labelledby="settings-appearance" data-settings-appearance>
      <Title order={3} size="h4" id="settings-appearance">
        Appearance
      </Title>
      <Text size="sm" c="dimmed">
        How YARK reads on this PC. Every choice applies immediately and is remembered across restarts.
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
              The shell palette. Themes that ship later appear here; the default stays the dark Paleo-Tech shell.
            </Text>
          </div>
          <div className={classes.settingControl}>
            <SegmentedControl
              size="xs"
              value={props.themeId}
              onChange={(value) => {
                if (value !== props.themeId) {
                  props.onThemeChange(value as ThemeId);
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
              Layout
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              {resolveLayoutProfile(props.layoutProfile).description}
            </Text>
          </div>
          <div className={classes.settingControl}>
            <SegmentedControl
              size="xs"
              value={props.layoutProfile}
              onChange={(value) => {
                if (value !== props.layoutProfile) {
                  props.onLayoutProfileChange(value as LayoutProfileId);
                }
              }}
              data={LAYOUT_PROFILE_LIST.map((profile) => ({ label: profile.label, value: profile.id }))}
              aria-label="Layout"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
