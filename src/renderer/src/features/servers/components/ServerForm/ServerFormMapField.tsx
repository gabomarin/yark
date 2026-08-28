import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { Alert, Select, Stack, TextInput } from "@mantine/core";
import { isBareOfficialMap } from "@shared/map-identity";
import { MAP_NAME_COPY } from "@shared/map-name-copy";
import { mapSaveFolderDescriptionStyles } from "@ui/mapFieldStyles";
import {
  isMapModCandidate,
  suggestMapTokenFromMetadata,
} from "@shared/map-token-suggest";
import { KNOWN_MAP_OPTIONS, type ModMetadata } from "@shared/types";
import {
  SEARCH_MAPS_SELECT_VALUE,
  type MapsSearchApplyPayload,
} from "./mapsSearchModel";
import { ServerFormMapsSearchModal } from "./ServerFormMapsSearchModal";

/** Prebuilt Official Select rows (`value` = launch token, `label` = display name). */
const OFFICIAL_MAP_SELECT_ITEMS = KNOWN_MAP_OPTIONS.map((entry) => ({
  value: entry.id,
  label: entry.label,
}));

/** Sentinel Select value for a free-form ASA launch map token (#65 / #191). */
const CUSTOM_MAP_SELECT_VALUE = "__yark_custom_map__";

/** Select value prefix for an enabled Maps-category mod (#192). */
const MAP_MOD_SELECT_PREFIX = "mapmod:";

function mapModSelectValue(modId: string): string {
  return `${MAP_MOD_SELECT_PREFIX}${modId}`;
}

function parseMapModSelectValue(value: string): string | null {
  if (!value.startsWith(MAP_MOD_SELECT_PREFIX)) {
    return null;
  }
  const id = value.slice(MAP_MOD_SELECT_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

export interface MapFieldChange {
  map: string;
  mapModId: string | null;
  /** Relative SavedArks folder; only meaningful for custom maps. */
  mapSaveFolder: string | null;
}

interface Props {
  map: string;
  mapModId: string | null;
  mapSaveFolder: string | null;
  inputSize: "xs" | "sm";
  /** Enabled Maps mods available as Map select options. */
  mapMods: ModMetadata[];
  /** Create has no Mods tab yet — copy must not pretend map packs are pickable. */
  isCreate?: boolean;
  onChange: (next: MapFieldChange) => void;
  onMapsSearchApply: (payload: MapsSearchApplyPayload) => void;
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

/** Stable key for enrich effect — includes text so same-length edits still refresh. */
function mapModsFingerprint(mods: ModMetadata[]): string {
  return mods
    .map(
      (mod) =>
        `${mod.id}\0${mod.name}\0${mod.summary}\0${mod.description ?? ""}\0${suggestMapTokenFromMetadata(mod)?.token ?? ""}`,
    )
    .join("|");
}

export function ServerFormMapField(props: Props): ReactElement {
  const [enrichedMods, setEnrichedMods] = useState(props.mapMods);
  const [mapsSearchOpen, setMapsSearchOpen] = useState(false);
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

  const bareOfficial = isBareOfficialMap({
    map: props.map,
    mapModId: props.mapModId,
  });
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

  const selectValue = bareOfficial
    ? props.map
    : linkedWithToken !== undefined
      ? mapModSelectValue(linkedWithToken.mod.id)
      : props.mapModId && props.mapModId.length > 0 && props.map.trim().length > 0
        ? mapModSelectValue(props.mapModId)
        : CUSTOM_MAP_SELECT_VALUE;

  const customSelected = selectValue === CUSTOM_MAP_SELECT_VALUE;

  const allowCustom = props.isCreate !== true;

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
        group: "CurseForge",
        items: [{ value: SEARCH_MAPS_SELECT_VALUE, label: "Search Maps…" }],
      },
      ...(allowCustom
        ? [
            {
              group: "Other",
              items: [{ value: CUSTOM_MAP_SELECT_VALUE, label: "Custom…" }],
            },
          ]
        : []),
    ];
  }, [allowCustom, mapModsWithToken, props.map, props.mapModId]);

  const showSaveFolder = !bareOfficial && props.map.trim().length > 0;

  const emit = (next: { map: string; mapModId: string | null }) => {
    const nextBareOfficial = isBareOfficialMap({
      map: next.map,
      mapModId: next.mapModId,
    });
    const sameCustomMap =
      !nextBareOfficial
      && next.map.trim().toLowerCase() === props.map.trim().toLowerCase();
    props.onChange({
      map: next.map,
      mapModId: next.mapModId,
      mapSaveFolder: sameCustomMap ? props.mapSaveFolder : null,
    });
  };

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
          if (value === SEARCH_MAPS_SELECT_VALUE) {
            setMapsSearchOpen(true);
            return;
          }
          if (value === CUSTOM_MAP_SELECT_VALUE) {
            if (!allowCustom) {
              return;
            }
            emit({
              map: bareOfficial ? "" : props.map,
              mapModId: null,
            });
            return;
          }
          const modId = parseMapModSelectValue(value);
          if (modId !== null) {
            const match = mapModsWithToken.find((entry) => entry.mod.id === modId);
            if (match !== undefined) {
              emit({ map: match.token, mapModId: modId });
              return;
            }
            if (props.mapModId === modId && props.map.trim().length > 0) {
              emit({ map: props.map, mapModId: modId });
            }
            return;
          }
          emit({ map: value, mapModId: null });
        }}
        data={selectData}
        searchable
        allowDeselect={false}
        required
        description={
          props.isCreate === true ? MAP_NAME_COPY.searchMapsCreateHint : undefined
        }
      />
      {customSelected && allowCustom ? (
        <TextInput
          label={MAP_NAME_COPY.customLabel}
          size={props.inputSize}
          value={props.map}
          onChange={(e) =>
            emit({
              map: e.currentTarget.value,
              mapModId: null,
            })
          }
          placeholder="e.g. Svartalfheim_WP"
          description={
            props.mapMods.length === 0
              ? MAP_NAME_COPY.usuallyEndsWp
              : `${MAP_NAME_COPY.usuallyEndsWp} Prefer a Map mods option when the pack is enabled on the Mods tab.`
          }
          required
        />
      ) : null}
      {customSelected && allowCustom && props.mapMods.length === 0 ? (
        <Alert color="blue" variant="light" title="Map pack comes next">
          No Maps mods enabled yet. Add the CurseForge pack on Mods, then pick it
          here instead of Custom…. Start stays blocked until that pack is
          enabled and linked.
        </Alert>
      ) : null}
      {showSaveFolder ? (
        <TextInput
          label="World save folder"
          size={props.inputSize}
          value={props.mapSaveFolder ?? ""}
          onChange={(e) =>
            props.onChange({
              map: props.map,
              mapModId: props.mapModId,
              mapSaveFolder: e.currentTarget.value.trim().length > 0
                ? e.currentTarget.value.trim()
                : null,
            })
          }
          placeholder="e.g. Svartalfheim"
          description={MAP_NAME_COPY.saveFolderDiffers}
          styles={mapSaveFolderDescriptionStyles}
        />
      ) : null}
      <ServerFormMapsSearchModal
        opened={mapsSearchOpen}
        onClose={() => setMapsSearchOpen(false)}
        onApply={props.onMapsSearchApply}
      />
    </Stack>
  );
}
