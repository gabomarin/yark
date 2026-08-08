import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { Select, Stack, TextInput } from "@mantine/core";
import { isOfficialMap } from "@shared/map-identity";
import {
  isMapModCandidate,
  suggestMapTokenFromMetadata,
} from "@shared/map-token-suggest";
import { KNOWN_MAP_OPTIONS, type ModMetadata } from "@shared/types";

/** Prebuilt Official Select rows (`value` = launch token, `label` = display name). */
const OFFICIAL_MAP_SELECT_ITEMS = KNOWN_MAP_OPTIONS.map((entry) => ({
  value: entry.id,
  label: entry.label,
}));

/** Sentinel Select value for a free-form ASA launch map token (#65 / #191). */
export const CUSTOM_MAP_SELECT_VALUE = "__yark_custom_map__";

/** Select value prefix for an enabled Maps-category mod (#192). */
export const MAP_MOD_SELECT_PREFIX = "mapmod:";

export function mapModSelectValue(modId: string): string {
  return `${MAP_MOD_SELECT_PREFIX}${modId}`;
}

export function parseMapModSelectValue(value: string): string | null {
  if (!value.startsWith(MAP_MOD_SELECT_PREFIX)) {
    return null;
  }
  const id = value.slice(MAP_MOD_SELECT_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

export interface MapFieldChange {
  map: string;
  mapModId: string | null;
}

interface Props {
  map: string;
  mapModId: string | null;
  inputSize: "xs" | "sm";
  /** Enabled Maps mods available as Map select options. */
  mapMods: ModMetadata[];
  onChange: (next: MapFieldChange) => void;
}

export function listEnabledMapMods(options: {
  mods: string[];
  disabledMods?: string[];
  modMetadataCache?: Record<string, ModMetadata>;
}): ModMetadata[] {
  const disabled = new Set(options.disabledMods ?? []);
  const cache = options.modMetadataCache ?? {};
  const rows: ModMetadata[] = [];
  for (const id of options.mods) {
    if (disabled.has(id)) continue;
    const meta = cache[id];
    if (meta === undefined || !isMapModCandidate(meta)) continue;
    rows.push(meta);
  }
  return rows;
}

async function enrichMapMod(mod: ModMetadata): Promise<ModMetadata> {
  if (suggestMapTokenFromMetadata(mod) !== null) {
    return mod;
  }
  const result = await window.api.getModByReference(mod.id);
  if (!result.ok) {
    return mod;
  }
  return result.data;
}

function mapModsFingerprint(mods: ModMetadata[]): string {
  return mods
    .map(
      (mod) =>
        `${mod.id}\0${mod.name}\0${mod.description?.length ?? 0}\0${mod.summary.length}`,
    )
    .join("|");
}

export function ServerFormMapField(props: Props): ReactElement {
  const [enrichedMods, setEnrichedMods] = useState(props.mapMods);
  const modsFingerprint = mapModsFingerprint(props.mapMods);

  useEffect(() => {
    let alive = true;
    if (props.mapMods.length === 0) {
      setEnrichedMods([]);
      return;
    }
    if (props.mapMods.every((mod) => suggestMapTokenFromMetadata(mod) !== null)) {
      setEnrichedMods(props.mapMods);
      return;
    }
    void Promise.all(props.mapMods.map((mod) => enrichMapMod(mod))).then((next) => {
      if (alive) {
        setEnrichedMods(next);
      }
    });
    return () => {
      alive = false;
    };
    // Fingerprint tracks id/name/description without new-array identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [modsFingerprint]);

  const official = isOfficialMap(props.map);
  const mapModsWithToken = useMemo(
    () =>
      enrichedMods.flatMap((mod) => {
        const token = suggestMapTokenFromMetadata(mod)?.token;
        if (token === undefined) {
          return [];
        }
        return [{ mod, token }];
      }),
    [enrichedMods],
  );

  const linkedWithToken = mapModsWithToken.find(
    (entry) => entry.mod.id === props.mapModId,
  );

  const selectValue = official
    ? props.map
    : linkedWithToken !== undefined
      ? mapModSelectValue(linkedWithToken.mod.id)
      : props.mapModId && props.mapModId.length > 0 && props.map.trim().length > 0
        ? mapModSelectValue(props.mapModId)
        : CUSTOM_MAP_SELECT_VALUE;

  const customSelected = selectValue === CUSTOM_MAP_SELECT_VALUE;

  const selectData = useMemo(() => {
    const mapModItems = mapModsWithToken.map(({ mod }) => ({
      value: mapModSelectValue(mod.id),
      label: mod.name,
    }));
    if (
      props.mapModId &&
      props.map.trim().length > 0 &&
      !mapModItems.some((item) => item.value === mapModSelectValue(props.mapModId!))
    ) {
      mapModItems.push({
        value: mapModSelectValue(props.mapModId),
        label: props.map,
      });
    }
    return [
      { group: "Official", items: OFFICIAL_MAP_SELECT_ITEMS },
      ...(mapModItems.length > 0
        ? [{ group: "Map mods", items: mapModItems }]
        : []),
      {
        group: "Other",
        items: [{ value: CUSTOM_MAP_SELECT_VALUE, label: "Custom…" }],
      },
    ];
  }, [mapModsWithToken, props.map, props.mapModId]);

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
            props.onChange({
              map: official ? "" : props.map,
              mapModId: null,
            });
            return;
          }
          const modId = parseMapModSelectValue(value);
          if (modId !== null) {
            const match = mapModsWithToken.find((entry) => entry.mod.id === modId);
            if (match !== undefined) {
              props.onChange({ map: match.token, mapModId: modId });
              return;
            }
            if (props.mapModId === modId && props.map.trim().length > 0) {
              props.onChange({ map: props.map, mapModId: modId });
            }
            return;
          }
          props.onChange({ map: value, mapModId: null });
        }}
        data={selectData}
        searchable
        allowDeselect={false}
        required
      />
      {customSelected ? (
        <TextInput
          label="Custom map name"
          size={props.inputSize}
          value={props.map}
          onChange={(e) =>
            props.onChange({
              map: e.currentTarget.value,
              mapModId: null,
            })
          }
          placeholder="e.g. Svartalfheim_WP"
          description="Usually ends in _WP. Prefer a Map mods option when the pack is enabled on the Mods tab."
          required
        />
      ) : null}
    </Stack>
  );
}
