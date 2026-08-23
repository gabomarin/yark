import type { ReactElement } from "react";
import { Alert } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import type { KnownClusterOption } from "@features/clusters/knownClusterOptions";
import { ServerFormAlerts } from "./ServerFormAlerts";
import { ServerFormEmbedded } from "./ServerFormEmbedded";
import { ServerFormProfileFields } from "./ServerFormProfileFields";
import { ServerFormShellPage } from "./ServerFormShellPage";
import { useServerForm } from "./useServerForm";
import { MoveInstallDialog } from "../MoveInstallDialog/MoveInstallDialog";

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
  const embedded = props.variant === "embedded";
  const form = useServerForm(props);
  const { state, setState, setField, isCreate } = form;

  const profileFields = (
    <ServerFormProfileFields
      isCreate={isCreate}
      embedded={embedded}
      inputSize={form.inputSize}
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
      nameFolderError={form.nameFolderError}
      resolvedInstallPreview={form.resolvedInstallPreview}
      servers={props.servers ?? []}
      knownClusters={form.knownClusters}
      mapMods={form.mapMods}
      mapFieldKey={form.mapFieldKey}
      browsingInstallDir={form.browsingField === "installDir"}
      browsingClusterDir={form.browsingField === "clusterDir"}
      excludeServerId={isCreate ? undefined : props.initial?.id}
      showStartup={!isCreate}
      autoStart={state.autoStart}
      showInactiveWarning={props.initial?.enabled === false && state.autoStart}
      moveDisabled={isCreate ? true : form.moveDisabled}
      moveDisabledReason={form.moveDisabledReason}
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
      onBrowseInstallDir={() => void form.browseDirectory("installDir")}
      onCreatePathIssueChange={form.setCreatePathIssue}
      onOpenMove={form.openMove}
      onGamePortChange={setField("gamePort")}
      onQueryPortChange={setField("queryPort")}
      onRconPortChange={setField("rconPort")}
      onMaxPlayersChange={setField("maxPlayers")}
      onServerPasswordChange={setField("serverPassword")}
      onAdminPasswordChange={setField("adminPassword")}
      onSelectCreateCluster={form.selectCreateCluster}
      onOpenClusters={props.onOpenClusters}
      onBrowseClusterDir={() => void form.browseDirectory("clusterDir")}
      onClusterIdChange={setField("clusterId")}
      onClusterDirChange={setField("clusterDir")}
      onAutoStartChange={(autoStart) =>
        setState((previous) => ({ ...previous, autoStart }))
      }
    />
  );

  const errorAlert =
    form.error !== null ? <Alert color="red">{form.error}</Alert> : null;

  const moveDialog =
    props.initial !== null && props.onOpenMoveInstall === undefined ? (
      <MoveInstallDialog
        opened={form.moveDialogOpen}
        server={props.initial}
        servers={props.servers}
        onClose={() => form.setMoveDialogOpen(false)}
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
          submitLabel={isCreate ? "Create server" : "Save changes"}
          submitSize={form.inputSize}
          saving={form.saving}
          onSubmit={() => void form.submit()}
          onCancel={() => form.confirmLeaveIfDirty(props.onCancel)}
        >
          {!isCreate && (
            <ServerFormAlerts
              filesJobActive={form.filesJobActive}
              moveJobActive={form.moveJobActive}
              serverActive={form.serverActive}
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
    <ServerFormEmbedded
      inputSize={form.inputSize}
      isDirty={form.isDirty}
      saving={form.saving}
      filesJobActive={form.filesJobActive}
      moveJobActive={form.moveJobActive}
      serverActive={form.serverActive}
      errorAlert={errorAlert}
      profileFields={profileFields}
      moveDialog={moveDialog}
      onOpenConfigurationAssistant={props.onOpenConfigurationAssistant}
      configurationAssistantDisabled={props.configurationAssistantDisabled}
      onRevert={form.revertProfile}
      onSubmit={() => void form.submit()}
    />
  );
}
