import type { ReactElement } from "react";
import {
  CloudArrowDown,
  FileText,
  GearSix,
  HardDrives,
  Info,
} from "@phosphor-icons/react";
import { Badge, NavLink, Stack } from "@mantine/core";
import {
  SETTINGS_CATEGORIES,
  type SettingsCategory,
} from "../settingsModel";
import classes from "../SettingsPage.module.css";

const CATEGORY_ICONS: Record<
  SettingsCategory,
  typeof GearSix
> = {
  general: GearSix,
  servers: HardDrives,
  steamcmd: CloudArrowDown,
  logs: FileText,
  about: Info,
};

interface Props {
  active: SettingsCategory;
  steamCmdNeedsSetup: boolean;
  steamCmdBusy: boolean;
  onChange: (category: SettingsCategory) => void;
}

export function SettingsNav(props: Props): ReactElement {
  return (
    <nav aria-label="Settings categories">
      <Stack gap={4}>
        {SETTINGS_CATEGORIES.map((item) => {
          const Icon = CATEGORY_ICONS[item.id];
          const active = item.id === props.active;
          return (
            <NavLink
              key={item.id}
              component="button"
              type="button"
              active={active}
              variant="light"
              label={item.label}
              aria-label={item.label}
              leftSection={<Icon size={16} weight={active ? "fill" : "regular"} />}
              rightSection={
                item.id === "steamcmd" && (props.steamCmdNeedsSetup || props.steamCmdBusy) ? (
                  <Badge size="xs" color="yellow" variant="light">
                    {props.steamCmdBusy ? "Working" : "Needs setup"}
                  </Badge>
                ) : undefined
              }
              className={classes.navLink}
              onClick={() => props.onChange(item.id)}
            />
          );
        })}
      </Stack>
    </nav>
  );
}
