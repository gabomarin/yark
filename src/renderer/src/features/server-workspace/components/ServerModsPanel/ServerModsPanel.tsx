import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Alert, SegmentedControl, Stack } from "@mantine/core";
import { isMetadataServiceNotConfiguredMessage } from "@shared/curseforge-proxy-url";
import type { ModMetadata, ModSearchPage, ServerProfile } from "@shared/types";
import { prepareModAddApply, type ModAddImportProgress } from "@shared/mod-add-input";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { ServerModDetailDrawer } from "./ServerModDetailDrawer";
import { ServerModsDiscoverSection } from "./ServerModsDiscoverSection";
import { ServerModsHeader } from "./ServerModsHeader";
import { ServerModsServerSection } from "./ServerModsServerSection";
import {
  buildServerRows,
  mergeMissingMetadata,
  mergeMetadata,
  metadataMap,
  modsMetadataSyncKey,
  sameIdList,
  type ModRow,
} from "./serverModsModel";
import { createServerModsListMutations } from "./serverModsListMutations";
import { notifyNewlyAddedMods } from "./notifyModsAddedDisabled";
import { useMapModEnableNotify } from "./useMapModEnableNotify";
import classes from "./ServerModsPanel.module.css";

interface Props {
  server: ServerProfile;
  onServerUpdated: () => void;
}

