import type { ReactElement } from "react";
import { Alert, SegmentedControl, Stack } from "@mantine/core";
import type { ModMetadata, ModSearchPage, ServerProfile } from "@shared/types";
import { prepareModAddApply, type ModAddImportProgress } from "@shared/mod-add-input";
import { useEffect, useMemo, useRef, useState } from "react";
import { ServerModDetailDrawer } from "./ServerModDetailDrawer";
import { ServerModsDiscoverSection } from "./ServerModsDiscoverSection";
import { ServerModsHeader } from "./ServerModsHeader";
import { ServerModsServerSection } from "./ServerModsServerSection";
import {
  buildDiscoveryRows,
  buildServerRows,
  mergeMissingMetadata,
  mergeMetadata,
  metadataMap,
  modsMetadataSyncKey,
  sameIdList,
  toProfileInput,
  type ModRow,
} from "./serverModsModel";
import { createServerModsListMutations } from "./serverModsListMutations";
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
  configuredIdsRef.current = configuredIds;
  disabledIdsRef.current = disabledIds;
  serverRef.current = props.server;
  const cacheRef = useRef(props.server.modMetadataCache ?? {});
  const [metadata, setMetadata] = useState<Map<string, ModMetadata>>(
    () => metadataMap(props.server.modMetadataCache),
  );
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<ModSearchPage | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
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
  }, [props.server.id]);

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
  }, [
    props.server.mods.join("\0"),
    (props.server.disabledMods ?? []).join("\0"),
    modsMetadataSyncKey(props.server.modMetadataCache),
  ]);

  useEffect(() => {
    const missingIds = configuredIds.filter((id) => !metadata.has(id));
    if (missingIds.length === 0) return;
    let alive = true;
    void window.api.getModsMetadata(missingIds).then((result) => {
      if (!alive) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMetadata((previous) => mergeMissingMetadata(previous, result.data));
    });
    return () => {
      alive = false;
    };
  }, [configuredIds, props.server.id]);

  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds]);
  const activeCount = configuredIds.filter((id) => !disabledSet.has(id)).length;
  const serverRows = useMemo(
    () => buildServerRows(configuredIds, disabledSet, metadata),
    [configuredIds, disabledSet, metadata],
  );
  const discoveryRows = useMemo(
    () => buildDiscoveryRows(configuredIds, disabledSet, metadata, catalog),
    [catalog, configuredIds, disabledSet, metadata],
  );

  const persist = async (
    nextIds: string[],
    nextDisabled: string[],
    nextCache: Record<string, ModMetadata>,
  ) => {
    // Snapshot profile at call time so the write does not pick up a mid-flight
    // workspace switch; after await, skip local apply if we left that server.
    const server = serverRef.current;
    const targetServerId = server.id;
    const result = await window.api.updateServer(
      targetServerId,
      toProfileInput(server, nextIds, nextDisabled, nextCache),
    );
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

  const addDetail = async (modDetail: ModMetadata) => {
    const isNew = !configuredIds.includes(modDetail.id);
    const nextIds = isNew ? [...configuredIds, modDetail.id] : configuredIds;
    // New mods start disabled; re-adding an existing row keeps enable state.
    const nextDisabled = isNew
      ? [...new Set([...disabledIds, modDetail.id])]
      : disabledIds;
    const nextCache = { ...cacheRef.current, [modDetail.id]: modDetail };
    await persist(nextIds, nextDisabled, nextCache);
  };

  const searchCatalog = async () => {
    setSearching(true);
    setError(null);
    setWarning(null);
    try {
      const result = await window.api.searchMods(query);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCatalog(result.data);
    } finally {
      setSearching(false);
    }
  };

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
      await addDetail(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the mod");
    } finally {
      setBusyKey(null);
    }
  };

  const { toggle, remove, reorder } = createServerModsListMutations({
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
    <div className={classes.root}>
      <ServerModsHeader activeCount={activeCount} />
      <div className={classes.content}>
        <Stack gap="md">
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
            <Alert color="red" withCloseButton onClose={() => setError(null)}>
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
              query={query}
              searching={searching}
              busyKey={busyKey}
              rows={discoveryRows}
              onQueryChange={setQuery}
              onSearch={() => void searchCatalog()}
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
        onClose={() => setDetail(null)}
        onOpenExternal={(target) => void openExternal(target)}
      />
    </div>
  );
}
