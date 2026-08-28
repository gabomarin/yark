import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { Stack, TextInput } from "@mantine/core";
import { isBareOfficialMap } from "@shared/map-identity";
import { MAP_NAME_COPY } from "@shared/map-name-copy";
import { mapSaveFolderDescriptionStyles } from "@ui/mapFieldStyles";
import {
  isMapModCandidate,
  suggestMapTokenFromMetadata,
} from "@shared/map-token-suggest";
import { KNOWN_MAP_OPTIONS, type ModMetadata } from "@shared/types";
import type { MapsSearchApplyPayload } from "./mapsSearchModel";
import { ServerFormMapsSearchModal } from "./ServerFormMapsSearchModal";
import { ServerFormMapPicker } from "./ServerFormMapPicker";
import {
  CUSTOM_MAP_SELECT_VALUE,
  mapModSelectValue,
  parseMapModSelectValue,
} from "./mapFieldValues";

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
  /** Create has no Mods tab yet — copy must not pretend map mods are pickable. */
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

function officialLabel(mapToken: string): string | null {
  return KNOWN_MAP_OPTIONS.find((entry) => entry.id === mapToken)?.label ?? null;
}

export function ServerFormMapField(props: Props): ReactElement {
  const [enrichedMods, setEnrichedMods] = useState(props.mapMods);
  const [mapsSearchOpen, setMapsSearchOpen] = useState(false);
  const modsFingerprint = mapModsFingerprint(props.mapMods);
  const isCreate = props.isCreate === true;
  const allowCustom = !isCreate;

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

  const orphanLinkedMod = useMemo(() => {
    if (
      !props.mapModId
      || props.map.trim().length === 0
      || linkedWithToken !== undefined
    ) {
      return null;
    }
    return { id: props.mapModId, label: props.map };
  }, [linkedWithToken, props.map, props.mapModId]);

  const trigger = useMemo(() => {
    if (bareOfficial) {
      return {
        title: officialLabel(props.map) ?? props.map,
        badge: "Official",
        subtitle: props.map,
      };
    }
    if (linkedWithToken !== undefined) {
      return {
        title: linkedWithToken.mod.name,
        badge: "Mod Map",
        subtitle: linkedWithToken.token,
      };
    }
    if (orphanLinkedMod !== null) {
      return {
        title: orphanLinkedMod.label,
        badge: "Mod Map",
        subtitle: orphanLinkedMod.id,
      };
    }
    const token = props.map.trim();
    return {
      title: token.length > 0 ? token : "Custom…",
      badge: "Custom",
      subtitle: token.length > 0 ? MAP_NAME_COPY.customLabel : "Enter Map Name below",
    };
  }, [bareOfficial, linkedWithToken, orphanLinkedMod, props.map]);

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

  const onPick = (value: string) => {
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
  };

  return (
    <Stack gap="xs">
      <ServerFormMapPicker
        inputSize={props.inputSize}
        selectValue={selectValue}
        allowCustom={allowCustom}
        isCreate={isCreate}
        mapModsWithToken={mapModsWithToken}
        orphanLinkedMod={orphanLinkedMod}
        trigger={trigger}
        onPick={onPick}
        onOpenSearchMaps={() => setMapsSearchOpen(true)}
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
          description={`${MAP_NAME_COPY.mapNameFormatHint} ${MAP_NAME_COPY.customWhenNotInferredHint}`}
          required
        />
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
