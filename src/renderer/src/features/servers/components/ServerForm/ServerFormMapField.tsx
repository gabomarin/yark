import type { ReactElement } from "react";
import { Select, Stack, TextInput } from "@mantine/core";
import { isOfficialMap } from "@shared/map-identity";
import { KNOWN_MAPS } from "@shared/types";

/** Sentinel Select value for a free-form ASA launch map token (#65 / #191). */
export const CUSTOM_MAP_SELECT_VALUE = "__yark_custom_map__";

interface Props {
  map: string;
  inputSize: "xs" | "sm";
  onMapChange: (map: string) => void;
}

export function ServerFormMapField(props: Props): ReactElement {
  const official = isOfficialMap(props.map);
  const selectValue = official ? props.map : CUSTOM_MAP_SELECT_VALUE;
  const customToken = official ? "" : props.map;

  return (
    <Stack gap="xs">
      <Select
        label="Map"
        size={props.inputSize}
        value={selectValue}
        onChange={(value) => {
          if (value === null) {
            return;
          }
          if (value === CUSTOM_MAP_SELECT_VALUE) {
            if (official) {
              props.onMapChange("");
            }
            return;
          }
          props.onMapChange(value);
        }}
        data={[
          ...KNOWN_MAPS.map((id) => ({ value: id, label: id })),
          { value: CUSTOM_MAP_SELECT_VALUE, label: "Custom…" },
        ]}
        searchable
        allowDeselect={false}
        required
      />
      {!official && (
        <TextInput
          label="Custom map name"
          size={props.inputSize}
          value={customToken}
          onChange={(e) => props.onMapChange(e.currentTarget.value)}
          placeholder="e.g. Svartalfheim_WP"
          description="ASA launch map token from the mod author (usually ends in _WP). Add the map’s CurseForge Project ID on the Mods tab."
          required
        />
      )}
    </Stack>
  );
}
