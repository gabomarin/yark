import type { ReactElement } from "react";
import { CloudArrowDown, DiscordLogo, FileText, GearSix, HardDrives, Info, PaintBrush } from "@phosphor-icons/react";
import { NavLink, Stack } from "@mantine/core";
import { navSelectedClassName } from "@ui/NavSelected/navSelectedClassName";
import { SETTINGS_CATEGORIES, type SettingsCategory } from "../settingsModel";
import classes from "../SettingsPage.module.css";

const CATEGORY_ICONS: Record<SettingsCategory, typeof GearSix> = {
  general: GearSix,
  appearance: PaintBrush,
  servers: HardDrives,
  steamcmd: CloudArrowDown,
  discord: DiscordLogo,
  logs: FileText,
  about: Info,
};

interface Props {
  active: SettingsCategory;
  onChange: (category: SettingsCategory) => void;
}

export function SettingsNav(props: Props): ReactElement {
  return (
    <nav aria-label="Settings categories" className={classes.navList}>
      <Stack gap={4} className={classes.navRow}>
        {SETTINGS_CATEGORIES.map((item) => {
          const Icon = CATEGORY_ICONS[item.id];
          const active = item.id === props.active;
          return (
            <NavLink
              key={item.id}
              component="button"
              type="button"
              active={active}
              label={item.label}
              aria-label={item.label}
              leftSection={<Icon size={16} weight={active ? "fill" : "regular"} />}
              className={navSelectedClassName(classes.navLink)}
              onClick={() => props.onChange(item.id)}
            />
          );
        })}
      </Stack>
    </nav>
  );
}
