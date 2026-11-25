import type { ReactElement } from "react";
import type { ModMetadata, ModSearchPage } from "@shared/types";
import type { ModAddImportProgress } from "@shared/mods/mod-add-input";
import { ServerModsDiscoverSection } from "./ServerModsDiscoverSection";
import { ServerModsServerSection } from "./ServerModsServerSection";
import type { ModRow } from "./serverModsModel";
import classes from "./ServerModsPanel.module.css";

interface Props {
  serverId: string;
  view: "server" | "discover";
  discoverVisited: boolean;
  url: string;
  busyKey: string | null;
  importProgress: ModAddImportProgress | null;
  serverRows: ModRow[];
  serverActive?: boolean;
  localFilesById: Record<string, boolean>;
  configuredIds: string[];
  disabledIds: string[];
  passiveIds: string[];
  metadata: Map<string, ModMetadata>;
  selectedIds: string[];
  onUrlChange: (value: string) => void;
  onAddFromInput: () => void;
  onDiscover: () => void;
  onInspect: (row: ModRow) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onOpenExternal: (url: string) => void;
  onSetPassive: (row: ModRow) => void;
  onReorder: (orderedIds: string[]) => void;
  onCopyProjectId: (row: ModRow) => void;
  onCopyCurseForgeUrl: (row: ModRow) => void;
  onOpenLocalFolder: (row: ModRow) => void;
  onClearDownloadedFiles: (row: ModRow) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  onError: (message: string | null) => void;
  onCatalogChange: (catalog: ModSearchPage | null) => void;
  onAddDiscovered: (row: ModRow) => void;
}

/** Server / Discover panes; Discover stays mounted after first visit (#639). */
export function ServerModsPanelViews(props: Props): ReactElement {
  return (
    <div className={classes.viewHost}>
      {props.view === "server" ? (
        <ServerModsServerSection
          key={props.serverId}
          url={props.url}
          busyKey={props.busyKey}
          importProgress={props.importProgress}
          rows={props.serverRows}
          serverActive={props.serverActive}
          localFilesById={props.localFilesById}
          onUrlChange={props.onUrlChange}
          onAdd={props.onAddFromInput}
          onDiscover={props.onDiscover}
          onInspect={props.onInspect}
          onToggle={props.onToggle}
          onRemove={props.onRemove}
          onOpenExternal={props.onOpenExternal}
          onSetPassive={props.onSetPassive}
          onReorder={props.onReorder}
          onCopyProjectId={props.onCopyProjectId}
          onCopyCurseForgeUrl={props.onCopyCurseForgeUrl}
          onOpenLocalFolder={props.onOpenLocalFolder}
          onClearDownloadedFiles={props.onClearDownloadedFiles}
          selectedIds={props.selectedIds}
          onSelectedIdsChange={props.onSelectedIdsChange}
        />
      ) : null}
      {props.discoverVisited ? (
        <div hidden={props.view !== "discover"}>
          <ServerModsDiscoverSection
            key={props.serverId}
            configuredIds={props.configuredIds}
            disabledIds={props.disabledIds}
            passiveIds={props.passiveIds}
            metadata={props.metadata}
            busyKey={props.busyKey}
            onError={props.onError}
            onCatalogChange={props.onCatalogChange}
            onInspect={props.onInspect}
            onAdd={props.onAddDiscovered}
            onOpenExternal={props.onOpenExternal}
          />
        </div>
      ) : null}
    </div>
  );
}
