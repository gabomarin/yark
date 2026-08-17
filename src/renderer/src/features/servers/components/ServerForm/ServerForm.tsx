import type { ReactElement } from "react";
import { MagicWand } from "@phosphor-icons/react";
import { Alert, Button, Group, Stack, Text, Title } from "@mantine/core";
import {
  getServerFolderNameError,
  isValidServerFolderName,
  resolveServerInstallDir,
} from "@shared/server-install-path";
import { isOfficialMap, normalizeMapToken } from "@shared/map-identity";
import type { ServerProfile } from "@shared/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUiDensity } from "@app/AppProviders";
import {
  listKnownClusterOptions,
  type KnownClusterOption,
} from "@features/clusters/knownClusterOptions";
import { showOperatorToast } from "@ui/operatorToast";
import {
  serverFormToInput,
  toServerFormState,
  type ServerFormState,
} from "./serverFormModel";
import { listEnabledMapMods } from "./ServerFormMapField";
import { ServerFormAlerts } from "./ServerFormAlerts";
import { ServerFormProfileFields } from "./ServerFormProfileFields";
import { ServerFormShellPage } from "./ServerFormShellPage";
import { openUnsavedLeaveModal } from "@features/server-workspace/openUnsavedLeaveModal";
import { MoveInstallDialog } from "../MoveInstallDialog/MoveInstallDialog";
import classes from "./ServerForm.module.css";

interface Props {
  initial: ServerProfile | null;
  onCancel: () => void;
  /** After create, receives the profile; after edit, no argument. */
  onSaved: (created?: ServerProfile) => void;
  /** Prefills base folder on create when set in Settings. */
  defaultBaseFolder?: string | null;
  /** Fleet profiles — create cluster picker + live port-conflict preview (#178). */
  servers?: ServerProfile[];
  /** Opens Clusters (create flow) when the fleet has no clusters yet. */
  onOpenClusters?: () => void;
  /** Extra cluster picker rows (first-run setup synthetic cluster). */
  extraClusterOptions?: KnownClusterOption[];
  /** Register a dirty-leave guard for app-shell navigation while this form is open. */
  onRegisterLeaveGuard?: (guard: ((action: () => void) => void) | null) => void;
  /** Workspace composer: profile dirty without replacing the INI leave guard. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Workspace leave modal: save profile then continue. */
  onRegisterSave?: (save: (() => Promise<boolean>) | null) => void;
  /** `embedded` = workspace tab (no full-page header). */
  variant?: "page" | "embedded";
  /** Server in starting/running/stopping, or SteamCMD files job → path / ops lock. */
  serverActive?: boolean;
  /** SteamCMD job specifically — warning copy (ops already covered by serverActive). */
  filesJobActive?: boolean;
  /** Move installation in progress for this server. */
  moveJobActive?: boolean;
  /**
   * When set (workspace), open Move from the parent so the dialog survives
   * ServerForm remounts after profile refresh.
   */
  onOpenMoveInstall?: () => void;
  onOpenConfigurationAssistant?: () => void;
  configurationAssistantDisabled?: boolean;
}

