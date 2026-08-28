import type { ReactElement } from "react";
import { useMemo } from "react";
import {
  Button,
  Combobox,
  InputBase,
  Input,
  Text,
  useCombobox,
} from "@mantine/core";
import { CaretDown, Check, HardDrives, MagnifyingGlass } from "@phosphor-icons/react";
import { MAP_NAME_COPY } from "@shared/map-name-copy";
import { KNOWN_MAP_OPTIONS, type ModMetadata } from "@shared/types";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import { resolveMapArtUrl } from "@ui/MapArtThumb/mapArt";
import { SEARCH_MAPS_SELECT_VALUE } from "./mapsSearchModel";
import {
  CUSTOM_MAP_SELECT_VALUE,
  mapModSelectValue,
} from "./mapFieldValues";
import classes from "./ServerFormMapPicker.module.css";

export interface MapPickerModRow {
  mod: ModMetadata;
  token: string;
}

interface Props {
  inputSize: "xs" | "sm";
  selectValue: string;
  allowCustom: boolean;
  isCreate: boolean;
  mapModsWithToken: MapPickerModRow[];
  /** Linked map mod with no inferred token — still show in Mod Maps. */
  orphanLinkedMod: { id: string; label: string } | null;
  trigger: {
    title: string;
    badge: string;
    subtitle: string;
  };
  onPick: (value: string) => void;
  onOpenSearchMaps: () => void;
}

export function ServerFormMapPicker(props: Props): ReactElement {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const mapMods = useMemo(() => {
    const rows = [...props.mapModsWithToken];
    if (
      props.orphanLinkedMod
      && !rows.some((row) => row.mod.id === props.orphanLinkedMod!.id)
    ) {
      rows.push({
        mod: {
          id: props.orphanLinkedMod.id,
          name: props.orphanLinkedMod.label,
          summary: "",
          thumbnailUrl: null,
          authors: [],
          downloadCount: 0,
          dateModified: "",
          curseforgeUrl: "",
          slug: "",
          categories: ["Maps"],
        } satisfies ModMetadata,
        token: props.orphanLinkedMod.label,
      });
    }
    return rows;
  }, [props.mapModsWithToken, props.orphanLinkedMod]);

  const showMapModsSection = !props.isCreate;
  const customSelected = props.selectValue === CUSTOM_MAP_SELECT_VALUE;

  return (
    <Input.Wrapper
      label="Map"
      required
      size={props.inputSize}
      description={
        props.isCreate ? MAP_NAME_COPY.searchMapsCreateHint : undefined
      }
    >
      <Combobox
        store={combobox}
        withinPortal
        hideDetached={false}
        floatingStrategy="fixed"
        width="target"
        position="bottom-start"
        offset={0}
        middlewares={{
          flip: false,
          shift: true,
          inline: false,
          size: {
            padding: 12,
            apply({ availableHeight, elements }) {
              Object.assign(elements.floating.style, {
                maxHeight: `${Math.max(180, Math.min(availableHeight, 520))}px`,
              });
            },
          },
        }}
        onOptionSubmit={(value) => {
          if (value === SEARCH_MAPS_SELECT_VALUE) {
            combobox.closeDropdown();
            props.onOpenSearchMaps();
            return;
          }
          props.onPick(value);
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target>
          <InputBase
            component="button"
            type="button"
            pointer
            size={props.inputSize}
            role="combobox"
            classNames={{ input: classes.triggerInput }}
            rightSection={<CaretDown size={14} weight="bold" aria-hidden />}
            rightSectionPointerEvents="none"
            onClick={() => combobox.toggleDropdown()}
            aria-label="Map"
          >
            <span className={classes.triggerInner}>
              <span className={classes.triggerCopy}>
                <span className={classes.triggerTitle}>{props.trigger.title}</span>
                <span className={classes.triggerMeta}>
                  {props.trigger.badge}
                  {props.trigger.subtitle.length > 0
                    ? ` · ${props.trigger.subtitle}`
                    : ""}
                </span>
              </span>
            </span>
          </InputBase>
        </Combobox.Target>

        <Combobox.Dropdown className={classes.dropdown}>
          <Text className={classes.sectionLabel} component="div">
            Official
          </Text>
          <div className={classes.officialGrid} role="presentation">
            {KNOWN_MAP_OPTIONS.map((entry) => {
              const art = resolveMapArtUrl(entry.id);
              const selected = props.selectValue === entry.id;
              return (
                <Combobox.Option
                  key={entry.id}
                  value={entry.id}
                  className={classes.officialOption}
                  data-selected={selected ? "true" : undefined}
                  aria-selected={selected}
                  aria-label={entry.label}
                >
                  {selected ? (
                    <span className={classes.selectedMark} aria-hidden>
                      <Check size={12} weight="bold" />
                    </span>
                  ) : null}
                  {art !== null ? (
                    <img
                      className={classes.officialArt}
                      src={art}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <span className={classes.officialArtFallback} aria-hidden>
                      <HardDrives size={18} weight="duotone" />
                    </span>
                  )}
                  <span className={classes.officialLabel}>{entry.label}</span>
                </Combobox.Option>
              );
            })}
          </div>

          {showMapModsSection ? (
            <>
              <Text className={classes.sectionLabel} component="div">
                Mod Maps
              </Text>
              {mapMods.length === 0 ? (
                <Text className={classes.emptyHint} component="div">
                  {MAP_NAME_COPY.modMapsEmptyPopover}
                </Text>
              ) : (
                <div className={classes.modList} role="presentation">
                  {mapMods.map(({ mod, token }) => {
                    const value = mapModSelectValue(mod.id);
                    const selected = props.selectValue === value;
                    return (
                      <Combobox.Option
                        key={mod.id}
                        value={value}
                        className={classes.modOption}
                        data-selected={selected ? "true" : undefined}
                        aria-selected={selected}
                        aria-label={mod.name}
                      >
                        <MapArtThumb
                          mapId={token}
                          mapModId={mod.id}
                          modThumbnailUrl={mod.thumbnailUrl}
                          size="sm"
                          shape="rounded"
                          decorative
                        />
                        <span className={classes.modCopy}>
                          <Text size="sm" fw={650} lineClamp={1}>
                            {mod.name}
                          </Text>
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {token}
                          </Text>
                        </span>
                        {selected ? (
                          <span className={classes.modSelectedMark} aria-hidden>
                            <Check size={16} weight="bold" />
                          </span>
                        ) : null}
                      </Combobox.Option>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}

          <div className={classes.footer}>
            <Button
              size={props.inputSize}
              leftSection={<MagnifyingGlass size={14} weight="bold" />}
              onClick={() => {
                combobox.closeDropdown();
                props.onOpenSearchMaps();
              }}
            >
              Search Maps…
            </Button>
            {props.allowCustom ? (
              <Button
                size={props.inputSize}
                variant={customSelected ? "light" : "default"}
                color={customSelected ? "blue" : undefined}
                className={customSelected ? classes.footerOptionSelected : undefined}
                onClick={() => {
                  props.onPick(CUSTOM_MAP_SELECT_VALUE);
                  combobox.closeDropdown();
                }}
              >
                Custom…
              </Button>
            ) : null}
          </div>
        </Combobox.Dropdown>
      </Combobox>
    </Input.Wrapper>
  );
}
