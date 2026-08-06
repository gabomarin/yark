import type { ReactElement } from "react";
import { SegmentedControl, type SegmentedControlProps } from "@mantine/core";
import type { IniFileKey } from "@shared/types";
import chrome from "@ui/IniEditorChrome/IniEditorChrome.module.css";

const INI_FILE_OPTIONS: Array<{ label: string; value: IniFileKey }> = [
  { label: "GameUserSettings.ini", value: "gameUserSettings" },
  { label: "Game.ini", value: "game" },
];

/** Class names for Mantine SegmentedControl matching the INI mock chrome. */
export const iniSegmentedClassNames = {
  root: chrome.segmentedRoot,
  indicator: chrome.segmentedIndicator,
  label: chrome.segmentedLabel,
} as const;

interface Props {
  value: IniFileKey;
  onChange: (value: IniFileKey) => void;
  size?: SegmentedControlProps["size"];
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
      classNames={iniSegmentedClassNames}
      onChange={(value) => {
        if (value === "game" || value === "gameUserSettings") {
          props.onChange(value);
        }
      }}
    />
  );
}
