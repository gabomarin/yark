import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Button, ColorInput, Group, Slider, Stack, Switch, Text } from "@mantine/core";
import {
  applyPalettePreview,
  applyShellArt,
  clearPalettePreview,
  DEFAULT_PALETTE_DARKNESS,
  DEFAULT_PALETTE_INTENSITY,
  PALETTE_SWATCHES,
  readStoredPaletteColor,
  readStoredPaletteDarkness,
  readStoredPaletteIntensity,
  readStoredShellArtVisible,
  writeStoredPaletteColor,
  writeStoredPaletteDarkness,
  writeStoredPaletteIntensity,
  writeStoredShellArtVisible,
} from "./palettePreviewModel";

/**
 * TEMP (PUX-004) — palette preview control.
 *
 * Sidebar-only experiment: pick any colour and the neutral ramp + canvas are
 * generated from it, with a darkness slider over the whole ramp, so an operator
 * can judge the shell surface under another palette. Delete this component with
 * `palettePreviewModel.ts` once the palette is decided.
 */
export function PalettePreviewSwitcher(): ReactElement {
  const [color, setColor] = useState<string | null>(() => readStoredPaletteColor());
  const [darkness, setDarkness] = useState<number>(() => readStoredPaletteDarkness());
  const [intensity, setIntensity] = useState<number>(() => readStoredPaletteIntensity());
  const [shellArt, setShellArt] = useState<boolean>(() => readStoredShellArtVisible());

  useEffect(() => {
    applyPalettePreview(color, darkness, intensity);
  }, [color, darkness, intensity]);

  useEffect(() => {
    applyShellArt(shellArt);
  }, [shellArt]);

  return (
    <Stack gap={4} data-palette-preview>
      <Switch
        size="xs"
        label="Brand art"
        checked={shellArt}
        onChange={(event) => {
          const next = event.currentTarget.checked;
          setShellArt(next);
          writeStoredShellArtVisible(next);
        }}
      />
      <Group gap={4} wrap="nowrap" align="flex-end">
        <ColorInput
          size="xs"
          label="Palette (temp)"
          format="hex"
          value={color ?? ""}
          onChange={(next) => {
            const value = next === "" ? null : next;
            setColor(value);
            writeStoredPaletteColor(value);
          }}
          swatches={[...PALETTE_SWATCHES]}
          withPicker
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          variant="subtle"
          color="gray"
          disabled={color === null}
          onClick={() => {
            clearPalettePreview();
            setColor(null);
            writeStoredPaletteColor(null);
          }}
          aria-label="Reset palette to the default"
        >
          Reset
        </Button>
      </Group>
      <Text size="9px" c="dimmed" tt="uppercase" lts="0.06em">
        Darkness
      </Text>
      <Slider
        size="xs"
        min={0}
        max={1}
        step={0.05}
        value={darkness}
        disabled={color === null}
        aria-label="Palette darkness"
        label={(value) => value.toFixed(2)}
        onChange={(value) => {
          setDarkness(value);
          writeStoredPaletteDarkness(value);
        }}
        marks={[{ value: DEFAULT_PALETTE_DARKNESS }]}
      />
      <Text size="9px" c="dimmed" tt="uppercase" lts="0.06em">
        Intensity
      </Text>
      <Slider
        size="xs"
        min={0}
        max={1}
        step={0.05}
        value={intensity}
        disabled={color === null}
        aria-label="Palette intensity"
        label={(value) => value.toFixed(2)}
        onChange={(value) => {
          setIntensity(value);
          writeStoredPaletteIntensity(value);
        }}
        marks={[{ value: DEFAULT_PALETTE_INTENSITY }]}
      />
    </Stack>
  );
}
