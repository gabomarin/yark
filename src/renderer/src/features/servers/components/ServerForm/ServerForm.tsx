import { ArrowLeft, FloppyDisk, FolderOpen } from "@phosphor-icons/react";
import {
  Alert,
  Button,
  Card,
  Group,
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
import { KNOWN_MAPS, type ServerProfile, type ServerProfileInput } from "@shared/types";
import { useMemo, useState } from "react";
import classes from "./ServerForm.module.css";

interface Props {
  initial: ServerProfile | null;
  onCancel: () => void;
  onSaved: () => void;
  /** `embedded` = pestaña del workspace (sin cabecera de página completa). */
  variant?: "page" | "embedded";
  /** Servidor en starting/running/stopping → aviso de reinicio. */
  serverActive?: boolean;
}

interface FormState {
  name: string;
  map: string;
  installDir: string;
  sessionName: string;
  gamePort: string;
  queryPort: string;
  rconPort: string;
  serverPassword: string;
  adminPassword: string;
  clusterId: string;
  clusterDir: string;
  extraArgs: string;
  mods: string;
}

function toFormState(profile: ServerProfile | null): FormState {
  if (profile === null) {
    return {
      name: "",
      map: KNOWN_MAPS[0],
      installDir: "",
      sessionName: "",
      gamePort: "7777",
      queryPort: "27015",
      rconPort: "27020",
      serverPassword: "",
      adminPassword: "",
      clusterId: "",
      clusterDir: "",
      extraArgs: "",
      mods: "",
    };
  }

  return {
    name: profile.name,
    map: profile.map,
    installDir: profile.installDir,
    sessionName: profile.sessionName,
    gamePort: String(profile.gamePort),
    queryPort: String(profile.queryPort),
    rconPort: String(profile.rconPort),
    serverPassword: profile.serverPassword ?? "",
    adminPassword: profile.adminPassword,
    clusterId: profile.clusterId ?? "",
    clusterDir: profile.clusterDir ?? "",
    extraArgs: profile.extraArgs.join(" "),
    mods: profile.mods.join(", "),
  };
}

function toInput(state: FormState, isCreate: boolean): ServerProfileInput {
  const name = state.name.trim();
  const baseOrInstall = state.installDir.trim();
  return {
    name,
    map: state.map.trim(),
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
    extraArgs: state.extraArgs
      .split(/\s+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    mods: state.mods
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  };
}

export function ServerForm(props: Props): JSX.Element {
  const isCreate = props.initial === null;
  const embedded = props.variant === "embedded";
  const serverActive = props.serverActive === true;
  const [state, setState] = useState<FormState>(() => toFormState(props.initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [browsingField, setBrowsingField] = useState<"installDir" | "clusterDir" | null>(null);

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

  const setField = (field: keyof FormState) => (value: string) => {
    setState((previous) => ({ ...previous, [field]: value }));
  };

  const browseDirectory = async (field: "installDir" | "clusterDir") => {
    setError(null);
    setBrowsingField(field);
    const current = state[field].trim();
    const result = await window.api.pickPath(
      "directory",
      current.length > 0 ? current : undefined,
      field === "installDir"
        ? isCreate
          ? "Seleccionar carpeta base (se creará una subcarpeta con el nombre del servidor)"
          : "Seleccionar carpeta de instalación del servidor"
        : "Seleccionar carpeta de cluster compartido",
    );
    setBrowsingField(null);
    if (!result.ok) {
      setError(result.error ?? "No se pudo abrir el selector de carpeta");
      return;
    }
    if (result.data !== null) {
      setState((previous) => ({ ...previous, [field]: result.data }));
    }
  };

  const submit = async () => {
    setError(null);
    const folderError = getServerFolderNameError(state.name);
    if (folderError !== null) {
      setError(folderError);
      return;
    }
    setSaving(true);
    const input = toInput(state, isCreate);
    const result =
      props.initial === null
        ? await window.api.createServer(input)
        : await window.api.updateServer(props.initial.id, input);
    setSaving(false);
    if (result.ok) {
      props.onSaved();
      return;
    }
    setError(result.error ?? "No se pudo guardar el servidor");
  };

  return (
    <div className={embedded ? classes.embedded : classes.page}>
      <Card withBorder className={classes.card}>
        <Stack gap="lg">
          {!embedded && (
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={2}>{isCreate ? "Nuevo servidor" : `Editar: ${props.initial!.name}`}</Title>
                <Text c="dimmed">Configura identidad, red, acceso, cluster y argumentos del servidor.</Text>
              </div>
              <Button variant="subtle" leftSection={<ArrowLeft size={16} />} onClick={props.onCancel}>
                Volver
              </Button>
            </Group>
          )}

          {embedded && (
            <div>
              <Title order={3}>Información del servidor</Title>
              <Text c="dimmed" size="sm">
                Nombre, puertos, acceso, cluster y argumentos de arranque.
              </Text>
            </div>
          )}

          {serverActive && (
            <Alert color="yellow" title="Servidor en ejecución">
              Puedes guardar cambios ahora; se aplicarán al reiniciar el servidor.
            </Alert>
          )}

          {error !== null && <Alert color="red">{error}</Alert>}

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Section title="Identidad">
              <TextInput
                label="Nombre"
                value={state.name}
                onChange={(e) => setField("name")(e.currentTarget.value)}
                required
                error={nameFolderError ?? undefined}
                description={
                  isCreate
                    ? 'También se usa como subcarpeta. No uses < > : " / \\ | ? *'
                    : undefined
                }
              />
              <TextInput label="Nombre de sesión" value={state.sessionName} onChange={(e) => setField("sessionName")(e.currentTarget.value)} required />
              <TextInput label="Mapa" value={state.map} onChange={(e) => setField("map")(e.currentTarget.value)} list="known-maps" required />
              <datalist id="known-maps">
                {KNOWN_MAPS.map((map) => (
                  <option key={map} value={map} />
                ))}
              </datalist>
              <PathField
                label={isCreate ? "Carpeta base" : "Directorio de instalación"}
                value={state.installDir}
                placeholder={isCreate ? "C:\\ark_servers" : "C:\\ark_servers\\my_server"}
                busy={browsingField === "installDir"}
                disabled={serverActive && !isCreate}
                onChange={setField("installDir")}
                onBrowse={() => void browseDirectory("installDir")}
              />
              {isCreate && (
                <Text size="sm" c="dimmed">
                  Instalación final:{" "}
                  <Text span fw={600} c={resolvedInstallPreview.length > 0 ? undefined : "dimmed"}>
                    {resolvedInstallPreview.length > 0
                      ? resolvedInstallPreview
                      : "elige carpeta base y nombre"}
                  </Text>
                </Text>
              )}
            </Section>

            <Section title="Red">
              <TextInput label="Puerto de juego" type="number" value={state.gamePort} onChange={(e) => setField("gamePort")(e.currentTarget.value)} required />
              <TextInput label="Puerto de query" type="number" value={state.queryPort} onChange={(e) => setField("queryPort")(e.currentTarget.value)} required />
              <TextInput label="Puerto RCON" type="number" value={state.rconPort} onChange={(e) => setField("rconPort")(e.currentTarget.value)} required />
            </Section>

            <Section title="Acceso">
              <TextInput label="Password del servidor" value={state.serverPassword} onChange={(e) => setField("serverPassword")(e.currentTarget.value)} />
              <TextInput label="Password de administrador" value={state.adminPassword} onChange={(e) => setField("adminPassword")(e.currentTarget.value)} required />
            </Section>

            <Section title="Cluster">
              <TextInput label="Cluster ID" value={state.clusterId} onChange={(e) => setField("clusterId")(e.currentTarget.value)} />
              <PathField
                label="Directorio compartido de cluster"
                value={state.clusterDir}
                placeholder="C:\\ark_servers\\cluster"
                busy={browsingField === "clusterDir"}
                onChange={setField("clusterDir")}
                onBrowse={() => void browseDirectory("clusterDir")}
              />
            </Section>

            <Section title="Mods y argumentos">
              <TextInput label="Mods" value={state.mods} onChange={(e) => setField("mods")(e.currentTarget.value)} placeholder="928988, 929420" />
              <TextInput label="Argumentos extra" value={state.extraArgs} onChange={(e) => setField("extraArgs")(e.currentTarget.value)} placeholder="-NoBattlEye -ForceAllowCaveFlyers" />
            </Section>
          </SimpleGrid>

          <Group justify="flex-end">
            {!embedded && (
              <Button variant="default" onClick={props.onCancel}>Cancelar</Button>
            )}
            <Button leftSection={<FloppyDisk size={16} />} onClick={() => void submit()} loading={saving}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Card>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps): JSX.Element {
  return (
    <Card withBorder className={classes.section}>
      <Stack gap="sm">
        <Title order={4}>{title}</Title>
        {children}
      </Stack>
    </Card>
  );
}

interface PathFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  busy: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBrowse: () => void;
}

function PathField({
  label,
  value,
  placeholder,
  busy,
  disabled = false,
  onChange,
  onBrowse,
}: PathFieldProps): JSX.Element {
  return (
    <div>
      <Text size="sm" fw={500} mb={6}>{label}</Text>
      <Group align="flex-end" wrap="nowrap">
        <TextInput
          className={classes.pathInput}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
        <Button
          variant="light"
          leftSection={<FolderOpen size={16} />}
          onClick={onBrowse}
          disabled={busy || disabled}
        >
          {busy ? "Abriendo..." : "Buscar"}
        </Button>
      </Group>
    </div>
  );
}
