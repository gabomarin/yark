import type { ReactElement } from "react";
import {
  Group,
  Stack,
  Text,
} from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import { IniEditorNav } from "@ui/IniEditorNav/IniEditorNav";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { useUiDensity } from "@app/AppProviders";
import { ConfigurationEditorFilterBar } from "./ConfigurationEditorFilterBar";
import { ConfigurationEditorHeader } from "./ConfigurationEditorHeader";
import { ConfigurationEditorOpenFileAction } from "./ConfigurationEditorOpenFileAction";
import { ConfigurationEditorPreviewAlert } from "./ConfigurationEditorPreviewAlert";
import { ConfigurationEditorSettingsTable } from "./ConfigurationEditorSettingsTable";
import { ConfigurationEditorStatusAlerts } from "./ConfigurationEditorStatusAlerts";
import { ConfigurationEditorTextPanel } from "./ConfigurationEditorTextPanel";
import { useConfigurationEditor } from "./useConfigurationEditor";
import classes from "./ConfigurationEditor.module.css";

type ConfigSection = "iniFiles";

interface Props {
  server: ServerProfile;
  section: ConfigSection;
  serverActive?: boolean;
  filesJobActive?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: (save: (() => Promise<boolean>) | null) => void;
}

export function ConfigurationEditor(props: Props): ReactElement {
  const filesJobActive = props.filesJobActive === true;
  const density = useUiDensity();
  const openFileIconSize = density === "compact" ? "sm" : "md";
  const openFileGlyphSize = density === "compact" ? 14 : 16;
  const editor = useConfigurationEditor({
    serverId: props.server.id,
    onDirtyChange: props.onDirtyChange,
    onRegisterSave: props.onRegisterSave,
  });

  const iniNavigation = (
    <IniEditorNav
      file={editor.iniFile}
      onFileChange={editor.setIniFile}
      mode={editor.iniMode}
      onModeChange={(value) => editor.setIniMode(value === "text" ? "text" : "visual")}
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

  return (
    <AppSurfaceCard
      tone="flat"
      fill
      padding={0}
      radius="md"
      className={classes.root}
      data-configuration-editor
    >
      <div className={classes.content}>
        <ConfigurationEditorStatusAlerts
          error={editor.error}
          onDismissError={() => editor.setError(null)}
          serverActive={props.serverActive === true}
          filesJobActive={filesJobActive}
        />

        {props.section === "iniFiles" && editor.iniMode === "visual" && (
          <Stack gap="md" className={classes.editor}>
            <ConfigurationEditorHeader
              fileLabel={editor.fileLabel}
              subtitle="Edit {fileLabel} with visual controls and direct file access."
              openFileAction={openFileAction}
              iniNavigation={iniNavigation}
              showRestoreFile
              restoreFileDisabled={editor.payload === null}
              dirty={editor.dirty}
              busy={editor.busy}
              loading={editor.loading}
              onRestoreFile={editor.resetActiveFileToDefaults}
              onDiscard={editor.resetChanges}
              onSave={() => void editor.saveIni()}
            />

            <ConfigurationEditorFilterBar
              search={editor.search}
              onSearchChange={editor.setSearch}
              filter={editor.filter}
              onFilterChange={editor.setFilter}
              categoryOptions={editor.categoryOptions}
              dirty={editor.dirty}
              onCollapseAll={() => editor.setAllSectionsCollapsed(true)}
              onExpandAll={() => editor.setAllSectionsCollapsed(false)}
            />

            <ConfigurationEditorSettingsTable
              loading={editor.loading}
              groupedRows={editor.groupedRows}
              collapsedSections={editor.collapsedSections}
              busy={editor.busy}
              onToggleSection={editor.toggleSection}
              onUpdateValue={editor.updateValue}
              onResetRowToDefault={editor.resetRowToDefault}
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

        {props.section === "iniFiles" &&
          editor.iniMode === "text" &&
          editor.payload !== null && (
          <Stack gap="md" className={classes.editor}>
            <ConfigurationEditorHeader
              fileLabel={editor.fileLabel}
              subtitle="Direct editing of {fileLabel}. Useful for comparing or pasting blocks between servers."
              openFileAction={openFileAction}
              iniNavigation={iniNavigation}
              dirty={editor.dirty}
              busy={editor.busy}
              onDiscard={editor.resetChanges}
              onSave={() => void editor.saveIni()}
            />
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
