import type { IniFileKey, IniPreview, ServerIniPayload, ServerIniSnapshot } from "@shared/types";
import type { IniFilterId, IniSettingReference, IniUiCategoryGroup } from "../../iniModel";

/** Public surface of {@link useConfigurationEditor}. */
export interface ConfigurationEditorApi {
  snapshot: ServerIniSnapshot | null;
  payload: ServerIniPayload | null;
  /** Load / last successful Save baseline (for outside-change diffs) (#667). */
  baseline: ServerIniPayload | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  /** True when the last Save failed because INI changed outside YARK (#665). */
  staleDocument: boolean;
  /** Disk/pending changed while the editor has unsaved edits (#665). */
  externalChangeDetected: boolean;
  setExternalChangeDetected: (value: boolean) => void;
  /** Disk/pending payload captured when an external change was detected (#667). */
  externalDiskPayload: ServerIniPayload | null;
  /** Re-read install / pending draft and reset the editor baseline. */
  reloadFromDisk: () => Promise<void>;
  /** Reload button — confirms first when the editor is dirty. */
  requestReloadFromDisk: () => void;
  preview: IniPreview | null;
  search: string;
  setSearch: (value: string) => void;
  filter: IniFilterId;
  setFilter: (value: IniFilterId) => void;
  collapsedSections: Record<string, boolean>;
  iniFile: IniFileKey;
  setIniFile: (file: IniFileKey) => void;
  iniMode: "visual" | "text";
  setIniMode: (mode: "visual" | "text") => void;
  dirty: boolean;
  /** Unsaved visual-row count for the active file (PINI-001 / #661). */
  unsavedRowCount: number;
  /** True when the editor baseline is a queued draft (#530). */
  pendingQueued: boolean;
  groupedRows: IniUiCategoryGroup[];
  categoryOptions: { value: string; label: string }[];
  fileLabel: string;
  filePath: string | null;
  isRowUnsaved: (row: IniSettingReference) => boolean;
  savedValueForRow: (row: IniSettingReference) => string | null;
  updateValue: (fileKey: IniFileKey, rowSection: string, key: string, value: string, occurrence?: number) => void;
  resetChanges: () => void;
  resetActiveFileToDefaults: () => void;
  resetRowToDefault: (row: IniSettingReference) => void;
  revertRowToSaved: (row: IniSettingReference) => void;
  toggleSection: (sectionName: string) => void;
  setSectionGroupsCollapsed: (category: string, collapsed: boolean) => void;
  setAllSectionsCollapsed: (collapsed: boolean) => void;
  saveIni: () => Promise<boolean>;
  openExternal: () => Promise<void>;
  publishPayloadChange: (nextPayload: ServerIniPayload) => void;
}
