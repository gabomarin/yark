import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Group, Stack, Text } from "@mantine/core";
import {
  draftFromRow,
  namedEngramRowKey,
  reviewNamedEngramState,
  summarizeNamedEngrams,
  type NamedEngramDraft,
  type NamedEngramEdit,
  type NamedEngramPendingAdd,
  type NamedEngramRow,
} from "@shared/ini/engram-named-entries";
import { appendIniTextValue, removeIniTextValue } from "@shared/ini/ini-text";
import { withFileText } from "../../iniModel";
import {
  PLAYER_LEVEL_ENGRAM_POINTS_KEY,
  sectionForNewPlayerLevelEngramPoints,
} from "@shared/ini/player-level-engram-points";
import type { ServerProfile } from "@shared/types";
import { IniEditorNav } from "@ui/IniEditorNav/IniEditorNav";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { useUiDensity } from "@app/AppProviders";
import { EngramEditor } from "./EngramEditor";
import { EngramLevelPoints } from "./EngramLevelPoints";
import { ConfigurationEditorFilterBar } from "./ConfigurationEditorFilterBar";
import { ConfigurationEditorHeader } from "./ConfigurationEditorHeader";
import { ConfigurationEditorOpenFileAction } from "./ConfigurationEditorOpenFileAction";
import { ConfigurationEditorPreviewAlert } from "./ConfigurationEditorPreviewAlert";
import { ConfigurationEditorSettingsTable } from "./ConfigurationEditorSettingsTable";
import { ConfigurationEditorStatusAlerts } from "./ConfigurationEditorStatusAlerts";
import { ConfigurationEditorTextPanel } from "./ConfigurationEditorTextPanel";
import { useConfigurationEditor } from "./useConfigurationEditor";
import { iniSaveScope, iniSectionPending, iniViewDirty, type IniSaveScope } from "./configurationEditorSaveScope";
import { EngramPaneSwitch, GameIniViewSwitch } from "./IniScopeSwitch";
import classes from "./ConfigurationEditor.module.css";

type ConfigSection = "iniFiles";

function draftsFrom(rows: readonly NamedEngramRow[]): Record<string, NamedEngramDraft> {
  const drafts: Record<string, NamedEngramDraft> = {};
  for (const row of rows) drafts[namedEngramRowKey(row)] = draftFromRow(row);
  return drafts;
}

interface Props {
  server: ServerProfile;
  section: ConfigSection;
  serverActive?: boolean;
  filesJobActive?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: (save: (() => Promise<boolean>) | null) => void;
  /** Open RCON → Admins (AdminListURL is managed there). */
  onOpenAdminList?: () => void;
  onSaved?: () => void;
}

