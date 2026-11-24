import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ModMetadata, ServerProfile } from "@shared/types";
import { mergeMetadata, metadataMap, modsMetadataSyncKey, sameIdList } from "./serverModsModel";

/**
 * Local inventory mirrors of the server profile (mods / disabled / passive / cache).
 * Resets lists on server switch; content-key sync ignores poll identity churn.
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
} {
  const [configuredIds, setConfiguredIds] = useState(server.mods);
  const [disabledIds, setDisabledIds] = useState(server.disabledMods ?? []);
  const [passiveIds, setPassiveIds] = useState(server.passiveMods ?? []);
  const configuredIdsRef = useRef(configuredIds);
  const disabledIdsRef = useRef(disabledIds);
  const passiveIdsRef = useRef(passiveIds);
  const serverRef = useRef(server);
  const cacheRef = useRef(server.modMetadataCache ?? {});
  const [metadata, setMetadata] = useState<Map<string, ModMetadata>>(() => metadataMap(server.modMetadataCache));

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
    const nextMods = server.mods;
    const nextDisabled = server.disabledMods ?? [];
    const nextPassive = server.passiveMods ?? [];
    const nextCache = server.modMetadataCache ?? {};
    setConfiguredIds((previous) => (sameIdList(previous, nextMods) ? previous : nextMods));
    setDisabledIds((previous) => (sameIdList(previous, nextDisabled) ? previous : nextDisabled));
    setPassiveIds((previous) => (sameIdList(previous, nextPassive) ? previous : nextPassive));
    cacheRef.current = nextCache;
    setMetadata((previous) => mergeMetadata(previous, nextCache));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional content keys
  }, [modsKey, disabledModsKey, passiveModsKey, metadataCacheKey]);

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
  };
}
