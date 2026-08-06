import type { ReactElement } from "react";
import { SegmentedControl } from "@mantine/core";
import type { IniFileKey } from "@shared/types";

const INI_FILE_OPTIONS: Array<{ label: string; value: IniFileKey }> = [
  { label: "GameUserSettings.ini", value: "gameUserSettings" },
  { label: "Game.ini", value: "game" },
];

interface Props {
  value: IniFileKey;
  onChange: (value: IniFileKey) => void;
  size?: "xs" | "sm" | "md";
  disabled?: boolean;
}

/** Shared GameUserSettings.ini / Game.ini file switch for INI editors. */
export function IniFileSegmented(props: Props): ReactElement {
  return (
    <SegmentedControl
      size={props.size ?? "xs"}
      aria-label="INI file"
      value={props.value}
      disabled={props.disabled}
      data={INI_FILE_OPTIONS}
      onChange={(value) => {
        if (value === "game" || value === "gameUserSettings") {
          props.onChange(value);
        }
      }}
    />
  );
}
