import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { SegmentedControl, Stack } from "@mantine/core";
import { isMetadataServiceNotConfiguredMessage } from "@shared/mods/curseforge-proxy-url";
import type { ModMetadata, ModSearchPage, ServerProfile } from "@shared/types";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { activateCatalogMod } from "./activateCatalogMod";
import { copyModCurseForgeUrl, copyModProjectId } from "./copyModRowClipboard";
import { ServerModDetailDrawer } from "./ServerModDetailDrawer";
import { ServerModsHeader } from "./ServerModsHeader";
import { ServerModsServerHeaderActions } from "./ServerModsServerHeaderActions";
import { ServerModsPanelViews } from "./ServerModsPanelViews";
import { ServerModsUnverifiedAddAlert } from "./ServerModsUnverifiedAddAlert";
import { useServerModsInventorySelection } from "./useServerModsInventorySelection";
import { buildServerRows, isUnresolvedProjectStub, mergeConfirmedMetadataFetch, type ModRow } from "./serverModsModel";
import { inspectServerMod } from "./serverModsInspect";
import { useServerModsAddFlow } from "./useServerModsAddFlow";
import { useServerModsListController } from "./useServerModsListController";
import { useServerModsLocalFiles } from "./useServerModsLocalFiles";
import { useServerModsProfileState } from "./useServerModsProfileState";
import { isModsListBusy } from "./serverModsBusy";
import classes from "./ServerModsPanel.module.css";

interface Props {
  server: ServerProfile;
  /** True while this server (or shared-install ops) is locked — disables Clear downloaded files (#702). */
  serverActive?: boolean;
  onServerUpdated: () => void;
}

