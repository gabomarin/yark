import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, ColorInput, Group, Select, Slider, Stack, Text } from "@mantine/core";
import {
  applyPalettePreview,
  applyShellArt,
  applyIniChrome,
  DEFAULT_PALETTE_DARKNESS,
  DEFAULT_PALETTE_INTENSITY,
  INI_CHROME_OPTIONS,
  PALETTE_SWATCHES,
  PLATE_SWATCHES,
  SHELL_ART_OPTIONS,
  readStoredIniChrome,
  readStoredPaletteColor,
  readStoredPaletteDarkness,
  readStoredHairlineLift,
  readStoredPaletteIntensity,
  readStoredPanelLift,
  readStoredPlateColor,
  readStoredShellArt,
  writeStoredIniChrome,
  type IniChromeOption,
  applyPlateWarmth,
  applySurfacePreview,
  readStoredPlateWarmth,
  surfaceLiftBases,
  writeStoredPlateColor,
  writeStoredPlateWarmth,
  writeStoredPaletteColor,
  writeStoredPaletteDarkness,
  writeStoredHairlineLift,
  writeStoredPaletteIntensity,
  writeStoredPanelLift,
  writeStoredShellArt,
  type ShellArtOption,
} from "./palettePreviewModel";
import {
  ACCENT_SWATCHES,
  applyAccentPreview,
  readContrastRows,
  readStoredAccentColor,
  writeStoredAccentColor,
  type ContrastRow,
  type SurfaceTint,
} from "./paletteAccentPreviewModel";
import { PROPOSALS, SHIPPED_PROPOSAL, applyProposal, hasStoredProposal, type PaletteProposal } from "./paletteProposal";

/**
 * TEMP (PUX-004) — palette preview control.
 *
 * Sidebar-only experiment: pick any colour and the neutral ramp + canvas are
 * generated from it, with a darkness slider over the whole ramp; pick an accent
 * and the blue ramp + Mantine slots follow it. A live contrast readout shows the
 * ratios the choice has to satisfy. Delete this component with the two
 * `palettePreviewModel` files once the palette is decided.
 */

/** Readout tone for a sampled surface: neutral reads dimmed, past the chroma budget it warns. */
function tintColor(tint: SurfaceTint | null): string {
  if (tint === null) return "dimmed";
  if (tint.chroma > 0.035) return "red";
  if (tint.chroma > 0.02) return "attention";
  return "dimmed";
}

/** Readout tone for a contrast row: a documented gap never reads as a plain failure. */
function contrastColor(pass: boolean, knownGap: boolean | undefined): string {
  if (pass) return knownGap ? "dimmed" : "ok";
  return knownGap ? "attention" : "red";
}

