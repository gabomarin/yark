import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { ModMetadata, ServerProfile } from "@shared/types";
import { mergeMetadata, metadataMap, modsMetadataSyncKey, sameIdList } from "./serverModsModel";

/**
 * Local inventory mirrors of the server profile (mods / disabled / passive / cache).
 * Resets lists on server switch; content-key sync ignores poll identity churn.
 * Optimistic list writes pause content sync (via {@link profileSyncPausedRef}) so a
 * stale poll cannot clobber the mirror or break sameIdSet rollback (#635 / OCR).
 * Workspace chrome (view / catalog / detail) stays in the panel.
 */
export function useServerModsProfileState(server: ServerProfile): {
  configuredIds: string[];
  setConfiguredIds: Dispatch<SetStateAction<string[]>>;
  disabledIds: string[];
  setDisabledIds: Dispatch<SetStateAction<string[]>>;
  passiveIds: string[];
  setPassiveIds: Dispatch<SetStateAction<string[]>>;
  configuredIdsRef: MutableRefObject<string[]>;
  disabledIdsRef: MutableRefObject<string[]>;
  passiveIdsRef: MutableRefObject<string[]>;
  serverRef: MutableRefObject<ServerProfile>;
  cacheRef: MutableRefObject<Record<string, ModMetadata>>;
  metadata: Map<string, ModMetadata>;
  setMetadata: Dispatch<SetStateAction<Map<string, ModMetadata>>>;
  /** Mutations set true synchronously before optimistic mirror writes. */
  profileSyncPausedRef: MutableRefObject<boolean>;
  /** After clearing the pause, flush any poll snapshot deferred while paused. */
  flushProfileSync: () => void;
} {
  const [configuredIds, setConfiguredIds] = useState(server.mods);
  const [disabledIds, setDisabledIds] = useState(server.disabledMods ?? []);
  const [passiveIds, setPassiveIds] = useState(server.passiveMods ?? []);
  const configuredIdsRef = useRef(configuredIds);
  const disabledIdsRef = useRef(disabledIds);
  const passiveIdsRef = useRef(passiveIds);
  const serverRef = useRef(server);
  const cacheRef = useRef(server.modMetadataCache ?? {});
  const profileSyncPausedRef = useRef(false);
  /** True when a content-key effect ran while paused and still needs applying. */
  const deferredProfileSyncRef = useRef(false);
  const [profileSyncGate, setProfileSyncGate] = useState(0);
  const [metadata, setMetadata] = useState<Map<string, ModMetadata>>(() => metadataMap(server.modMetadataCache));

  const flushProfileSync = useCallback(() => {
    if (!deferredProfileSyncRef.current) return;
    setProfileSyncGate((n) => n + 1);
  }, []);

  useEffect(() => {
    configuredIdsRef.current = configuredIds;
    disabledIdsRef.current = disabledIds;
    passiveIdsRef.current = passiveIds;
    serverRef.current = server;
  });

  useEffect(() => {
    const nextCache = server.modMetadataCache ?? {};
    setConfiguredIds(server.mods);
    setDisabledIds(server.disabledMods ?? []);
    setPassiveIds(server.passiveMods ?? []);
    cacheRef.current = nextCache;
    setMetadata(metadataMap(nextCache));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on server id change only
  }, [server.id]);

  const modsKey = server.mods.join("\0");
  const disabledModsKey = (server.disabledMods ?? []).join("\0");
  const passiveModsKey = (server.passiveMods ?? []).join("\0");
  const metadataCacheKey = modsMetadataSyncKey(server.modMetadataCache);

  useEffect(() => {
    if (profileSyncPausedRef.current) {
      deferredProfileSyncRef.current = true;
      return;
    }
    deferredProfileSyncRef.current = false;
    const nextMods = server.mods;
    const nextDisabled = server.disabledMods ?? [];
    const nextPassive = server.passiveMods ?? [];
    const nextCache = server.modMetadataCache ?? {};
    setConfiguredIds((previous) => (sameIdList(previous, nextMods) ? previous : nextMods));
    setDisabledIds((previous) => (sameIdList(previous, nextDisabled) ? previous : nextDisabled));
    setPassiveIds((previous) => (sameIdList(previous, nextPassive) ? previous : nextPassive));
    cacheRef.current = nextCache;
    setMetadata((previous) => mergeMetadata(previous, nextCache));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional content keys + resume gate
  }, [modsKey, disabledModsKey, passiveModsKey, metadataCacheKey, profileSyncGate]);

  return {
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
  };
}
