import type { ReactElement } from "react";
import { Dna, ListBullets, Package } from "@phosphor-icons/react";
import { SegmentedControl } from "@mantine/core";
import { compactLabeledSegmentLabel, compactLabeledSegmentedRootClass } from "@ui/CompactSegmented/CompactSegmented";
import classes from "./ConfigurationEditor.module.css";

interface GameViewProps {
  value: "settings" | "engrams" | "loot";
  settingsUnsaved: boolean;
  engramsUnsaved: boolean;
  lootUnsaved: boolean;
  onChange: (value: "settings" | "engrams" | "loot") => void;
}

/** Settings | Engrams | Loot. The open side does not show the unsaved dot. */
export function GameIniViewSwitch(props: GameViewProps): ReactElement {
  return (
    <div className={classes.gameViewRow} data-game-ini-view>
      <SegmentedControl
        size="xs"
        aria-label="Game.ini view"
        value={props.value}
        className={compactLabeledSegmentedRootClass}
        data={[
          {
            value: "settings",
            label: compactLabeledSegmentLabel(
              "Settings",
              <ListBullets size={14} aria-hidden="true" />,
              props.value !== "settings" && props.settingsUnsaved,
            ),
          },
          {
            value: "engrams",
            label: compactLabeledSegmentLabel(
              "Engrams",
              <Dna size={14} aria-hidden="true" />,
              props.value !== "engrams" && props.engramsUnsaved,
            ),
          },
          {
            value: "loot",
            label: compactLabeledSegmentLabel(
              "Loot",
              <Package size={14} aria-hidden="true" />,
              props.value !== "loot" && props.lootUnsaved,
            ),
          },
        ]}
        onChange={(value) => props.onChange(value === "engrams" || value === "loot" ? value : "settings")}
      />
    </div>
  );
}

interface EngramPaneProps {
  value: "overrides" | "points";
  overridesUnsaved: boolean;
  pointsUnsaved: boolean;
  onChange: (value: "overrides" | "points") => void;
}

/** Overrides | Points per level. The open side does not show the unsaved dot. */
export function EngramPaneSwitch(props: EngramPaneProps): ReactElement {
  return (
    <SegmentedControl
      size="xs"
      aria-label="Engram editor"
      value={props.value}
      className={compactLabeledSegmentedRootClass}
      data={[
        {
          value: "overrides",
          label: compactLabeledSegmentLabel("Overrides", null, props.value !== "overrides" && props.overridesUnsaved),
        },
        {
          value: "points",
          label: compactLabeledSegmentLabel("Points per level", null, props.value !== "points" && props.pointsUnsaved),
        },
      ]}
      onChange={(value) => props.onChange(value === "points" ? "points" : "overrides")}
    />
  );
}

interface LootPaneProps {
  value: "crates" | "simulator";
  onChange: (value: "crates" | "simulator") => void;
}

/** Crates | Simulator. */
export function LootPaneSwitch(props: LootPaneProps): ReactElement {
  return (
    <SegmentedControl
      size="xs"
      aria-label="Loot editor"
      value={props.value}
      w="fit-content"
      className={compactLabeledSegmentedRootClass}
      data={[
        { value: "crates", label: "Crates" },
        { value: "simulator", label: "Simulator" },
      ]}
      onChange={(value) => props.onChange(value === "simulator" ? "simulator" : "crates")}
    />
  );
}
