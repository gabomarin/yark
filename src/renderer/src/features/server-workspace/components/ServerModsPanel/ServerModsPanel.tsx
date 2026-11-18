import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { SegmentedControl, Stack } from "@mantine/core";
import { isMetadataServiceNotConfiguredMessage } from "@shared/mods/curseforge-proxy-url";
import type { ModMetadata, ModSearchPage, ServerProfile } from "@shared/types";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { copyModCurseForgeUrl, copyModProjectId } from "./copyModRowClipboard";
import { ServerModDetailDrawer } from "./ServerModDetailDrawer";
import { ServerModsDiscoverSection } from "./ServerModsDiscoverSection";
import { ServerModsHeader } from "./ServerModsHeader";
import { ServerModsServerHeaderActions } from "./ServerModsServerHeaderActions";
import { ServerModsServerSection } from "./ServerModsServerSection";
import { ServerModsUnverifiedAddAlert } from "./ServerModsUnverifiedAddAlert";
import {
  buildServerRows,
  isUnresolvedProjectStub,
  mergeConfirmedMetadataFetch,
  mergeMetadata,
  metadataMap,
  modsMetadataSyncKey,
  sameIdList,
  type ModRow,
} from "./serverModsModel";
import { inspectServerMod } from "./serverModsInspect";
import { useServerModsAddFlow } from "./useServerModsAddFlow";
import { useServerModsListController } from "./useServerModsListController";
import { isModsListBusy } from "./serverModsBusy";
import classes from "./ServerModsPanel.module.css";

interface Props {
  server: ServerProfile;
  onServerUpdated: () => void;
}

