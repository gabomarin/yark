import type { ReactElement } from "react";
import { Group, Select } from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
import { SearchField } from "@ui/SearchField/SearchField";
import classes from "./ServerModsPanel.module.css";

interface Props {
  query: string;
  searching: boolean;
  categoryValue: string;
  categoryOptions: Array<{ value: string; label: string }>;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onCategoryChange: (value: string) => void;
}

/**
 * Discover toolbar: submit SearchField + category (#297).
 * Catalog sort is column headers on the table (CurseForge-wide).
 */
export function ServerModsDiscoverToolbar(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "xs" : "sm";

  return (
    <Group align="flex-end" wrap="wrap" gap="sm">
      <SearchField
        fieldLabel="Search"
        placeholder="spyglass, structures, creatures…"
        value={props.query}
        size={size}
        className={classes.discoverSearch}
        onChange={props.onQueryChange}
        onSubmit={props.onSearch}
        submitting={props.searching}
        submitLabel="Search mods"
      />
      <Select
        label="Category"
        size={size}
        w={200}
        value={props.categoryValue}
        data={props.categoryOptions}
        allowDeselect={false}
        searchable={props.categoryOptions.length > 8}
        nothingFoundMessage="No categories"
        scrollAreaProps={{ type: "auto", offsetScrollbars: false }}
        onChange={(value) => {
          if (value !== null) props.onCategoryChange(value);
        }}
      />
    </Group>
  );
}
