import type { ReactElement } from "react";
import {
  ArrowLeft,
  FloppyDisk,
  MagicWand,
} from "@phosphor-icons/react";
import {
  Alert,
  Button,
  Card,
  Group,
  NumberInput,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  getServerFolderNameError,
  isValidServerFolderName,
  resolveServerInstallDir,
} from "@shared/server-install-path";
import { isOfficialMap, normalizeMapToken } from "@shared/map-identity";
import { KNOWN_MAPS, type ServerProfile, type ServerProfileInput } from "@shared/types";
import { useMemo, useState } from "react";
import { useUiDensity } from "@app/AppProviders";
import { listKnownClusterOptions } from "@features/clusters/knownClusterOptions";
import { ServerFormInstallPath } from "./ServerFormInstallPath";
import {
  listEnabledMapMods,
  ServerFormMapField,
} from "./ServerFormMapField";
import { ServerFormStartupFields } from "./ServerFormStartupFields";
import { ServerFormClusterFields } from "./ServerFormClusterFields";
import { ServerFormPortConflictAlert } from "./ServerFormPortConflictAlert";
import { ServerFormSection } from "./ServerFormSection";
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

interface FormState {
  name: string;
  map: string;
  mapModId: string | null;
  installDir: string;
  sessionName: string;
  gamePort: string;
  queryPort: string;
  rconPort: string;
  serverPassword: string;
  adminPassword: string;
  clusterId: string;
  clusterDir: string;
  autoStart: boolean;
}

function toFormState(
  profile: ServerProfile | null,
  defaultBaseFolder?: string | null,
): FormState {
  if (profile === null) {
    const base = defaultBaseFolder?.trim() ?? "";
    return {
      name: "",
      map: KNOWN_MAPS[0],
      mapModId: null,
      installDir: base,
      sessionName: "",
      gamePort: "7777",
      queryPort: "27015",
      rconPort: "27020",
      serverPassword: "",
      adminPassword: "",
      clusterId: "",
      clusterDir: "",
      autoStart: false,
    };
  }

  return {
    name: profile.name,
    map: profile.map,
    mapModId: profile.mapModId ?? null,
    installDir: profile.installDir,
    sessionName: profile.sessionName,
    gamePort: String(profile.gamePort),
    queryPort: String(profile.queryPort),
    rconPort: String(profile.rconPort),
    serverPassword: profile.serverPassword ?? "",
    adminPassword: profile.adminPassword,
    clusterId: profile.clusterId ?? "",
    clusterDir: profile.clusterDir ?? "",
    autoStart: profile.autoStart,
  };
}

function toInput(
  state: FormState,
  isCreate: boolean,
  initial: ServerProfile | null,
): ServerProfileInput {
  const name = state.name.trim();
  const baseOrInstall = state.installDir.trim();
  return {
    name,
    map: state.map.trim(),
    mapModId: state.mapModId,
    installDir: isCreate
      ? resolveServerInstallDir(baseOrInstall, name)
      : baseOrInstall,
    sessionName: state.sessionName.trim(),
    gamePort: Number(state.gamePort),
    queryPort: Number(state.queryPort),
    rconPort: Number(state.rconPort),
    serverPassword:
      state.serverPassword.trim().length > 0 ? state.serverPassword.trim() : null,
    adminPassword: state.adminPassword,
    clusterId: state.clusterId.trim().length > 0 ? state.clusterId.trim() : null,
    clusterDir: state.clusterDir.trim().length > 0 ? state.clusterDir.trim() : null,
    // Mods / launch args live on their workspace tabs; preserve on edit.
    extraArgs: initial?.extraArgs ?? [],
    structuredLaunchArgs: initial?.structuredLaunchArgs ?? {},
    mods: initial?.mods ?? [],
    disabledMods: initial?.disabledMods ?? [],
    modMetadataCache: initial?.modMetadataCache ?? {},
    autoStart: state.autoStart,
  };
}