export function ServerModsPanel(props: Props): ReactElement {
  const [view, setView] = useState<"server" | "discover">("server");
  const [configuredIds, setConfiguredIds] = useState(props.server.mods);
  const [disabledIds, setDisabledIds] = useState(props.server.disabledMods ?? []);
  const [passiveIds, setPassiveIds] = useState(props.server.passiveMods ?? []);
  const configuredIdsRef = useRef(configuredIds);
  const disabledIdsRef = useRef(disabledIds);
  const passiveIdsRef = useRef(passiveIds);
  const serverRef = useRef(props.server);
  useEffect(() => {
    configuredIdsRef.current = configuredIds;
    disabledIdsRef.current = disabledIds;
    passiveIdsRef.current = passiveIds;
    serverRef.current = props.server;
  });
  const cacheRef = useRef(props.server.modMetadataCache ?? {});
  /** In-flight inspect target (`id` or `slug`); cleared on close / newer inspect. */
  const inspectTargetRef = useRef<string | null>(null);
  const [metadata, setMetadata] = useState<Map<string, ModMetadata>>(() => metadataMap(props.server.modMetadataCache));
  const [url, setUrl] = useState("");
  const [catalog, setCatalog] = useState<ModSearchPage | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    const nextCache = props.server.modMetadataCache ?? {};
    setConfiguredIds(props.server.mods);
    setDisabledIds(props.server.disabledMods ?? []);
    setPassiveIds(props.server.passiveMods ?? []);
    cacheRef.current = nextCache;
    setMetadata(metadataMap(nextCache));
    setView("server");
    setCatalog(null);
    setDetail(null);
    inspectTargetRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on server id change only; mods/disabledMods/cache are reset below by content-key effect
  }, [props.server.id]);

  const modsKey = props.server.mods.join("\0");
  const disabledModsKey = (props.server.disabledMods ?? []).join("\0");
  const passiveModsKey = (props.server.passiveMods ?? []).join("\0");
  const metadataCacheKey = modsMetadataSyncKey(props.server.modMetadataCache);

  useEffect(() => {
    const nextMods = props.server.mods;
    const nextDisabled = props.server.disabledMods ?? [];
    const nextPassive = props.server.passiveMods ?? [];
    const nextCache = props.server.modMetadataCache ?? {};
    setConfiguredIds((previous) => (sameIdList(previous, nextMods) ? previous : nextMods));
    setDisabledIds((previous) => (sameIdList(previous, nextDisabled) ? previous : nextDisabled));
    setPassiveIds((previous) => (sameIdList(previous, nextPassive) ? previous : nextPassive));
    cacheRef.current = nextCache;
    setMetadata((previous) => mergeMetadata(previous, nextCache));
    // Content keys — App polls listServers with new object identities even when
    // the profile is unchanged; reference deps would reset mid-drag / open menus.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional content keys
  }, [modsKey, disabledModsKey, passiveModsKey, metadataCacheKey]);

  useEffect(() => {
    const missingIds = configuredIds.filter((id) => !metadata.has(id));
    if (missingIds.length === 0) return;
    let alive = true;
    void window.api.getModsMetadata(missingIds).then((result) => {
      if (!alive) return;
      if (!result.ok) {
        // Soft-fail without seeding No page stubs — transient errors stay pending.
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

  const { persist, add, toggle, remove, reorder, enableAll, disableAll, removeAllDisabled, setPassive } =
    useServerModsListController({
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

  const activateCatalogMod = async (mod: ModMetadata) => {
    setBusyKey(mod.slug);
    setError(null);
    setWarning(null);
    await runWithFinally(
      async () => {
        try {
          const result = await window.api.getModByReference(mod.id || mod.slug);
          if (!result.ok) throw new Error(result.error);
          await add(result.data);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not add the mod");
        }
      },
      () => {
        setBusyKey(null);
      },
    );
  };

  const openExternal = async (curseForgeUrl: string) => {
    const result = await window.api.openCurseForgeMod(curseForgeUrl);
    if (!result.ok) setError(result.error);
  };

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
    if (mod !== undefined) void activateCatalogMod(mod);
  };

  const listBusy = busyKey !== null;
  const headerActions =
    view === "server" ? (
      <ServerModsServerHeaderActions
        configuredIds={configuredIds}
        disabledIds={disabledSet}
        disabledCount={disabledCount}
        listBusy={listBusy}
        onEnableAll={() => void enableAll()}
        onDisableAll={() => void disableAll()}
        onRemoveAllDisabled={() => void removeAllDisabled()}
      />
    ) : undefined;

  return (
    <AppSurfaceCard tone="flat" fill padding={0} radius={0} className={classes.root}>
      <ServerModsHeader activeCount={activeCount} disabledCount={disabledCount} actions={headerActions} />
      <div className={classes.content}>
        <Stack gap="md" className={classes.contentStack}>
          <SegmentedControl
            value={view}
            onChange={(value) => setView(value as "server" | "discover")}
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
          {view === "server" ? (
            <ServerModsServerSection
              key={props.server.id}
              url={url}
              busyKey={busyKey}
              importProgress={importProgress}
              rows={serverRows}
              onUrlChange={setUrl}
              onAdd={() => void addFromInput()}
              onDiscover={() => setView("discover")}
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
            />
          ) : (
            <ServerModsDiscoverSection
              configuredIds={configuredIds}
              disabledIds={disabledIds}
              passiveIds={passiveIds}
              metadata={metadata}
              busyKey={busyKey}
              onError={setError}
              onCatalogChange={setCatalog}
              onInspect={(row) => void inspect(row)}
              onAdd={addDiscovered}
              onOpenExternal={(target) => void openExternal(target)}
            />
          )}
        </Stack>
      </div>
      <ServerModDetailDrawer
        detail={detail}
        opened={detail !== null}
        configured={detail !== null && configuredIds.includes(detail.id)}
        enabled={detail !== null && !disabledSet.has(detail.id)}
        passive={detail !== null && passiveSet.has(detail.id)}
        noPage={detail !== null && configuredIds.includes(detail.id) && isUnresolvedProjectStub(detail)}
        busy={
          detail !== null &&
          (busyKey === `detail:${detail.slug}` || busyKey === `detail:${detail.id}` || isModsListBusy(busyKey))
        }
        onClose={() => {
          inspectTargetRef.current = null;
          setDetail(null);
        }}
        onOpenExternal={(target) => void openExternal(target)}
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
