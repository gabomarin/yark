import { Button, Radio } from "@mantine/core";
import { useState, type ReactElement } from "react";
import { canKeepConflictSide, type ConflictKeepSide, type IniConflictOccurrence } from "@shared/ini/ini-conflict";
import { AppPanelModal } from "@ui/AppPanelModal/AppPanelModal";
import type { ConflictChoice } from "./configurationEditorConflict";
import {
  conflictFileLabel,
  conflictHeading,
  conflictKeepName,
  conflictReviewNeedsModal,
  conflictRowKey,
  conflictValueText,
  defaultConflictSide,
} from "./iniConflictReviewModel";
import classes from "./IniConflictReview.module.css";

interface Props {
  conflicts: readonly IniConflictOccurrence[];
  busy: boolean;
  onAccept: (choices: readonly ConflictChoice[]) => void;
}

function ValueText(props: { value: string | null }): ReactElement {
  const shown = conflictValueText(props.value);
  return (
    <code className={`${classes.value} ${shown.kind === "value" ? "" : classes[shown.kind]}`.trim()}>{shown.text}</code>
  );
}

function initialSides(conflicts: readonly IniConflictOccurrence[]): Record<string, ConflictKeepSide> {
  const sides: Record<string, ConflictKeepSide> = {};
  for (const conflict of conflicts) sides[conflictRowKey(conflict)] = defaultConflictSide(conflict);
  return sides;
}

function ConflictTable(
  props: Props & { sides: Record<string, ConflictKeepSide>; onSide: (key: string, side: ConflictKeepSide) => void },
): ReactElement {
  return (
    <table className={classes.table}>
      <thead>
        <tr className={classes.headRow}>
          <th className={classes.settingHead} scope="col">
            Setting
          </th>
          <th className={classes.valueHead} scope="col">
            Last save
          </th>
          <th className={classes.valueHead} scope="col">
            <span className={classes.headLabel}>
              Your edit
              <span className={classes.delta}>Changed in YARK</span>
            </span>
          </th>
          <th className={classes.valueHead} scope="col">
            <span className={classes.headLabel}>
              On disk
              <span className={classes.delta}>Changed in the file</span>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.conflicts.map((conflict) => {
          const key = conflictRowKey(conflict);
          const side = props.sides[key] ?? defaultConflictSide(conflict);
          const option = (keep: ConflictKeepSide, value: string | null): ReactElement => (
            <td>
              <div className={classes.cell} data-conflict-side={keep}>
                <ValueText value={value} />
                <Radio
                  name={key}
                  size="xs"
                  value={keep}
                  checked={side === keep}
                  aria-label={conflictKeepName(keep, value)}
                  disabled={props.busy || !canKeepConflictSide(conflict, keep)}
                  onChange={() => {
                    props.onSide(key, keep);
                  }}
                />
              </div>
            </td>
          );
          return (
            <tr key={key}>
              <th scope="row">
                <div className={classes.setting}>
                  <span className={classes.key}>{conflictHeading(conflict)}</span>
                  <span className={classes.meta}>
                    {conflictFileLabel(conflict.fileKey)} · {conflict.section}
                  </span>
                </div>
              </th>
              {option("saved", conflict.loaded)}
              {option("yark", conflict.local)}
              {option("file", conflict.disk)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ReviewBody(props: Props): ReactElement {
  const [sides, setSides] = useState(() => initialSides(props.conflicts));
  return (
    <div className={classes.review}>
      <ConflictTable
        {...props}
        sides={sides}
        onSide={(key, side) => {
          setSides((prev) => ({ ...prev, [key]: side }));
        }}
      />
      <Button
        size="xs"
        disabled={props.busy}
        loading={props.busy}
        onClick={() => {
          props.onAccept(
            props.conflicts.map((conflict) => ({
              conflict,
              side: sides[conflictRowKey(conflict)] ?? defaultConflictSide(conflict),
            })),
          );
        }}
      >
        Accept
      </Button>
    </div>
  );
}

export function IniConflictReview(props: Props): ReactElement {
  const [opened, setOpened] = useState(false);
  if (!conflictReviewNeedsModal(props.conflicts)) {
    return (
      <div data-ini-conflict-review>
        <ReviewBody {...props} />
      </div>
    );
  }
  return (
    <div data-ini-conflict-review>
      <Button
        variant="default"
        size="compact-xs"
        onClick={() => {
          setOpened(true);
        }}
      >
        Review conflicts
      </Button>
      <AppPanelModal opened={opened} onClose={() => setOpened(false)} title="INI conflict" size="lg">
        <ReviewBody {...props} />
      </AppPanelModal>
    </div>
  );
}
