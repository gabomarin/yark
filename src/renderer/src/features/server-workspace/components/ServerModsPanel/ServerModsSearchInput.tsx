import type { ReactElement } from "react";
import { Button, Group } from "@mantine/core";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useUiDensity } from "@app/AppProviders";
import { SearchField, searchFieldIconSize } from "@ui/SearchField/SearchField";
import classes from "./ServerModsPanel.module.css";

interface Props {
  value: string;
  searching: boolean;
  onChange: (value: string) => void;
  onSearch: () => void;
}

export function ServerModsSearchInput(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "sm" : "md";
  const iconSize = searchFieldIconSize(size);

  return (
    <Group align="flex-end" wrap="wrap">
      <SearchField
        fieldLabel="Search CurseForge"
        placeholder="spyglass, structures, creatures…"
        value={props.value}
        size={size}
        className={classes.search}
        onChange={props.onChange}
        onKeyDown={(event) => {
          if (event.key === "Enter") props.onSearch();
        }}
      />
      <Button
        size={size}
        leftSection={<MagnifyingGlass size={iconSize} />}
        loading={props.searching}
        onClick={props.onSearch}
      >
        Search mods
      </Button>
    </Group>
  );
}
