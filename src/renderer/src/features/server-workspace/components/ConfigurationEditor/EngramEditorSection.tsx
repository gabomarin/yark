import type { ReactElement } from "react";
import { Stack } from "@mantine/core";
import { appendIniTextValue, removeIniTextValue } from "@shared/ini/ini-text";
import { withFileText } from "../../iniModel";
import {
  PLAYER_LEVEL_ENGRAM_POINTS_KEY,
  sectionForNewPlayerLevelEngramPoints,
} from "@shared/ini/player-level-engram-points";
import type { NamedEngramDraft, NamedEngramPendingAdd, NamedEngramRow } from "@shared/ini/engram-named-entries";
import type { ServerIniPayload } from "@shared/types";
import { EngramEditor } from "./EngramEditor";
import { EngramLevelPoints } from "./EngramLevelPoints";
import { EngramPaneSwitch } from "./IniScopeSwitch";
import classes from "./ConfigurationEditor.module.css";

interface Props {
  show: boolean;
  gameText: string;
  gameDraft: string;
  payload: ServerIniPayload | null;
  engramPane: "overrides" | "points";
  overridesUnsaved: boolean;
  pointsUnsaved: boolean;
  editorKey: number;
  drafts: Record<string, NamedEngramDraft>;
  pending: NamedEngramPendingAdd[];
  loading: boolean;
  busy: boolean;
  onPaneChange: (value: "overrides" | "points") => void;
  onDraftChange: (row: NamedEngramRow, draft: NamedEngramDraft) => void;
  onPendingChange: (id: string, draft: NamedEngramDraft) => void;
  onAdd: (draft: NamedEngramDraft, listEngram: boolean) => void;
  onDraftInvalidChange: (invalid: boolean) => void;
  updateValue: (fileKey: "game", section: string, key: string, value: string, occurrence?: number) => void;
  publishPayloadChange: (payload: ServerIniPayload) => void;
}

export function EngramEditorSection(props: Props): ReactElement {
  const onPointsChange = (section: string, occurrence: number, value: string): void => {
    props.updateValue("game", section, PLAYER_LEVEL_ENGRAM_POINTS_KEY, value, occurrence);
  };
  const onAddLevel = (): void => {
    if (props.payload === null) return;
    const section = sectionForNewPlayerLevelEngramPoints(props.gameDraft);
    props.publishPayloadChange(
      withFileText(
        props.payload,
        "game",
        appendIniTextValue(props.gameDraft, section, PLAYER_LEVEL_ENGRAM_POINTS_KEY, "0"),
      ),
    );
  };
  const onRemoveLevel = (section: string, occurrence: number): void => {
    if (props.payload === null) return;
    props.publishPayloadChange(
      withFileText(
        props.payload,
        "game",
        removeIniTextValue(props.gameDraft, section, PLAYER_LEVEL_ENGRAM_POINTS_KEY, occurrence),
      ),
    );
  };

  return (
    <Stack gap="md" className={classes.editor} style={{ display: props.show ? undefined : "none" }}>
      <EngramPaneSwitch
        value={props.engramPane}
        overridesUnsaved={props.overridesUnsaved}
        pointsUnsaved={props.pointsUnsaved}
        onChange={props.onPaneChange}
      />
      <Stack
        gap="md"
        className={classes.editor}
        style={{ display: props.engramPane === "overrides" ? undefined : "none" }}
      >
        <EngramEditor
          key={props.editorKey}
          gameText={props.gameText}
          drafts={props.drafts}
          pending={props.pending}
          loading={props.loading}
          busy={props.busy}
          onDraftChange={props.onDraftChange}
          onPendingChange={props.onPendingChange}
          onAdd={props.onAdd}
          onDraftInvalidChange={props.onDraftInvalidChange}
        />
      </Stack>
      {props.engramPane === "points" ? (
        <EngramLevelPoints
          gameText={props.gameDraft}
          loading={props.loading}
          busy={props.busy}
          onChange={onPointsChange}
          onAddLevel={onAddLevel}
          onRemove={onRemoveLevel}
        />
      ) : null}
    </Stack>
  );
}