export function ServerModsPanel(props: Props): ReactElement {
  const [view, setView] = useState<"server" | "discover">("server");
  /** Keep Discover mounted after first visit so its view state survives Server ↔ Discover (#639). */
  const [discoverVisited, setDiscoverVisited] = useState(false);
  const {
    configuredIds,
    setConfiguredIds,
    disabledIds,
    setDisabledIds,
    passiveIds,
    setPassiveIds,
    configuredIdsRef,
    disabledIdsRef,
    passiveIdsRef,
    serverRef,
    cacheRef,
    metadata,
    setMetadata,
    profileSyncPausedRef,
    flushProfileSync,
  } = useServerModsProfileState(props.server);
  const inspectTargetRef = useRef<string | null>(null);
  const [url, setUrl] = useState("");
  const [catalog, setCatalog] = useState<ModSearchPage | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    setView("server");
    setDiscoverVisited(false);
    setCatalog(null);
    setDetail(null);
    inspectTargetRef.current = null;
  }, [props.server.id]);

  const openDiscover = () => {
    setDiscoverVisited(true);
    setView("discover");
  };

  const { selectedIds, setSelectedIds, clearSelection } = useServerModsInventorySelection({
    serverId: props.server.id,
    view,
    profileModIds: props.server.mods,
  });

  useEffect(() => {
    const missingIds = configuredIds.filter((id) => !metadata.has(id));
    if (missingIds.length === 0) return;
    let alive = true;
    void window.api.getModsMetadata(missingIds).then((result) => {
      if (!alive) return;
      if (!result.ok) {
        if (isMetadataServiceNotConfiguredMessage(result.error)) {
          setError(null);
          setWarning(result.error);
          return;
        }
        setWarning(result.error);
        return;
      }
      setMetadata((previous) => mergeConfirmedMetadataFetch(previous, missingIds, result.data));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metadata is read at execution time, not as a reactive trigger
  }, [configuredIds, props.server.id]);

  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds]);
  const passiveSet = useMemo(() => new Set(passiveIds), [passiveIds]);
  const activeCount = configuredIds.filter((id) => !disabledSet.has(id)).length;
  const disabledCount = configuredIds.filter((id) => disabledSet.has(id)).length;
  const serverRows = useMemo(
    () => buildServerRows(configuredIds, disabledSet, metadata, passiveSet),
    [configuredIds, disabledSet, metadata, passiveSet],
  );

  const {
    persist,
    add,
    toggle,
    remove,
    reorder,
    enableAll,
    disableAll,
    removeAllDisabled,
    enableSelected,
    disableSelected,
    removeSelected,
    setPassive,
  } = useServerModsListController({
    serverRef,
    configuredIdsRef,
    disabledIdsRef,
    passiveIdsRef,
    cacheRef,
    metadata,
    onServerUpdated: props.onServerUpdated,
    setConfiguredIds,
    setDisabledIds,
    setPassiveIds,
    setBusyKey,
    setError,
    setWarning,
    setMetadata,
    profileSyncPausedRef,
    flushProfileSync,
  });

  const {
    unverifiedProjectIds,
    setUnverifiedProjectIds,
    importProgress,
    addFromInput,
    addUnverifiedProjectIds,
    refreshDetailMetadata,
  } = useServerModsAddFlow({
    url,
    setUrl,
    configuredIds,
    configuredIdsRef,
    disabledIdsRef,
    passiveIdsRef,
    cacheRef,
    inspectTargetRef,
    setBusyKey,
    setError,
    setWarning,
    setDetail,
    setMetadata,
    persist,
  });

  const openExternal = async (curseForgeUrl: string) => {
    const result = await window.api.openCurseForgeMod(curseForgeUrl);
    if (!result.ok) setError(result.error);
  };

  const { localFilesById, hasLocalFiles, openLocalFolder, requestClearDownloadedFiles } = useServerModsLocalFiles({
    serverId: props.server.id,
    projectIds: configuredIds,
    serverActive: props.serverActive,
    setBusyKey,
    setError,
    setWarning,
  });

  const inspect = async (row: ModRow) => {
    await inspectServerMod({
      row,
      cacheRef,
      configuredIdsRef,
      disabledIdsRef,
      inspectTargetRef,
      setDetail,
      setBusyKey,
      setError,
      setWarning,
      persist,
    });
  };

  const addDiscovered = (row: ModRow) => {
    const mod = catalog?.items.find((item) => item.slug === row.slug);
    if (mod === undefined) return;
    void activateCatalogMod({
      mod,
      serverId: props.server.id,
      getActiveServerId: () => serverRef.current.id,
      setBusyKey,
      setError,
      setWarning,
      add,
    });
  };

  const listBusy = busyKey !== null;
  const headerActions =
    view === "server" ? (
      <ServerModsServerHeaderActions
        configuredIds={configuredIds}
        disabledIds={disabledSet}
        disabledCount={disabledCount}
        listBusy={listBusy}
        selectedIds={selectedIds}
        onEnableAll={() => void enableAll()}
        onDisableAll={() => void disableAll()}
        onRemoveAllDisabled={() => void removeAllDisabled()}
        onEnableSelected={(ids) => void enableSelected(ids)}
        onDisableSelected={(ids) => void disableSelected(ids)}
        onRemoveSelected={(ids) => {
          void removeSelected(ids).then((ok) => {
            if (ok) clearSelection();
          });
        }}
        onClearSelection={clearSelection}
      />
    ) : undefined;

  return (
    <AppSurfaceCard tone="flat" fill padding={0} radius={0} className={classes.root}>
      <ServerModsHeader
        activeCount={activeCount}
        disabledCount={disabledCount}
        selectedCount={selectedIds.length}
        actions={headerActions}
      />
      <div className={classes.content}>
        <Stack gap="md" className={classes.contentStack}>
          <SegmentedControl
            value={view}
            onChange={(value) => (value === "discover" ? openDiscover() : setView("server"))}
            data={[
              { value: "server", label: `Server mods (${configuredIds.length})` },
              { value: "discover", label: "Discover mods" },
            ]}
            className={classes.viewSelector}
          />
          {error !== null && (
            <AppAlert
              className={classes.statusAlert}
              classNames={{ wrapper: classes.statusAlertWrapper }}
              color={isMetadataServiceNotConfiguredMessage(error) ? "attention" : "red"}
              withCloseButton
              onClose={() => setError(null)}
            >
              {error}
            </AppAlert>
          )}
          {warning !== null && (
            <AppAlert
              className={classes.statusAlert}
              classNames={{ wrapper: classes.statusAlertWrapper }}
              color="attention"
              withCloseButton
              onClose={() => setWarning(null)}
            >
              {warning}
            </AppAlert>
          )}
          <ServerModsUnverifiedAddAlert
            ids={unverifiedProjectIds}
            busy={busyKey === "url"}
            onAdd={() => void addUnverifiedProjectIds()}
            onDismiss={() => setUnverifiedProjectIds([])}
          />
          <ServerModsPanelViews
            serverId={props.server.id}
            view={view}
            discoverVisited={discoverVisited}
            url={url}
            busyKey={busyKey}
            importProgress={importProgress}
            serverRows={serverRows}
            serverActive={props.serverActive}
            localFilesById={localFilesById}
            configuredIds={configuredIds}
            disabledIds={disabledIds}
            passiveIds={passiveIds}
            metadata={metadata}
            selectedIds={selectedIds}
            onUrlChange={setUrl}
            onAddFromInput={() => void addFromInput()}
            onDiscover={openDiscover}
            onInspect={(row) => void inspect(row)}
            onToggle={(id, enabled) => void toggle(id, enabled)}
            onRemove={(id) => void remove(id)}
            onOpenExternal={(target) => void openExternal(target)}
            onSetPassive={(row) => {
              if (row.id === null) return;
              void setPassive(row.id, !row.passive);
            }}
            onReorder={(orderedIds) => void reorder(orderedIds)}
            onCopyProjectId={copyModProjectId}
            onCopyCurseForgeUrl={copyModCurseForgeUrl}
            onOpenLocalFolder={(row) => {
              if (row.id === null) return;
              void openLocalFolder(row.id);
            }}
            onClearDownloadedFiles={(row) => requestClearDownloadedFiles(row)}
            onSelectedIdsChange={setSelectedIds}
            onError={setError}
            onCatalogChange={setCatalog}
            onAddDiscovered={addDiscovered}
          />
        </Stack>
      </div>
      <ServerModDetailDrawer
        detail={detail}
        opened={detail !== null}
        configured={detail !== null && configuredIds.includes(detail.id)}
        enabled={detail !== null && !disabledSet.has(detail.id)}
        passive={detail !== null && passiveSet.has(detail.id)}
        noPage={detail !== null && configuredIds.includes(detail.id) && isUnresolvedProjectStub(detail)}
        serverActive={props.serverActive}
        hasLocalFiles={detail !== null && hasLocalFiles(detail.id)}
        busy={
          detail !== null &&
          (busyKey === `detail:${detail.slug}` ||
            busyKey === `detail:${detail.id}` ||
            busyKey === `redownload:${detail.id}` ||
            isModsListBusy(busyKey))
        }
        onClose={() => {
          inspectTargetRef.current = null;
          setDetail(null);
        }}
        onOpenExternal={(target) => void openExternal(target)}
        onOpenLocalFolder={(id) => void openLocalFolder(id)}
        onClearDownloadedFiles={(mod) =>
          requestClearDownloadedFiles({
            id: mod.id,
            name: mod.name,
            noPage: configuredIds.includes(mod.id) && isUnresolvedProjectStub(mod),
          })
        }
        onToggle={(id, enabled) => void toggle(id, enabled)}
        onSetPassive={(id, passive) => void setPassive(id, passive)}
        onAdd={(mod) => void add(mod)}
        onCheckCurseForge={(id) => void refreshDetailMetadata(id)}
        onRemove={(id) =>
          void remove(id).then((ok) => {
            if (ok) setDetail(null);
          })
        }
      />
    </AppSurfaceCard>
  );
}