export function ServerForm(props: Props): ReactElement {
  const isCreate = props.initial === null;
  const embedded = props.variant === "embedded";
  const serverActive = props.serverActive === true;
  const filesJobActive = props.filesJobActive === true;
  const moveJobActive = props.moveJobActive === true;
  const density = useUiDensity();
  const inputSize: "xs" | "sm" = density === "compact" ? "xs" : "sm";
  const preferredCluster =
    props.extraClusterOptions?.length === 1 ? props.extraClusterOptions[0] : undefined;
  const [state, setState] = useState<ServerFormState>(() =>
    toServerFormState(props.initial, props.defaultBaseFolder, preferredCluster),
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
  const [browsingField, setBrowsingField] = useState<"installDir" | "clusterDir" | null>(null);
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
    props.onRegisterLeaveGuard?.(confirmLeaveIfDirty);
    return () => props.onRegisterLeaveGuard?.(null);
  }, [confirmLeaveIfDirty, props.onRegisterLeaveGuard]);

  useEffect(() => {
    dirtyRef.current = isDirty;
    props.onDirtyChange?.(isDirty);
  }, [isDirty, props.onDirtyChange]);

  useEffect(() => {
    return () => props.onDirtyChange?.(false);
  }, [props.onDirtyChange]);

  useEffect(() => {
    props.onRegisterSave?.(async () => submitRef.current());
    return () => props.onRegisterSave?.(null);
  }, [props.onRegisterSave]);

  const knownClusters = useMemo(
    () =>
      listKnownClusterOptions(props.servers ?? [], {
        extra: props.extraClusterOptions,
      }),
    [props.extraClusterOptions, props.servers],
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
        mods: props.initial?.mods ?? [],
        disabledMods: props.initial?.disabledMods,
        modMetadataCache: props.initial?.modMetadataCache,
      }),
    [
      props.initial?.disabledMods,
      props.initial?.modMetadataCache,
      props.initial?.mods,
    ],
  );

  const mapFieldKey = useMemo(() => {
    const mods = props.initial?.mods ?? [];
    const disabled = [...(props.initial?.disabledMods ?? [])].sort().join(",");
    const cache = props.initial?.modMetadataCache ?? {};
    const meta = mods
      .map((id) => {
        const row = cache[id];
        return `${id}:${row?.categories?.join(".") ?? ""}:${row?.summary ?? ""}:${row?.description ?? ""}`;
      })
      .join("|");
    return `${disabled}|${meta}`;
  }, [
    props.initial?.disabledMods,
    props.initial?.modMetadataCache,
    props.initial?.mods,
  ]);

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
      setError("Map token must not contain spaces");
      return false;
    }
    if (isCreate && !isOfficialMap(mapToken)) {
      setError("New servers must use an official map");
      return false;
    }
    if (!isOfficialMap(mapToken) && !mapToken.includes("_WP")) {
      setError("Custom map token usually ends with _WP (example: Svartalfheim_WP)");
      return false;
    }
    if (isCreate && createPathIssue !== null) {
      setError(createPathIssue);
      return false;
    }
    setSaving(true);
    try {
      const input = serverFormToInput(state, isCreate, props.initial);
      const result =
        props.initial === null
          ? await window.api.createServer(input)
          : await window.api.updateServer(props.initial.id, input);
      if (result.ok) {
        initialStateRef.current = state;
        dirtyRef.current = false;
        props.onDirtyChange?.(false);
        if (props.initial === null) {
          showOperatorToast({
            title: "Server created",
            message: `"${input.name}" is ready to configure.`,
          });
          props.onSaved(result.data);
          return true;
        }
        showOperatorToast({
          title: "Server saved",
          message: `"${input.name}" profile updated.`,
        });
        props.onSaved();
        return true;
      }
      setError(result.error ?? "Could not save the server");
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    submitRef.current = submit;
  });

  const revertProfile = (): void => {
    setState(initialStateRef.current);
    dirtyRef.current = false;
    props.onDirtyChange?.(false);
    setError(null);
  };

  const openMove = (): void => {
    if (props.onOpenMoveInstall !== undefined) {
      props.onOpenMoveInstall();
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

  const profileFields = (
    <ServerFormProfileFields
      isCreate={isCreate}
      embedded={embedded}
      inputSize={inputSize}
      name={state.name}
      sessionName={state.sessionName}
      map={state.map}
      mapModId={state.mapModId}
      mapSaveFolder={state.mapSaveFolder}
      installDir={state.installDir}
      gamePort={state.gamePort}
      queryPort={state.queryPort}
      rconPort={state.rconPort}
      maxPlayers={state.maxPlayers}
      serverPassword={state.serverPassword}
      adminPassword={state.adminPassword}
      clusterId={state.clusterId}
      clusterDir={state.clusterDir}
      nameFolderError={nameFolderError}
      resolvedInstallPreview={resolvedInstallPreview}
      servers={props.servers ?? []}
      knownClusters={knownClusters}
      mapMods={mapMods}
      mapFieldKey={mapFieldKey}
      browsingInstallDir={browsingField === "installDir"}
      browsingClusterDir={browsingField === "clusterDir"}
      excludeServerId={isCreate ? undefined : props.initial?.id}
      showStartup={!isCreate}
      autoStart={state.autoStart}
      showInactiveWarning={props.initial?.enabled === false && state.autoStart}
      moveDisabled={isCreate ? true : moveDisabled}
      moveDisabledReason={moveDisabledReason}
      onNameChange={setField("name")}
      onSessionNameChange={setField("sessionName")}
      onMapChange={(next) =>
        setState((previous) => ({
          ...previous,
          map: next.map,
          mapModId: next.mapModId,
          mapSaveFolder: next.mapSaveFolder,
        }))
      }
      onInstallDirChange={setField("installDir")}
      onBrowseInstallDir={() => void browseDirectory("installDir")}
      onCreatePathIssueChange={setCreatePathIssue}
      onOpenMove={openMove}
      onGamePortChange={setField("gamePort")}
      onQueryPortChange={setField("queryPort")}
      onRconPortChange={setField("rconPort")}
      onMaxPlayersChange={setField("maxPlayers")}
      onServerPasswordChange={setField("serverPassword")}
      onAdminPasswordChange={setField("adminPassword")}
      onSelectCreateCluster={selectCreateCluster}
      onOpenClusters={props.onOpenClusters}
      onBrowseClusterDir={() => void browseDirectory("clusterDir")}
      onClusterIdChange={setField("clusterId")}
      onClusterDirChange={setField("clusterDir")}
      onAutoStartChange={(autoStart) =>
        setState((previous) => ({ ...previous, autoStart }))
      }
    />
  );

  const errorAlert =
    error !== null ? <Alert color="red">{error}</Alert> : null;

  const moveDialog =
    props.initial !== null && props.onOpenMoveInstall === undefined ? (
      <MoveInstallDialog
        opened={moveDialogOpen}
        server={props.initial}
        servers={props.servers}
        onClose={() => setMoveDialogOpen(false)}
        onMoved={() => {
          props.onSaved();
        }}
      />
    ) : null;

  if (!embedded) {
    return (
      <>
        <ServerFormShellPage
          formKind={isCreate ? "create" : "edit"}
          title={isCreate ? "New server" : `Edit: ${props.initial!.name}`}
          subtitle="Identity, reachability, and optional cluster."
          submitLabel={isCreate ? "Create server" : "Save changes"}
          submitSize={inputSize}
          saving={saving}
          onSubmit={() => void submit()}
          onCancel={() => confirmLeaveIfDirty(props.onCancel)}
        >
          {!isCreate && (
            <ServerFormAlerts
              filesJobActive={filesJobActive}
              moveJobActive={moveJobActive}
              serverActive={serverActive}
            />
          )}
          {errorAlert}
          {profileFields}
        </ServerFormShellPage>
        {moveDialog}
      </>
    );
  }

  return (
    <div className={classes.embedded} data-server-form="embedded">
      <header className={classes.embeddedHeader}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <div>
            <Title order={4}>Server information</Title>
            <Text c="dimmed" fz="xs">
              Name, ports, access, and cluster. Launch flags live on the Launch tab.
            </Text>
          </div>
          {props.onOpenConfigurationAssistant !== undefined && (
            <Button
              size={inputSize}
              variant="light"
              leftSection={<MagicWand size={16} />}
              onClick={props.onOpenConfigurationAssistant}
              disabled={props.configurationAssistantDisabled}
              title={
                props.configurationAssistantDisabled
                  ? "Save or discard pending INI Files changes"
                  : "Configure the most common settings with a wizard"
              }
            >
              Configuration wizard
            </Button>
          )}
        </Group>
      </header>
      <div className={classes.embeddedScroll} data-server-form-scroll>
        <Stack gap="md">
          <ServerFormAlerts
            filesJobActive={filesJobActive}
            moveJobActive={moveJobActive}
            serverActive={serverActive}
          />
          {errorAlert}
          {profileFields}
        </Stack>
      </div>
      <footer className={classes.embeddedFooter}>
        <Group justify="flex-end">
          {isDirty && (
            <Button
              size={inputSize}
              variant="default"
              onClick={revertProfile}
              disabled={saving}
            >
              Cancel
            </Button>
          )}
          <Button
            size={inputSize}
            onClick={() => void submit()}
            loading={saving}
          >
            Save changes
          </Button>
        </Group>
      </footer>
      {moveDialog}
    </div>
  );
}