/** Show the shipped palette until the operator touches a control. */
const USE_PROPOSAL_ON_LOAD = !hasStoredProposal();
const PROPOSAL = SHIPPED_PROPOSAL;
export function PalettePreviewSwitcher(): ReactElement {
  /* One function for every preset so a new proposal is one line in `PROPOSALS`. */
  const applyProposalToControls = (proposal: PaletteProposal): void => {
    applyProposal(proposal);
    setColor(proposal.surface);
    setDarkness(proposal.darkness);
    setIntensity(proposal.intensity);
    setPanelLift(proposal.panelLift);
    setHairlineLift(proposal.hairlineLift);
    setPlateWarmth(proposal.plateWarmth);
    setPlateColor(proposal.plateColor);
    setAccent(proposal.accent);
  };
  const [color, setColor] = useState<string | null>(
    () => readStoredPaletteColor() ?? (USE_PROPOSAL_ON_LOAD ? PROPOSAL.surface : null),
  );
  const [accent, setAccent] = useState<string | null>(
    () => readStoredAccentColor() ?? (USE_PROPOSAL_ON_LOAD ? PROPOSAL.accent : null),
  );
  const [darkness, setDarkness] = useState<number>(() =>
    USE_PROPOSAL_ON_LOAD ? PROPOSAL.darkness : readStoredPaletteDarkness(),
  );
  const [intensity, setIntensity] = useState<number>(() =>
    USE_PROPOSAL_ON_LOAD ? PROPOSAL.intensity : readStoredPaletteIntensity(),
  );
  const [shellArt, setShellArt] = useState<ShellArtOption>(() => readStoredShellArt());
  const [iniChrome, setIniChrome] = useState<IniChromeOption>(() => readStoredIniChrome());
  const [panelLift, setPanelLift] = useState<number>(() =>
    USE_PROPOSAL_ON_LOAD ? PROPOSAL.panelLift : readStoredPanelLift(),
  );
  const [hairlineLift, setHairlineLift] = useState<number>(() =>
    USE_PROPOSAL_ON_LOAD ? PROPOSAL.hairlineLift : readStoredHairlineLift(),
  );
  const [plateWarmth, setPlateWarmth] = useState<number>(() =>
    USE_PROPOSAL_ON_LOAD ? PROPOSAL.plateWarmth : readStoredPlateWarmth(),
  );
  const [plateColor, setPlateColor] = useState<string | null>(() =>
    USE_PROPOSAL_ON_LOAD ? PROPOSAL.plateColor : readStoredPlateColor(),
  );
  const [readout, setReadout] = useState<readonly ContrastRow[]>([]);
  const lastReadoutKey = useRef("");
  const [tint, setTint] = useState<SurfaceTint | null>(null);

  useEffect(() => {
    applyPalettePreview(color, darkness, intensity);
  }, [color, darkness, intensity]);

  useEffect(() => {
    applyAccentPreview(accent);
  }, [accent]);

  /* After the palette + accent effects: they own the rest of the ramp. */
  useEffect(() => {
    applyPlateWarmth(plateWarmth, color, darkness, intensity, plateColor);
    applySurfacePreview(
      panelLift,
      hairlineLift,
      color === null && plateColor === null
        ? null
        : surfaceLiftBases(color, darkness, intensity, plateWarmth, plateColor),
    );
  }, [panelLift, hairlineLift, plateWarmth, plateColor, color, darkness, intensity]);

  useEffect(() => {
    applyShellArt(shellArt);
  }, [shellArt]);

  useEffect(() => {
    applyIniChrome(iniChrome);
  }, [iniChrome]);

  /*
   * Poll instead of computing once: Mantine injects its CSS variables after the
   * first paint, so an early read resolves every role to the same fallback.
   */
  useEffect(() => {
    const read = (): void => {
      const report = readContrastRows();
      const key = JSON.stringify([report.rows, report.tint]);
      /* The poll exists because Mantine injects its variables after the first paint. Skip
       * state updates when nothing changed, or it re-renders the panel forever. */
      if (key === lastReadoutKey.current) return;
      lastReadoutKey.current = key;
      setReadout(report.rows);
      setTint(report.tint);
    };
    const timer = window.setInterval(read, 500);
    read();
    return () => window.clearInterval(timer);
  }, [color, accent, darkness, intensity]);

  return (
    <Stack gap={4} data-palette-preview>
      <Text size="9px" c="dimmed" tt="uppercase" lts="0.06em">
        Brand art (temp)
      </Text>
      {/* A select, not a segmented control: the motif list outgrew the sidebar width. */}
      <Select
        size="xs"
        data-shell-art-options
        value={shellArt}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
        onChange={(next) => {
          if (next === null) return;
          const option = next as ShellArtOption;
          setShellArt(option);
          writeStoredShellArt(option);
        }}
        data={SHELL_ART_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
      />
      <Text size="9px" c="dimmed" tt="uppercase" lts="0.06em">
        INI section headers (temp)
      </Text>
      {/* A/B for the INI editor band and its mod subheaders (`IniEditorChrome.module.css`). */}
      <Select
        size="xs"
        data-ini-chrome-options
        value={iniChrome}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
        onChange={(next) => {
          if (next === null) return;
          const option = next as IniChromeOption;
          setIniChrome(option);
          writeStoredIniChrome(option);
        }}
        data={INI_CHROME_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
      />
      <Group gap={4} wrap="nowrap" grow>
        {PROPOSALS.map((proposal) => (
          <Button
            key={proposal.key}
            size="xs"
            variant="default"
            px={6}
            data-palette-proposal={proposal.key}
            onClick={() => applyProposalToControls(proposal)}
          >
            {proposal.label}
          </Button>
        ))}
      </Group>
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
            applyProposalToControls(SHIPPED_PROPOSAL);
          }}
          aria-label="Restore the shipped appearance"
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
        thumbProps={{ "aria-label": "Palette darkness" }}
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
        thumbProps={{ "aria-label": "Palette intensity" }}
        label={(value) => value.toFixed(2)}
        onChange={(value) => {
          setIntensity(value);
          writeStoredPaletteIntensity(value);
        }}
        marks={[{ value: DEFAULT_PALETTE_INTENSITY }]}
      />

      <Text size="9px" c="dimmed" tt="uppercase" lts="0.06em">
        Plate warmth
      </Text>
      <Slider
        size="xs"
        min={0}
        max={1}
        step={0.05}
        value={plateWarmth}
        thumbProps={{ "aria-label": "Plate warmth" }}
        label={(value) => value.toFixed(2)}
        onChange={(value) => {
          setPlateWarmth(value);
          writeStoredPlateWarmth(value);
        }}
        marks={[{ value: 0 }]}
      />
      <Group gap={4} wrap="nowrap" align="flex-end">
        <ColorInput
          size="xs"
          label="Plate hue (temp)"
          format="hex"
          value={plateColor ?? ""}
          onChange={(next) => {
            const value = next === "" ? null : next;
            setPlateColor(value);
            writeStoredPlateColor(value);
          }}
          swatches={[...PLATE_SWATCHES]}
          withPicker
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          variant="subtle"
          color="gray"
          disabled={plateColor === null}
          onClick={() => {
            setPlateColor(null);
            writeStoredPlateColor(null);
          }}
          aria-label="Clear the plate colour"
        >
          Reset
        </Button>
      </Group>
      <Text size="9px" c="dimmed" tt="uppercase" lts="0.06em">
        Panel lift
      </Text>
      <Slider
        size="xs"
        min={0}
        max={0.3}
        step={0.01}
        value={panelLift}
        thumbProps={{ "aria-label": "Panel fill lift" }}
        label={(value) => value.toFixed(2)}
        onChange={(value) => {
          setPanelLift(value);
          writeStoredPanelLift(value);
        }}
        marks={[{ value: 0 }]}
      />
      <Text size="9px" c="dimmed" tt="uppercase" lts="0.06em">
        Hairline lift
      </Text>
      <Slider
        size="xs"
        min={0}
        max={0.3}
        step={0.01}
        value={hairlineLift}
        thumbProps={{ "aria-label": "Hairline lift" }}
        label={(value) => value.toFixed(2)}
        onChange={(value) => {
          setHairlineLift(value);
          writeStoredHairlineLift(value);
        }}
        marks={[{ value: 0 }]}
      />
      <Group gap={6} wrap="nowrap" justify="space-between" data-surface-tint>
        <Text size="10px" c="dimmed">
          Surface tint
        </Text>
        <Text size="10px" ff="monospace" c={tintColor(tint)}>
          {tint === null ? "-" : `${tint.chroma.toFixed(3)} · ${tint.hue}°`}
        </Text>
      </Group>
      <Group gap={4} wrap="nowrap" align="flex-end">
        <ColorInput
          size="xs"
          label="Accent (temp)"
          format="hex"
          value={accent ?? ""}
          onChange={(next) => {
            const value = next === "" ? null : next;
            setAccent(value);
            writeStoredAccentColor(value);
          }}
          swatches={[...ACCENT_SWATCHES]}
          withPicker
          style={{ flex: 1, minWidth: 0 }}
        />
      </Group>

      <Stack gap={0} data-contrast-readout>
        {readout.map((row) => {
          const pass = row.ratio >= row.min;
          return (
            <Group key={row.label} gap={6} wrap="nowrap" justify="space-between">
              <Text size="10px" c="dimmed" lineClamp={1}>
                {row.label}
              </Text>
              <Text size="10px" ff="monospace" c={contrastColor(pass, row.knownGap)}>
                {row.ratio.toFixed(2)}
                <Text span size="9px" c="dimmed">
                  /{row.min}
                </Text>
              </Text>
            </Group>
          );
        })}
      </Stack>
    </Stack>
  );
}
