import {
  getServerFolderNameError,
  isValidServerFolderName,
  resolveServerInstallDir,
} from "@shared/server-install-path";
import { isOfficialMap, normalizeMapToken } from "@shared/map-identity";
import { MAP_NAME_COPY } from "@shared/map-name-copy";
import type { ServerProfile } from "@shared/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useUiDensity } from "@app/AppProviders";
import {
  listKnownClusterOptions,
  type KnownClusterOption,
} from "@features/clusters/knownClusterOptions";
import { showOperatorToast } from "@ui/operatorToast";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { openUnsavedLeaveModal } from "@features/server-workspace/openUnsavedLeaveModal";
import {
  serverFormToInput,
  toServerFormState,
  type ServerFormState,
} from "../components/ServerForm/serverFormModel";
import { applyMapsSearchToProfileFields, type MapsSearchApplyPayload } from "../components/ServerForm/mapsSearchModel";
import { listEnabledMapMods } from "../components/ServerForm/ServerFormMapField";

export interface UseServerFormOptions {
  initial: ServerProfile | null;
  onCancel: () => void;
  onSaved: (created?: ServerProfile) => void;
  defaultBaseFolder?: string | null;
  servers?: ServerProfile[];
  onOpenClusters?: () => void;
  extraClusterOptions?: KnownClusterOption[];
  onRegisterLeaveGuard?: (guard: ((action: () => void) => void) | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: (save: (() => Promise<boolean>) | null) => void;
  serverActive?: boolean;
  filesJobActive?: boolean;
  moveJobActive?: boolean;
  onOpenMoveInstall?: () => void;
}

export function useServerForm(options: UseServerFormOptions): {
  isCreate: boolean;
  inputSize: "xs" | "sm";
  state: ServerFormState;
  setState: Dispatch<SetStateAction<ServerFormState>>;
  isDirty: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  saving: boolean;
  setCreatePathIssue: (issue: string | null) => void;
  browsingField: "installDir" | "clusterDir" | null;
  moveDialogOpen: boolean;
  setMoveDialogOpen: (open: boolean) => void;
  knownClusters: ReturnType<typeof listKnownClusterOptions>;
  nameFolderError: string | null;
  resolvedInstallPreview: string;
  setField: (
    field: Exclude<keyof ServerFormState, "mapModId" | "autoStart">,
  ) => (value: string) => void;
  mapMods: ReturnType<typeof listEnabledMapMods>;
  mapFieldKey: string;
  browseDirectory: (field: "installDir" | "clusterDir") => Promise<void>;
  selectCreateCluster: (clusterId: string | null) => void;
  submit: () => Promise<boolean>;
  confirmLeaveIfDirty: (action: () => void) => void;
  revertProfile: () => void;
  openMove: () => void;
  applyMapsSearch: (payload: MapsSearchApplyPayload) => void;
  moveDisabled: boolean;
  moveDisabledReason: string;
  serverActive: boolean;
  filesJobActive: boolean;
  moveJobActive: boolean;
} {
  const { onRegisterLeaveGuard, onDirtyChange, onRegisterSave } = options;
  const isCreate = options.initial === null;
  const serverActive = options.serverActive === true;
  const filesJobActive = options.filesJobActive === true;
  const moveJobActive = options.moveJobActive === true;
  const density = useUiDensity();
  const inputSize: "xs" | "sm" = density === "compact" ? "xs" : "sm";
  const preferredCluster =
    options.extraClusterOptions?.length === 1
      ? options.extraClusterOptions[0]
      : undefined;
  const [state, setState] = useState<ServerFormState>(() =>
    toServerFormState(options.initial, options.defaultBaseFolder, preferredCluster),
  );
  const initialStateRef = useRef(state);
  const dirtyRef = useRef(false);
  const isDirty = Object.keys(state).some((key) => {
    const field = key as keyof ServerFormState;
    return state[field] !== initialStateRef.current[field];
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createPathIssue, setCreatePathIssue] = useState<string | null>(null);
  const [browsingField, setBrowsingField] = useState<"installDir" | "clusterDir" | null>(
    null,
  );
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const submitRef = useRef<() => Promise<boolean>>(async () => false);

  const confirmLeaveIfDirty = useCallback((action: () => void) => {
    if (!dirtyRef.current) {
      action();
      return;
    }
    openUnsavedLeaveModal({
      copy: {
        kind: "confirm",
        title: "Unsaved server changes",
        alertTitle: "Server form modified",
        message:
          "There are unsaved server profile changes. If you continue, they will be discarded.",
      },
      onDiscard: () => {
        dirtyRef.current = false;
        action();
      },
      onSave: async () => {
        const ok = await submitRef.current();
        if (!ok) return false;
        action();
        return true;
      },
    });
  }, []);

  useEffect(() => {
    onRegisterLeaveGuard?.(confirmLeaveIfDirty);
    return () => onRegisterLeaveGuard?.(null);
  }, [confirmLeaveIfDirty, onRegisterLeaveGuard]);

  useEffect(() => {
    dirtyRef.current = isDirty;
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);

  useEffect(() => {
    onRegisterSave?.(async () => submitRef.current());
    return () => onRegisterSave?.(null);
  }, [onRegisterSave]);

  const knownClusters = useMemo(
    () =>
      listKnownClusterOptions(options.servers ?? [], {
        extra: options.extraClusterOptions,
      }),
    [options.extraClusterOptions, options.servers],
  );

  const nameFolderError = useMemo(() => {
    if (state.name.trim().length === 0) {
      return null;
    }
    return getServerFolderNameError(state.name);
  }, [state.name]);

  const resolvedInstallPreview = useMemo(() => {
    if (!isCreate) {
      return state.installDir.trim();
    }
    if (
      state.installDir.trim().length === 0 ||
      state.name.trim().length === 0 ||
      !isValidServerFolderName(state.name)
    ) {
      return "";
    }
    return resolveServerInstallDir(state.installDir, state.name);
  }, [isCreate, state.installDir, state.name]);

  const setField =
    (field: Exclude<keyof ServerFormState, "mapModId" | "autoStart">) =>
    (value: string) => {
      setState((previous) => ({ ...previous, [field]: value }));
    };

  const mapMods = useMemo(
    () =>
      listEnabledMapMods({
        mods: state.mods,
        disabledMods: state.disabledMods,
        modMetadataCache: state.modMetadataCache,
      }),
    [state.disabledMods, state.modMetadataCache, state.mods],
  );

  const mapFieldKey = useMemo(() => {
    const disabled = [...state.disabledMods].sort().join(",");
    const meta = state.mods
      .map((id) => {
        const row = state.modMetadataCache[id];
        return `${id}:${row?.categories?.join(".") ?? ""}:${row?.summary ?? ""}:${row?.description ?? ""}`;
      })
      .join("|");
    return `${disabled}|${meta}`;
  }, [state.disabledMods, state.modMetadataCache, state.mods]);

  const applyMapsSearch = useCallback((payload: MapsSearchApplyPayload) => {
    setState((previous) => ({
      ...previous,
      ...applyMapsSearchToProfileFields({
        mods: previous.mods,
        disabledMods: previous.disabledMods,
        modMetadataCache: previous.modMetadataCache,
        payload,
      }),
    }));
  }, []);

  const browseDirectory = async (field: "installDir" | "clusterDir") => {
    setError(null);
    setBrowsingField(field);
    const current = state[field].trim();
    const result = await window.api.pickPath(
      "directory",
      current.length > 0 ? current : undefined,
      field === "installDir"
        ? isCreate
          ? "Select base folder (a subfolder named after the server will be created)"
          : "Select server install folder"
        : "Select shared cluster folder",
    );
    setBrowsingField(null);
    if (!result.ok) {
      setError(result.error ?? "Could not open folder picker");
      return;
    }
    if (result.data !== null) {
      setState((previous) => ({ ...previous, [field]: result.data }));
    }
  };

  const selectCreateCluster = (clusterId: string | null): void => {
    if (clusterId === null) {
      setState((previous) => ({
        ...previous,
        clusterId: "",
        clusterDir: "",
      }));
      return;
    }
    const selected = knownClusters.find((option) => option.clusterId === clusterId);
    if (selected === undefined) return;
    setState((previous) => ({
      ...previous,
      clusterId: selected.clusterId,
      clusterDir: selected.clusterDir,
    }));
  };

  const submit = async (): Promise<boolean> => {
    setError(null);
    const folderError = getServerFolderNameError(state.name);
    if (folderError !== null) {
      setError(folderError);
      return false;
    }
    const mapToken = normalizeMapToken(state.map);
    if (mapToken.length === 0) {
      setError("Map required");
      return false;
    }
    if (/\s/.test(mapToken)) {
      setError(MAP_NAME_COPY.mustNotContainSpaces);
      return false;
    }
    if (isCreate && !isOfficialMap(mapToken)) {
      const mapModId = state.mapModId?.trim() ?? "";
      if (
        mapModId.length === 0
        || !state.mods.includes(mapModId)
        || state.disabledMods.includes(mapModId)
      ) {
        setError(MAP_NAME_COPY.createNeedsSearchMaps);
        return false;
      }
    }
    if (!isOfficialMap(mapToken) && !mapToken.includes("_WP")) {
      setError(MAP_NAME_COPY.customUsuallyEndsWp);
      return false;
    }
    if (isCreate && createPathIssue !== null) {
      setError(createPathIssue);
      return false;
    }
    setSaving(true);
    return runWithFinally(
      async () => {
        const input = serverFormToInput(state, isCreate, options.initial);
        const result =
          options.initial === null
            ? await window.api.createServer(input)
            : await window.api.updateServer(options.initial.id, input);
        if (result.ok) {
          initialStateRef.current = state;
          dirtyRef.current = false;
          onDirtyChange?.(false);
          if (options.initial === null) {
            showOperatorToast({
              title: "Server created",
              message: `"${input.name}" is ready to configure.`,
            });
            options.onSaved(result.data);
            return true;
          }
          showOperatorToast({
            title: "Server saved",
            message: `"${input.name}" profile updated.`,
          });
          options.onSaved();
          return true;
        }
        setError(result.error ?? "Could not save the server");
        return false;
      },
      () => {
        setSaving(false);
      },
    );
  };

  useEffect(() => {
    submitRef.current = submit;
  });

  const revertProfile = (): void => {
    setState(initialStateRef.current);
    dirtyRef.current = false;
    onDirtyChange?.(false);
    setError(null);
  };

  const openMove = (): void => {
    if (options.onOpenMoveInstall !== undefined) {
      options.onOpenMoveInstall();
      return;
    }
    setMoveDialogOpen(true);
  };

  const moveDisabled = serverActive || filesJobActive || moveJobActive;
  const moveDisabledReason = serverActive
    ? "Stop the server before moving the installation"
    : moveJobActive
      ? "Wait for the current move to finish"
      : filesJobActive
        ? "Wait for the current files job to finish"
        : "Copy, verify, and commit a new install path";

  return {
    isCreate,
    inputSize,
    state,
    setState,
    isDirty,
    error,
    setError,
    saving,
    setCreatePathIssue,
    browsingField,
    moveDialogOpen,
    setMoveDialogOpen,
    knownClusters,
    nameFolderError,
    resolvedInstallPreview,
    setField,
    mapMods,
    mapFieldKey,
    browseDirectory,
    selectCreateCluster,
    submit,
    confirmLeaveIfDirty,
    revertProfile,
    openMove,
    applyMapsSearch,
    moveDisabled,
    moveDisabledReason,
    serverActive,
    filesJobActive,
    moveJobActive,
  };
}
