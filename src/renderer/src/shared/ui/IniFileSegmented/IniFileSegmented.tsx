import type { ReactElement } from "react";
import { GearSix, SlidersHorizontal } from "@phosphor-icons/react";
import { SegmentedControl, type SegmentedControlProps } from "@mantine/core";
import type { IniFileKey } from "@shared/types";
import {
  compactIconSegmentLabel,
  compactSegmentedRootClass,
} from "@ui/CompactSegmented/CompactSegmented";

const INI_FILE_OPTIONS = [
  {
    value: "gameUserSettings",
    label: compactIconSegmentLabel(
      "GameUserSettings.ini",
      "GameUserSettings.ini",
      <SlidersHorizontal size={14} aria-hidden="true" />,
    ),
  },
  {
    value: "game",
    label: compactIconSegmentLabel(
      "Game.ini",
      "Game.ini",
      <GearSix size={14} aria-hidden="true" />,
    ),
  },
] as const satisfies Array<{ label: ReactElement; value: IniFileKey }>;

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
      data={[...INI_FILE_OPTIONS]}
      className={compactSegmentedRootClass}
      onChange={(value) => {
        if (value === "game" || value === "gameUserSettings") {
          props.onChange(value);
        }
      }}
    />
  );
}
