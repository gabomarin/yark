import type { ReactElement } from "react";
import { GearSix, SlidersHorizontal } from "@phosphor-icons/react";
import { SegmentedControl, type SegmentedControlProps } from "@mantine/core";
import type { IniFileKey } from "@shared/types";
import { compactLabeledSegmentLabel, compactLabeledSegmentedRootClass } from "@ui/CompactSegmented/CompactSegmented";

interface Props {
  value: IniFileKey;
  onChange: (value: IniFileKey) => void;
  size?: SegmentedControlProps["size"];
  disabled?: boolean;
  /** Files that still have unsaved lines. The open file does not show the dot. */
  pending?: Partial<Record<IniFileKey, boolean>>;
}

/** Shared GameUserSettings.ini / Game.ini file switch for INI editors. */
export function IniFileSegmented(props: Props): ReactElement {
  const pending = props.pending;
  const data: Array<{ label: ReactElement; value: IniFileKey }> = [
    {
      value: "gameUserSettings",
      label: compactLabeledSegmentLabel(
        "GameUserSettings.ini",
        <SlidersHorizontal size={14} aria-hidden="true" />,
        pending?.gameUserSettings === true && props.value !== "gameUserSettings",
      ),
    },
    {
      value: "game",
      label: compactLabeledSegmentLabel(
        "Game.ini",
        <GearSix size={14} aria-hidden="true" />,
        pending?.game === true && props.value !== "game",
      ),
    },
  ];
  return (
    <SegmentedControl
      size={props.size ?? "xs"}
      aria-label="INI file"
      value={props.value}
      disabled={props.disabled}
      data={data}
      className={compactLabeledSegmentedRootClass}
      onChange={(value) => {
        if (value === "game" || value === "gameUserSettings") {
          props.onChange(value);
        }
      }}
    />
  );
}
