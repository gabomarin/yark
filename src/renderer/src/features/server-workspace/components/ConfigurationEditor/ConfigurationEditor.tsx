import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Group, Stack, Text } from "@mantine/core";
import {
  draftFromRow,
  namedEngramRowKey,
  reviewNamedEngramState,
  summarizeNamedEngrams,
  type NamedEngramDraft,
  type NamedEngramPendingAdd,
  type NamedEngramRow,
} from "@shared/ini/engram-named-entries";
import { EMPTY_LINE_EDITS, visualLineEditsPending, type VisualLineEdits } from "@shared/ini/visual-line-edits";
import type { ServerProfile } from "@shared/types";
import { IniEditorNav } from "@ui/IniEditorNav/IniEditorNav";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { useUiDensity } from "@app/AppProviders";
import { EngramEditorSection } from "./EngramEditorSection";
import { LootEditor, type LootEditorStatus } from "./LootEditor";
import { ConfigurationEditorFilterBar } from "./ConfigurationEditorFilterBar";
import { ConfigurationEditorHeader } from "./ConfigurationEditorHeader";
import { ConfigurationEditorOpenFileAction } from "./ConfigurationEditorOpenFileAction";
import { ConfigurationEditorPreviewAlert } from "./ConfigurationEditorPreviewAlert";
import { ConfigurationEditorSettingsTable } from "./ConfigurationEditorSettingsTable";
import { ConfigurationEditorStatusAlerts } from "./ConfigurationEditorStatusAlerts";
import { ConfigurationEditorTextPanel } from "./ConfigurationEditorTextPanel";
import { useConfigurationEditor } from "./useConfigurationEditor";
import { iniSaveScope, iniSectionPending, iniViewDirty, type IniSaveScope } from "./configurationEditorSaveScope";
import { GameIniViewSwitch } from "./IniScopeSwitch";
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
  const engramEditsRef = useRef<VisualLineEdits>(EMPTY_LINE_EDITS);
  const engramBlockedRef = useRef(false);
  const saveScopeRef = useRef<IniSaveScope>("gameSettings");
  const baselineGameRef = useRef("");
  const [engramDrafts, setEngramDrafts] = useState<Record<string, NamedEngramDraft>>({});
  const [pendingAdds, setPendingAdds] = useState<NamedEngramPendingAdd[]>([]);
  const [gameView, setGameView] = useState<"settings" | "engrams" | "loot">("settings");
  const [engramPane, setEngramPane] = useState<"overrides" | "points">("overrides");
  const [engramDraftInvalid, setEngramDraftInvalid] = useState(false);
  const [engramEditorKey, setEngramEditorKey] = useState(0);
  const [lootEditorKey, setLootEditorKey] = useState(0);
  const openCrateRef = useRef<{ key: string; className: string } | null>(null);
  const [lootEditCount, setLootEditCount] = useState(0);
  const [lootBlocked, setLootBlocked] = useState(false);
  const resetDrafts = useCallback((which?: "engrams" | "loot") => {
    if (which !== "loot") {
      engramEditsRef.current = { ...engramEditsRef.current, engrams: [] };
      engramBlockedRef.current = false;
      setEngramDraftInvalid(false);
      setEngramEditorKey((key) => key + 1);
      setEngramDrafts(draftsFrom(summarizeNamedEngrams(baselineGameRef.current).rows));
      setPendingAdds([]);
    }
    if (which !== "engrams") {
      engramEditsRef.current = { ...engramEditsRef.current, crates: [], lootBlocked: false };
      setLootEditCount(0);
      setLootBlocked(false);
      setLootEditorKey((key) => key + 1);
    }
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
      onDirtyChange?.(settingsDirty || visualLineEditsPending(engramEditsRef.current, engramBlockedRef.current));
    },
    onRegisterSave: registerSave,
    engramEditsRef,
    engramBlockedRef,
    saveScopeRef,
    onEngramDraftsReset: resetDrafts,
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
    engramEditsRef.current = { ...engramEditsRef.current, engrams: review.edits };
    engramBlockedRef.current = review.blocked;
    onDirtyChange?.(editor.dirty || visualLineEditsPending(engramEditsRef.current, review.blocked));
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
  const onLootStatus = (status: LootEditorStatus): void => {
    const blocked = status.blocked || status.invalid;
    engramEditsRef.current = { ...engramEditsRef.current, crates: status.edits, lootBlocked: blocked };
    setLootEditCount((current) => (current === status.edits.length ? current : status.edits.length));
    setLootBlocked((current) => (current === blocked ? current : blocked));
    onDirtyChange?.(editor.dirty || visualLineEditsPending(engramEditsRef.current, engramBlockedRef.current));
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
  const lootDirty = lootEditCount > 0 || lootBlocked;

  const iniNavigation = (
    <IniEditorNav
      file={editor.iniFile}
      onFileChange={editor.setIniFile}
      pendingFiles={{ gameUserSettings: gusTextDirty, game: gameTextDirty || engramPending || lootDirty }}
      mode={editor.iniMode}
      onModeChange={(value) => {
        if (
          value === "text" &&
          (visualLineEditsPending(engramEditsRef.current, engramBlockedRef.current) || lootBlocked)
        ) {
          editor.setError("Save or discard engram and loot changes before switching to the text editor.");
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
  const showLoot = showGameView && gameView === "loot";
  const gameViewNav = showGameView ? (
    <GameIniViewSwitch
      value={gameView}
      settingsUnsaved={sectionPending.gameSettings}
      engramsUnsaved={sectionPending.engramPoints || engramPending}
      lootUnsaved={lootDirty}
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
          dirty={
            iniViewDirty(saveScope, editor.baseline, editor.payload, engramReview.edits.length, lootEditCount) ||
            (saveScope === "loot" && lootBlocked)
          }
          discardDirty={editor.dirty || engramDirty || lootDirty}
          invalid={
            (saveScope === "engramOverrides" && (engramReview.blocked || engramDraftInvalid)) ||
            (saveScope === "loot" && lootBlocked)
          }
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

        <EngramEditorSection
          show={showEngrams}
          gameText={gameText}
          gameDraft={gameDraft}
          payload={editor.payload}
          engramPane={engramPane}
          overridesUnsaved={engramPending}
          pointsUnsaved={sectionPending.engramPoints}
          editorKey={engramEditorKey}
          drafts={engramDrafts}
          pending={pendingAdds}
          loading={editor.loading || editor.payload === null}
          busy={editor.busy}
          onPaneChange={setEngramPane}
          onDraftChange={onEngramDraftChange}
          onPendingChange={onPendingChange}
          onAdd={onAddEngram}
          onDraftInvalidChange={setEngramDraftInvalid}
          updateValue={editor.updateValue}
          publishPayloadChange={editor.publishPayloadChange}
        />

        <Stack gap="md" className={classes.editor} style={{ display: showLoot ? undefined : "none" }}>
          <LootEditor
            key={lootEditorKey}
            gameText={gameText}
            map={props.server.map}
            initialCrate={openCrateRef.current}
            onOpenCrateChange={(crate) => {
              openCrateRef.current = crate;
            }}
            loading={editor.loading || editor.payload === null}
            busy={editor.busy}
            onStatus={onLootStatus}
          />
        </Stack>

        {visualMode && !showEngrams && !showLoot && (
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