export function ServerModsPanel(props: Props): ReactElement {
  const [view, setView] = useState<"server" | "discover">("server");
  const [configuredIds, setConfiguredIds] = useState(props.server.mods);
  const [disabledIds, setDisabledIds] = useState(props.server.disabledMods ?? []);
  const configuredIdsRef = useRef(configuredIds);
  const disabledIdsRef = useRef(disabledIds);
  const serverRef = useRef(props.server);
  useEffect(() => {
    configuredIdsRef.current = configuredIds;
    disabledIdsRef.current = disabledIds;
    serverRef.current = props.server;
  });
  const cacheRef = useRef(props.server.modMetadataCache ?? {});
  const [metadata, setMetadata] = useState<Map<string, ModMetadata>>(
    () => metadataMap(props.server.modMetadataCache),
  );
  const [url, setUrl] = useState("");
  const [catalog, setCatalog] = useState<ModSearchPage | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ModAddImportProgress | null>(
    null,
  );

  useEffect(() => {
    const nextCache = props.server.modMetadataCache ?? {};
    setConfiguredIds(props.server.mods);
    setDisabledIds(props.server.disabledMods ?? []);
    cacheRef.current = nextCache;
    setMetadata(metadataMap(nextCache));
    setView("server");
    setCatalog(null);
    setDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on server id change only; mods/disabledMods/cache are reset below by content-key effect
  }, [props.server.id]);

  const modsKey = props.server.mods.join("\0");
  const disabledModsKey = (props.server.disabledMods ?? []).join("\0");
  const metadataCacheKey = modsMetadataSyncKey(props.server.modMetadataCache);

  useEffect(() => {
    const nextMods = props.server.mods;
    const nextDisabled = props.server.disabledMods ?? [];
    const nextCache = props.server.modMetadataCache ?? {};
    setConfiguredIds((previous) =>
      sameIdList(previous, nextMods) ? previous : nextMods,
    );
    setDisabledIds((previous) =>
      sameIdList(previous, nextDisabled) ? previous : nextDisabled,
    );
    cacheRef.current = nextCache;
    setMetadata((previous) => mergeMetadata(previous, nextCache));
    // Content keys — App polls listServers with new object identities even when
    // the profile is unchanged; reference deps would reset mid-drag / open menus.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional content keys
  }, [modsKey, disabledModsKey, metadataCacheKey]);

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
        setError(result.error);
        return;
      }
      setMetadata((previous) => mergeMissingMetadata(previous, result.data));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metadata is read at execution time, not as a reactive trigger
  }, [configuredIds, props.server.id]);

  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds]);
  const activeCount = configuredIds.filter((id) => !disabledSet.has(id)).length;
  const disabledCount = configuredIds.filter((id) => disabledSet.has(id)).length;
  const serverRows = useMemo(
    () => buildServerRows(configuredIds, disabledSet, metadata),
    [configuredIds, disabledSet, metadata],
  );

  const persist = async (
    nextIds: string[],
    nextDisabled: string[],
    nextCache: Record<string, ModMetadata>,
  ) => {
    // Snapshot the server id so a workspace switch mid-await does not apply this write.
    const server = serverRef.current;
    const targetServerId = server.id;
    const result = await window.api.updateServerPatch(targetServerId, {
      group: "mods",
      mods: nextIds,
      disabledMods: nextDisabled,
      modMetadataCache: nextCache,
    });
    if (!result.ok) throw new Error(result.error);
    if (serverRef.current.id !== targetServerId) return;
    setConfiguredIds(nextIds);
    setDisabledIds(nextDisabled);
    cacheRef.current = nextCache;
    setMetadata((previous) => mergeMetadata(previous, nextCache));
    props.onServerUpdated();
  };
  const { notifyMapModIfNeeded } = useMapModEnableNotify({
    configuredIdsRef,
    disabledIdsRef,
    cacheRef,
    persist,
  });

  const { add, toggle, remove, reorder } = createServerModsListMutations({
    configuredIdsRef,
    disabledIdsRef,
    metadata,
    cacheRef,
    setBusyKey,
    setError,
    setWarning,
    persist,
    notifyMapModIfNeeded,
  });

  const addFromInput = async () => {
    setBusyKey("url");
    setError(null);
    setWarning(null);
    setImportProgress(null);
    try {
      const outcome = await prepareModAddApply(
        url,
        {
          configuredIds,
          disabledIds,
          cache: cacheRef.current,
        },
        (ref) => window.api.getModByReference(ref),
        {
          onProgress: setImportProgress,
          onBatchComplete: async (next) => {
            await persist(
              next.configuredIds,
              next.disabledIds,
              next.cache,
            );
          },
        },
      );
      if (outcome.status === "validation-error") {
        setError(outcome.message);
        return;
      }
      if (outcome.clearInput) {
        setUrl("");
      }
      if (outcome.warning !== null) setWarning(outcome.warning);
      if (outcome.error !== null) setError(outcome.error);
      if (outcome.status === "ready") {
        notifyNewlyAddedMods(configuredIds, outcome.next);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the mod");
    } finally {
      setBusyKey(null);
      setImportProgress(null);
    }
  };

  const activateCatalogMod = async (mod: ModMetadata) => {
    setBusyKey(mod.slug);
    setError(null);
    setWarning(null);
    try {
      const result = await window.api.getModByReference(mod.id || mod.slug);
      if (!result.ok) throw new Error(result.error);
      await add(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the mod");
    } finally {
      setBusyKey(null);
    }
  };

  const openExternal = async (curseForgeUrl: string) => {
    const result = await window.api.openCurseForgeMod(curseForgeUrl);
    if (!result.ok) setError(result.error);
  };

  const inspect = async (row: ModRow) => {
    const cachedDetail = row.id === null ? undefined : cacheRef.current[row.id];
    if (cachedDetail !== undefined) {
      setDetail(cachedDetail);
      return;
    }
    const ref = row.id ?? row.slug;
    if (ref.length === 0) return;
    setBusyKey(`detail:${row.slug}`);
    setError(null);
    setWarning(null);
    try {
      const result = await window.api.getModByReference(ref);
      if (!result.ok) throw new Error(result.error);
      setDetail(result.data);
      if (configuredIdsRef.current.includes(result.data.id)) {
        await persist(configuredIdsRef.current, disabledIdsRef.current, {
          ...cacheRef.current,
          [result.data.id]: result.data,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load mod metadata");
    } finally {
      setBusyKey(null);
    }
  };

  const addDiscovered = (row: ModRow) => {
    const mod = catalog?.items.find((item) => item.slug === row.slug);
    if (mod !== undefined) void activateCatalogMod(mod);
  };

  return (
    <AppSurfaceCard tone="flat" fill padding={0} radius="md" className={classes.root}>
      <ServerModsHeader activeCount={activeCount} disabledCount={disabledCount} />
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
            <Alert
              color={isMetadataServiceNotConfiguredMessage(error) ? "yellow" : "red"}
              withCloseButton
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}
          {warning !== null && (
            <Alert color="yellow" withCloseButton onClose={() => setWarning(null)}>
              {warning}
            </Alert>
          )}
          {view === "server" ? (
            <ServerModsServerSection
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
              onReorder={(orderedIds) => void reorder(orderedIds)}
            />
          ) : (
            <ServerModsDiscoverSection
              configuredIds={configuredIds}
              disabledIds={disabledIds}
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
        busy={detail !== null && busyKey === detail.id}
        onClose={() => setDetail(null)}
        onOpenExternal={(target) => void openExternal(target)}
        onToggle={(id, enabled) => void toggle(id, enabled)}
        onAdd={(mod) => void add(mod)}
        onRemove={(id) => void remove(id).then((ok) => { if (ok) setDetail(null); })}
      />
    </AppSurfaceCard>
  );
}
