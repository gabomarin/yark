import type { ReactElement } from "react";
import { SegmentedControl } from "@mantine/core";
import type { IniFileKey } from "@shared/types";
import { IniFileSegmented, iniSegmentedClassNames } from "@ui/IniFileSegmented/IniFileSegmented";
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
        data={props.modeOptions}
        classNames={iniSegmentedClassNames}
        onChange={props.onModeChange}
      />
    </div>
  );
}
