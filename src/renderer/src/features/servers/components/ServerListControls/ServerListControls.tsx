import type { ReactElement } from "react";
import {
  CaretDown,
  Check,
  List,
  ListNumbers,
  SortAscending,
  TreeStructure,
} from "@phosphor-icons/react";
import { Button, Menu, SegmentedControl, Text } from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
import {
  compactIconSegmentLabel,
  compactSegmentedRootClass,
} from "@ui/CompactSegmented/CompactSegmented";
import {
  sortControlLabel,
  sortMenuOptionLabel,
  type ServerListSortMode,
  type ServerListViewMode,
} from "../../serverListModel";
import classes from "./ServerListControls.module.css";

interface Props {
  sort: ServerListSortMode;
  onSortChange: (sort: ServerListSortMode) => void;
  view: ServerListViewMode;
  onViewChange: (view: ServerListViewMode) => void;
}

const viewData = [
  {
    value: "ungrouped",
    label: compactIconSegmentLabel(
      "All servers",
      "All servers",
      <List size={14} aria-hidden="true" />,
    ),
  },
  {
    value: "grouped",
    label: compactIconSegmentLabel(
      "By cluster",
      "By cluster",
      <TreeStructure size={14} aria-hidden="true" />,
    ),
  },
];

export function ServerListControls(props: Props): ReactElement {
  const density = useUiDensity();
  const compact = density === "compact";
  const controlSize = compact ? "xs" : "sm";
  const iconSize = compact ? 14 : 16;

  const sortIcon =
    props.sort === "created" ? (
      <ListNumbers size={iconSize} aria-hidden="true" />
    ) : (
      <SortAscending size={iconSize} aria-hidden="true" />
    );

  return (
    <div className={classes.root} data-server-list-controls>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <Button
            variant="default"
            size={controlSize}
            aria-label="Sort servers"
            data-server-list-sort={props.sort}
            leftSection={sortIcon}
            rightSection={<CaretDown size={14} aria-hidden="true" />}
          >
            {sortControlLabel(props.sort)}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={
              <span className={classes.menuCheckSlot}>
                {props.sort === "created" ? <Check size={14} aria-hidden="true" /> : null}
              </span>
            }
            onClick={() => props.onSortChange("created")}
          >
            <span className={classes.menuItemBody}>
              <Text size="sm" fw={600}>
                {sortMenuOptionLabel("created")}
              </Text>
              <Text size="xs" className={classes.menuItemHint}>
                First profile you added in YARK appears first.
              </Text>
            </span>
          </Menu.Item>
          <Menu.Item
            leftSection={
              <span className={classes.menuCheckSlot}>
                {props.sort === "name" ? <Check size={14} aria-hidden="true" /> : null}
              </span>
            }
            onClick={() => props.onSortChange("name")}
          >
            <span className={classes.menuItemBody}>
              <Text size="sm" fw={600}>
                {sortMenuOptionLabel("name")}
              </Text>
              <Text size="xs" className={classes.menuItemHint}>
                By server name.
              </Text>
            </span>
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <SegmentedControl
        size="xs"
        value={props.view}
        aria-label="Server list layout"
        data-server-list-view={props.view}
        className={compactSegmentedRootClass}
        data={viewData}
        onChange={(value) => {
          if (value === "ungrouped" || value === "grouped") {
            props.onViewChange(value);
          }
        }}
      />
    </div>
  );
}