export function ConfigurationEditor(props: Props): ReactElement {
  const filesJobActive = props.filesJobActive === true;
  const density = useUiDensity();
  const openFileIconSize = density === "compact" ? "sm" : "md";
  const openFileGlyphSize = density === "compact" ? 14 : 16;
  const { onRegisterSave, onSaved, onDirtyChange } = props;
  const engramEditsRef = useRef<readonly NamedEngramEdit[]>([]);
  const engramBlockedRef = useRef(false);
  const saveScopeRef = useRef<IniSaveScope>("gameSettings");
  const baselineGameRef = useRef("");
  const [engramDrafts, setEngramDrafts] = useState<Record<string, NamedEngramDraft>>({});
  const [pendingAdds, setPendingAdds] = useState<NamedEngramPendingAdd[]>([]);
  const [gameView, setGameView] = useState<"settings" | "engrams">("settings");
  const [engramPane, setEngramPane] = useState<"overrides" | "points">("overrides");
  const [engramDraftInvalid, setEngramDraftInvalid] = useState(false);
  const [engramEditorKey, setEngramEditorKey] = useState(0);
  const resetEngramDrafts = useCallback(() => {
    engramEditsRef.current = [];
    engramBlockedRef.current = false;
    setEngramDraftInvalid(false);
    setEngramEditorKey((key) => key + 1);
    setEngramDrafts(draftsFrom(summarizeNamedEngrams(baselineGameRef.current).rows));
    setPendingAdds([]);
  }, []);
  /** Save, then let the workspace refresh once it succeeded. Both save paths share this. */
  const runSave = useCallback(
    async (save: () => Promise<boolean>): Promise<boolean> => {
      const saved = await save();
      if (saved) onSaved?.();
      return saved;
    },
    [onSaved],
  );
  // Stable identity: `useConfigurationEditor` re-registers its save handler whenever this
  // callback changes, and an inline wrapper would tear that down on every keystroke.
  const registerSave = useCallback(
    (save: (() => Promise<boolean>) | null) => onRegisterSave?.(save === null ? null : () => runSave(save)),
    [onRegisterSave, runSave],
  );
  const editor = useConfigurationEditor({
    serverId: props.server.id,
    onDirtyChange: (settingsDirty) => {
      onDirtyChange?.(settingsDirty || engramEditsRef.current.length > 0 || engramBlockedRef.current);
    },
    onRegisterSave: registerSave,
    engramEditsRef,
    engramBlockedRef,
    saveScopeRef,
    onEngramDraftsReset: resetEngramDrafts,
  });
  const gameText = editor.baseline?.game ?? "";
  const saveScope = iniSaveScope(editor.iniFile, editor.iniMode, gameView, engramPane);
  useEffect(() => {
    baselineGameRef.current = gameText;
    saveScopeRef.current = saveScope;
  });
  const engramSummary = useMemo(() => summarizeNamedEngrams(gameText), [gameText]);
  const namedLineKey = engramSummary.rows.map((row) => `${row.occurrence}:${row.expectedRaw}`).join("\n");
  const [seenNamedLines, setSeenNamedLines] = useState(namedLineKey);
  if (seenNamedLines !== namedLineKey) {
    setSeenNamedLines(namedLineKey);
    setEngramDrafts(draftsFrom(engramSummary.rows));
    setPendingAdds([]);
  }
  const engramReview = reviewNamedEngramState(
    engramSummary.rows,
    engramDrafts,
    pendingAdds,
    engramSummary.onlySpecified,
  );
  const engramDirty = engramReview.edits.length > 0 || engramReview.blocked;
  const publishEngramReview = (
    drafts: Record<string, NamedEngramDraft>,
    pending: readonly NamedEngramPendingAdd[],
  ): void => {
    const review = reviewNamedEngramState(engramSummary.rows, drafts, pending, engramSummary.onlySpecified);
    engramEditsRef.current = review.edits;
    engramBlockedRef.current = review.blocked;
    onDirtyChange?.(editor.dirty || review.edits.length > 0 || review.blocked);
  };
  const onEngramDraftChange = (row: NamedEngramRow, draft: NamedEngramDraft) => {
    const next = { ...engramDrafts, [namedEngramRowKey(row)]: draft };
    setEngramDrafts(next);
    publishEngramReview(next, pendingAdds);
  };
  const onPendingChange = (id: string, draft: NamedEngramDraft) => {
    const next = draft.removed
      ? pendingAdds.filter((item) => item.id !== id)
      : pendingAdds.map((item) => (item.id === id ? { ...item, draft } : item));
    setPendingAdds(next);
    publishEngramReview(engramDrafts, next);
  };
  const onAddEngram = (draft: NamedEngramDraft, listEngram: boolean) => {
    const next = [...pendingAdds, { id: crypto.randomUUID(), originClass: draft.className, draft, listEngram }];
    setPendingAdds(next);
    publishEngramReview(engramDrafts, next);
  };
  const gameDraft = editor.payload?.game ?? "";
  const onPointsChange = (section: string, occurrence: number, value: string) => {
    editor.updateValue("game", section, PLAYER_LEVEL_ENGRAM_POINTS_KEY, value, occurrence);
  };
  const onAddLevel = () => {
    if (editor.payload === null) return;
    const section = sectionForNewPlayerLevelEngramPoints(gameDraft);
    editor.publishPayloadChange(
      withFileText(editor.payload, "game", appendIniTextValue(gameDraft, section, PLAYER_LEVEL_ENGRAM_POINTS_KEY, "0")),
    );
  };
  const onRemoveLevel = (section: string, occurrence: number) => {
    if (editor.payload === null) return;
    editor.publishPayloadChange(
      withFileText(
        editor.payload,
        "game",
        removeIniTextValue(gameDraft, section, PLAYER_LEVEL_ENGRAM_POINTS_KEY, occurrence),
      ),
    );
  };

  const saveAndNotify = () => runSave(editor.saveIni);
  const sectionPending = iniSectionPending(editor.baseline, editor.payload);
  const engramPending = engramReview.edits.length > 0 || engramReview.blocked || engramDraftInvalid;
  const gameTextDirty =
    editor.payload !== null && editor.baseline !== null && editor.payload.game !== editor.baseline.game;
  const gusTextDirty =
    editor.payload !== null &&
    editor.baseline !== null &&
    editor.payload.gameUserSettings !== editor.baseline.gameUserSettings;

  const iniNavigation = (
    <IniEditorNav
      file={editor.iniFile}
      onFileChange={editor.setIniFile}
      pendingFiles={{ gameUserSettings: gusTextDirty, game: gameTextDirty || engramPending }}
      mode={editor.iniMode}
      onModeChange={(value) => {
        if (value === "text" && (engramEditsRef.current.length > 0 || engramBlockedRef.current)) {
          editor.setError("Save or discard engram changes before switching to the text editor.");
          return;
        }
        editor.setIniMode(value === "text" ? "text" : "visual");
      }}
      modeOptions={[
        { value: "visual", label: "Visual" },
        { value: "text", label: "Text" },
      ]}
    />
  );

  const openFileAction =
    editor.filePath === null ? null : (
      <ConfigurationEditorOpenFileAction
        fileLabel={editor.fileLabel}
        filePath={editor.filePath}
        iconSize={openFileIconSize}
        glyphSize={openFileGlyphSize}
        busy={editor.busy}
        onOpen={() => void editor.openExternal()}
      />
    );

  const visualMode = props.section === "iniFiles" && editor.iniMode === "visual";
  const textMode = props.section === "iniFiles" && editor.iniMode === "text" && editor.payload !== null;
  const showGameView = visualMode && editor.iniFile === "game";
  const showEngrams = showGameView && gameView === "engrams";
  const gameViewNav = showGameView ? (
    <GameIniViewSwitch
      value={gameView}
      settingsUnsaved={sectionPending.gameSettings}
      engramsUnsaved={sectionPending.engramPoints || engramPending}
      onChange={setGameView}
    />
  ) : null;

  return (
    <AppSurfaceCard tone="flat" fill padding={0} radius={0} className={classes.root} data-configuration-editor>
      {(visualMode || textMode) && (
        <ConfigurationEditorHeader
          fileLabel={editor.fileLabel}
          subtitle={
            visualMode
              ? "Edit {fileLabel} with visual controls and direct file access."
              : "Direct editing of {fileLabel}. Useful for comparing or pasting blocks between servers."
          }
          openFileAction={openFileAction}
          iniNavigation={iniNavigation}
          gameViewNav={gameViewNav}
          showRestoreFile={visualMode}
          restoreFileDisabled={editor.payload === null}
          dirty={iniViewDirty(saveScope, editor.baseline, editor.payload, engramReview.edits.length)}
          discardDirty={editor.dirty || engramDirty}
          invalid={saveScope === "engramOverrides" && (engramReview.blocked || engramDraftInvalid)}
          busy={editor.busy}
          loading={editor.loading}
          onReloadFromDisk={editor.requestReloadFromDisk}
          onRestoreFile={visualMode ? editor.resetActiveFileToDefaults : undefined}
          onDiscard={editor.resetChanges}
          onSave={() => void saveAndNotify()}
        />
      )}
      <div className={classes.content}>
        <ConfigurationEditorStatusAlerts
          error={editor.error}
          onDismissError={() => editor.setError(null)}
          staleDocument={editor.staleDocument}
          externalChangeDetected={editor.externalChangeDetected}
          iniMode={editor.iniMode}
          baseline={editor.baseline}
          externalDiskPayload={editor.externalDiskPayload}
          onReloadStale={editor.requestReloadFromDisk}
          onDismissExternalChange={() => editor.setExternalChangeDetected(false)}
          reloadBusy={editor.busy}
          serverActive={props.serverActive === true}
          filesJobActive={filesJobActive}
          pendingQueued={editor.pendingQueued}
        />

        <Stack gap="md" className={classes.editor} style={{ display: showEngrams ? undefined : "none" }}>
          <EngramPaneSwitch
            value={engramPane}
            overridesUnsaved={engramPending}
            pointsUnsaved={sectionPending.engramPoints}
            onChange={setEngramPane}
          />
          <Stack
            gap="md"
            className={classes.editor}
            style={{ display: engramPane === "overrides" ? undefined : "none" }}
          >
            <EngramEditor
              key={engramEditorKey}
              gameText={gameText}
              drafts={engramDrafts}
              pending={pendingAdds}
              loading={editor.loading || editor.payload === null}
              busy={editor.busy}
              onDraftChange={onEngramDraftChange}
              onPendingChange={onPendingChange}
              onAdd={onAddEngram}
              onDraftInvalidChange={setEngramDraftInvalid}
            />
          </Stack>
          {engramPane === "points" ? (
            <EngramLevelPoints
              gameText={gameDraft}
              loading={editor.loading || editor.payload === null}
              busy={editor.busy}
              onChange={onPointsChange}
              onAddLevel={onAddLevel}
              onRemove={onRemoveLevel}
            />
          ) : null}
        </Stack>

        {visualMode && !showEngrams && (
          <Stack gap="md" className={classes.editor}>
            <ConfigurationEditorFilterBar
              search={editor.search}
              onSearchChange={editor.setSearch}
              filter={editor.filter}
              onFilterChange={editor.setFilter}
              categoryOptions={editor.categoryOptions}
              dirty={editor.dirty}
              unsavedRowCount={editor.unsavedRowCount}
              onCollapseAll={() => editor.setAllSectionsCollapsed(true)}
              onExpandAll={() => editor.setAllSectionsCollapsed(false)}
            />

            <ConfigurationEditorSettingsTable
              loading={editor.loading}
              groupedRows={editor.groupedRows}
              collapsedSections={editor.collapsedSections}
              busy={editor.busy}
              isRowUnsaved={editor.isRowUnsaved}
              savedValueForRow={editor.savedValueForRow}
              onToggleSection={editor.toggleSection}
              onSetSectionGroupsCollapsed={editor.setSectionGroupsCollapsed}
              onUpdateValue={editor.updateValue}
              onResetRowToDefault={editor.resetRowToDefault}
              onRevertRowToSaved={editor.revertRowToSaved}
              onOpenAdminList={props.onOpenAdminList}
            />

            <Group justify="space-between" className={classes.footer}>
              <Text c="dimmed" size="xs">
                The manager only handles settings that apply to the dedicated server.
              </Text>
            </Group>

            {editor.preview !== null && editor.preview.diff.length > 0 && (
              <ConfigurationEditorPreviewAlert preview={editor.preview} />
            )}
          </Stack>
        )}

        {textMode && editor.payload !== null && (
          <Stack gap="md" className={classes.editor}>
            <ConfigurationEditorTextPanel
              iniFile={editor.iniFile}
              payload={editor.payload}
              onPayloadChange={editor.publishPayloadChange}
            />
          </Stack>
        )}
      </div>
    </AppSurfaceCard>
  );
}