export function ServerForm(props: Props): ReactElement {
  const isCreate = props.initial === null;
  const embedded = props.variant === "embedded";
  const serverActive = props.serverActive === true;
  const filesJobActive = props.filesJobActive === true;
  const moveJobActive = props.moveJobActive === true;
  const density = useUiDensity();
  /** Comfortable matches prior Mantine `sm`; Compact steps to `xs`. */
  const inputSize: "xs" | "sm" = density === "compact" ? "xs" : "sm";
  const [state, setState] = useState<FormState>(() =>
    toFormState(props.initial, props.defaultBaseFolder),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [browsingField, setBrowsingField] = useState<"installDir" | "clusterDir" | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);

  const knownClusters = useMemo(
    () => listKnownClusterOptions(props.servers ?? []),
    [props.servers],
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
    (field: Exclude<keyof FormState, "mapModId" | "autoStart">) =>
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

  /** Remount only the Map control when Mods list/metadata changes (not the whole form). */
  const mapFieldKey = useMemo(() => {
    const mods = props.initial?.mods ?? [];
    const disabled = [...(props.initial?.disabledMods ?? [])].sort().join(",");
    const cache = props.initial?.modMetadataCache ?? {};
    const meta = mods
      .map((id) => {
        const row = cache[id];
        return `${id}:${row?.categories?.join(".") ?? ""}:${row?.description?.length ?? 0}`;
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

  const submit = async () => {
    setError(null);
    const folderError = getServerFolderNameError(state.name);
    if (folderError !== null) {
      setError(folderError);
      return;
    }
    const mapToken = normalizeMapToken(state.map);
    if (mapToken.length === 0) {
      setError("Map required");
      return;
    }
    if (/\s/.test(mapToken)) {
      setError("Map name must not contain spaces");
      return;
    }
    if (!isOfficialMap(mapToken) && !mapToken.includes("_WP")) {
      setError("Custom map name usually ends with _WP (example: Svartalfheim_WP)");
      return;
    }
    setSaving(true);
    try {
      const input = toInput(state, isCreate, props.initial);
      const result =
        props.initial === null
          ? await window.api.createServer(input)
          : await window.api.updateServer(props.initial.id, input);
      if (result.ok) {
        props.onSaved(props.initial === null ? result.data : undefined);
        return;
      }
      setError(result.error ?? "Could not save the server");
    } finally {
      setSaving(false);
    }
  };

  const formBody = (
    <Stack gap={embedded ? "md" : "lg"}>
      {!embedded && (
        <Group justify="space-between" align="flex-start" className={classes.pageHeader}>
          <div>
            <Title order={2}>{isCreate ? "New server" : `Edit: ${props.initial!.name}`}</Title>
            <Text c="dimmed">Configure identity, network, access, and cluster.</Text>
          </div>
          <Group gap="xs">
            <Button variant="subtle" leftSection={<ArrowLeft size={16} />} onClick={props.onCancel}>
              Back
            </Button>
            <Button
              size={inputSize}
              leftSection={<FloppyDisk size={16} />}
              onClick={() => void submit()}
              loading={saving}
            >
              Save
            </Button>
          </Group>
        </Group>
      )}

      {embedded && (
        <Group justify="space-between" align="flex-start" className={classes.embeddedHeader}>
          <div>
            <Title order={4}>Server information</Title>
            <Text c="dimmed" fz="xs">
              Name, ports, access, and cluster. Launch flags live on the Launch tab.
            </Text>
          </div>
          <Group gap="xs">
            {props.onOpenConfigurationAssistant !== undefined && (
              <Button
                size="sm"
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
            <Button
              size="sm"
              leftSection={<FloppyDisk size={16} />}
              onClick={() => void submit()}
              loading={saving}
            >
              Save
            </Button>
          </Group>
        </Group>
      )}

      {filesJobActive && (
        <Alert color="yellow" title="Updating server files">
          You can save profile settings now. Wait until the file update finishes
          before starting Move installation.
        </Alert>
      )}

      {moveJobActive && (
        <Alert color="yellow" title="Moving installation">
          Wait until the move finishes before starting or updating this server.
        </Alert>
      )}

      {serverActive && !filesJobActive && !moveJobActive && (
        <Alert color="yellow" title="Server is running">
          You can save changes now; they will apply after the server restarts.
        </Alert>
      )}

      {error !== null && <Alert color="red">{error}</Alert>}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={embedded ? "md" : "lg"}>
        <ServerFormSection title="Identity" flat={embedded}>
          <TextInput
            label="Name"
            size={inputSize}
            value={state.name}
            onChange={(e) => setField("name")(e.currentTarget.value)}
            required
            error={nameFolderError ?? undefined}
            description={
              isCreate
                ? 'Also used as the subfolder name. Do not use < > : " / \\ | ? *'
                : undefined
            }
          />
          <TextInput
            label="Session name"
            size={inputSize}
            value={state.sessionName}
            onChange={(e) => setField("sessionName")(e.currentTarget.value)}
            required
          />
          <ServerFormMapField
            key={mapFieldKey}
            map={state.map}
            mapModId={state.mapModId}
            mapMods={mapMods}
            inputSize={inputSize}
            onChange={(next) =>
              setState((previous) => ({
                ...previous,
                map: next.map,
                mapModId: next.mapModId,
              }))
            }
          />
          <ServerFormInstallPath
            isCreate={isCreate}
            installDir={state.installDir}
            resolvedInstallPreview={resolvedInstallPreview}
            inputSize={inputSize}
            browsingInstallDir={browsingField === "installDir"}
            moveDisabled={serverActive || filesJobActive || moveJobActive}
            moveDisabledReason={
              serverActive
                ? "Stop the server before moving the installation"
                : moveJobActive
                  ? "Wait for the current move to finish"
                  : filesJobActive
                    ? "Wait for the current files job to finish"
                    : "Copy, verify, and commit a new install path"
            }
            onInstallDirChange={setField("installDir")}
            onBrowseInstallDir={() => void browseDirectory("installDir")}
            onOpenMove={() => {
              if (props.onOpenMoveInstall !== undefined) {
                props.onOpenMoveInstall();
                return;
              }
              setMoveDialogOpen(true);
            }}
          />
        </ServerFormSection>

        <ServerFormSection title="Networking" flat={embedded}>
          <NumberInput
            label="Game port"
            size={inputSize}
            value={state.gamePort}
            onChange={(value) => setField("gamePort")(String(value))}
            min={1}
            max={65535}
            allowDecimal={false}
            required
          />
          <NumberInput
            label="Query port"
            size={inputSize}
            value={state.queryPort}
            onChange={(value) => setField("queryPort")(String(value))}
            min={1}
            max={65535}
            allowDecimal={false}
            required
          />
          <NumberInput
            label="RCON port"
            size={inputSize}
            value={state.rconPort}
            onChange={(value) => setField("rconPort")(String(value))}
            min={1}
            max={65535}
            allowDecimal={false}
            required
          />
          <ServerFormPortConflictAlert
            servers={props.servers ?? []}
            excludeServerId={isCreate ? undefined : props.initial?.id}
            name={state.name}
            gamePort={state.gamePort}
            queryPort={state.queryPort}
            rconPort={state.rconPort}
          />
        </ServerFormSection>

        <ServerFormSection title="Access" flat={embedded}>
          <PasswordInput
            label="Server password"
            size={inputSize}
            value={state.serverPassword}
            onChange={(e) => setField("serverPassword")(e.currentTarget.value)}
            autoComplete="new-password"
          />
          <PasswordInput
            label="Admin password"
            size={inputSize}
            value={state.adminPassword}
            onChange={(e) => setField("adminPassword")(e.currentTarget.value)}
            autoComplete="new-password"
            required
          />
        </ServerFormSection>

        <ServerFormSection title="Cluster" flat={embedded}>
          <ServerFormClusterFields
            isCreate={isCreate}
            knownClusters={knownClusters}
            clusterId={state.clusterId}
            clusterDir={state.clusterDir}
            inputSize={inputSize}
            browsingClusterDir={browsingField === "clusterDir"}
            onSelectCreateCluster={selectCreateCluster}
            onOpenClusters={props.onOpenClusters}
            onClusterIdChange={setField("clusterId")}
            onClusterDirChange={setField("clusterDir")}
            onBrowseClusterDir={() => void browseDirectory("clusterDir")}
          />
        </ServerFormSection>

        {!isCreate && (
          <ServerFormSection title="Startup" flat={embedded} span2>
            <ServerFormStartupFields
              autoStart={state.autoStart}
              showInactiveWarning={
                props.initial?.enabled === false && state.autoStart
              }
              onAutoStartChange={(autoStart) =>
                setState((previous) => ({ ...previous, autoStart }))
              }
            />
          </ServerFormSection>
        )}
      </SimpleGrid>

    </Stack>
  );

  return (
    <div className={embedded ? classes.embedded : classes.page}>
      {embedded ? (
        <div className={classes.embeddedSurface} data-server-form-scroll>
          {formBody}
        </div>
      ) : (
        <Card withBorder className={classes.card}>
          {formBody}
        </Card>
      )}
      {!isCreate
        && props.initial !== null
        && props.onOpenMoveInstall === undefined && (
        <MoveInstallDialog
          opened={moveDialogOpen}
          server={props.initial}
          onClose={() => setMoveDialogOpen(false)}
          onMoved={() => {
            props.onSaved();
          }}
        />
      )}
    </div>
  );
}
