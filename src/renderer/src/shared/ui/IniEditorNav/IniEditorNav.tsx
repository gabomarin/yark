import type { ReactElement, ReactNode } from "react";
import { Code, SquaresFour } from "@phosphor-icons/react";
import { SegmentedControl } from "@mantine/core";
import type { IniFileKey } from "@shared/types";
import {
  compactIconSegmentLabel,
  compactSegmentedRootClass,
} from "@ui/CompactSegmented/CompactSegmented";
import { IniFileSegmented } from "@ui/IniFileSegmented/IniFileSegmented";
import chrome from "@ui/IniEditorChrome/IniEditorChrome.module.css";

interface ModeOption {
  label: string;
  value: string;
}

interface Props {
  file: IniFileKey;
  onFileChange: (value: IniFileKey) => void;
  mode: string;
  onModeChange: (value: string) => void;
  modeOptions: ModeOption[];
  modeAriaLabel?: string;
  disabled?: boolean;
}

function modeSegmentIcon(value: string): ReactNode {
  if (value === "visual") {
    return <SquaresFour size={14} aria-hidden="true" />;
  }
  return <Code size={14} aria-hidden="true" />;
}

function toModeSegmentData(options: ModeOption[]) {
  return options.map((option) => ({
    value: option.value,
    label: compactIconSegmentLabel(option.label, option.label, modeSegmentIcon(option.value)),
  }));
}

/**
 * Paired INI file + edit-mode switches kept on one non-wrapping row so they
 * stay aligned across viewport sizes (actions live outside this group).
 */
export function IniEditorNav(props: Props): ReactElement {
  return (
    <div className={chrome.nav} data-ini-editor-nav>
      <IniFileSegmented
        value={props.file}
        onChange={props.onFileChange}
        disabled={props.disabled}
      />
      <SegmentedControl
        size="xs"
        aria-label={props.modeAriaLabel ?? "INI edit mode"}
        value={props.mode}
        disabled={props.disabled}
        data={toModeSegmentData(props.modeOptions)}
        className={compactSegmentedRootClass}
        onChange={props.onModeChange}
      />
    </div>
  );
}
