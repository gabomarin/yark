import type { ReactElement } from "react";
import { Menu } from "@mantine/core";
import {
  normalizeRowActionEntries,
  type RowActionEntry,
} from "./rowActionModel";

interface Props {
  entries: readonly RowActionEntry[];
}

/** Renders shared row actions inside a Mantine `Menu.Dropdown` (kebab or context). */
export function RowActionMenuItems(props: Props): ReactElement {
  const entries = normalizeRowActionEntries(props.entries);
  return (
    <>
      {entries.map((entry) => {
        if (entry.kind === "label") {
          return <Menu.Label key={entry.key}>{entry.label}</Menu.Label>;
        }
        if (entry.kind === "divider") {
          return <Menu.Divider key={entry.key} />;
        }
        return (
          <Menu.Item
            key={entry.key}
            leftSection={entry.icon}
            color={entry.color}
            disabled={entry.disabled}
            title={entry.title}
            onClick={entry.onClick}
          >
            {entry.label}
          </Menu.Item>
        );
      })}
    </>
  );
}
