import { Plus } from "@phosphor-icons/react";
import { Button, Text } from "@mantine/core";
import type { IniFileKey } from "@shared/types";
import { appRaisedSurfaceClass, withAppSurface } from "@ui/AppSurface/appSurfaceClassName";
import { useMemo, useState, type ReactElement } from "react";
import type { IniSettingReference, IniSettingsSort, IniUiCategoryGroup, IniUiSectionGroup } from "../../iniModel";
import classes from "./ConfigurationEditor.module.css";
import {
  renderCategoryGroups,
  renderFileOrderSections,
  type SettingsGroupActions,
} from "./ConfigurationEditorSettingsGroups";
import { IniAddSettingForm } from "./IniAddSettingForm";
import { defaultIniSection, iniSectionsForNewSetting } from "./iniAddSettingModel";

interface Props {
  loading: boolean;
  iniFile: IniFileKey;
  fileSections: readonly string[];
  sort: IniSettingsSort;
  groupedRows: IniUiCategoryGroup<IniSettingReference>[];
  fileOrderSections: IniUiSectionGroup<IniSettingReference>[];
  highlightRowId: string | null;
  keysInSection: ReadonlyMap<string, ReadonlySet<string>>;
  onAddSetting?: (section: string, key: string, value: string) => void;
  collapsedSections: Record<string, boolean>;
  busy: boolean;
  isRowUnsaved: (row: IniSettingReference) => boolean;
  savedValueForRow: (row: IniSettingReference) => string | null;
  onToggleSection: (sectionName: string) => void;
  onSetSectionGroupsCollapsed: (category: string, collapsed: boolean) => void;
  onUpdateValue: (fileKey: IniFileKey, rowSection: string, key: string, value: string, occurrence?: number) => void;
  onResetRowToDefault: (row: IniSettingReference) => void;
  onRevertRowToSaved: (row: IniSettingReference) => void;
  onOpenAdminList?: () => void;
}

export function ConfigurationEditorSettingsTable(props: Props): ReactElement {
  const [formOpen, setFormOpen] = useState(false);
  const [draftSection, setDraftSection] = useState<string | null>(null);
  const canAdd = props.onAddSetting !== undefined;
  const sections = useMemo(
    () => iniSectionsForNewSetting(props.iniFile, props.fileSections),
    [props.iniFile, props.fileSections],
  );

  const onStartDraft = () => {
    setDraftSection((current) => current ?? defaultIniSection(props.iniFile, sections));
    setFormOpen(true);
  };

  const onCommitDraft = (section: string, key: string, value: string) => {
    setFormOpen(false);
    props.onAddSetting?.(section, key, value);
  };

  const actions: SettingsGroupActions = {
    busy: props.busy,
    highlightRowId: props.highlightRowId,
    isRowUnsaved: props.isRowUnsaved,
    savedValueForRow: props.savedValueForRow,
    onToggleSection: props.onToggleSection,
    onSetSectionGroupsCollapsed: props.onSetSectionGroupsCollapsed,
    onUpdateValue: props.onUpdateValue,
    onResetRowToDefault: props.onResetRowToDefault,
    onRevertRowToSaved: props.onRevertRowToSaved,
    onOpenAdminList: props.onOpenAdminList,
  };

  return (
    <>
      {canAdd && !formOpen ? (
        <div className={classes.addSettingBar}>
          <Button size="xs" variant="default" leftSection={<Plus size={14} />} onClick={onStartDraft}>
            Add setting
          </Button>
        </div>
      ) : null}
      {canAdd && formOpen && draftSection !== null ? (
        <IniAddSettingForm
          key={draftSection}
          fileKey={props.iniFile}
          section={draftSection}
          sections={sections}
          keysInSection={props.keysInSection}
          busy={props.busy}
          onSectionChange={setDraftSection}
          onCommit={onCommitDraft}
          onCancel={() => setFormOpen(false)}
        />
      ) : null}
      <div className={withAppSurface(appRaisedSurfaceClass, classes.tableWrap)}>
        <div className={classes.tableHead}>
          <span>Setting</span>
          <span>Value</span>
          <span>Description</span>
          <span />
        </div>
        <div className={classes.tableBody} data-ini-settings-scroll>
          {props.loading && (
            <Text c="dimmed" p="md">
              Loading INI…
            </Text>
          )}
          {!props.loading &&
            (props.sort === "unsorted" ? props.fileOrderSections.length === 0 : props.groupedRows.length === 0) && (
              <Text c="dimmed" p="md">
                No settings match this filter.
              </Text>
            )}
          {!props.loading &&
            props.sort === "unsorted" &&
            renderFileOrderSections(props.fileOrderSections, props.collapsedSections, actions)}
          {!props.loading &&
            props.sort !== "unsorted" &&
            renderCategoryGroups(props.groupedRows, props.collapsedSections, actions)}
        </div>
      </div>
    </>
  );
}
