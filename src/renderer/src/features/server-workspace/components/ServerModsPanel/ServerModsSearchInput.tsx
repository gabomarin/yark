import type { ReactElement } from "react";
import { Button, Group, TextInput } from "@mantine/core";
import { MagnifyingGlass } from "@phosphor-icons/react";
import classes from "./ServerModsPanel.module.css";

interface Props {
  value: string;
  searching: boolean;
  onChange: (value: string) => void;
  onSearch: () => void;
}

export function ServerModsSearchInput(props: Props): ReactElement {
  return (
    <Group align="flex-end" wrap="wrap">
      <TextInput
        label="Search CurseForge"
        placeholder="spyglass, structures, creatures…"
        leftSection={<MagnifyingGlass size={16} />}
        value={props.value}
        className={classes.search}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") props.onSearch();
        }}
      />
      <Button
        leftSection={<MagnifyingGlass size={16} />}
        loading={props.searching}
        onClick={props.onSearch}
      >
        Search mods
      </Button>
    </Group>
  );
}
