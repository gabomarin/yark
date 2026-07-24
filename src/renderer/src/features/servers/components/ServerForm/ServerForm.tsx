import { ArrowLeft, FloppyDisk, FolderOpen } from "@phosphor-icons/react";
import {
  Alert,
  Button,
  Card,
  Group,
  NumberInput,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
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

function toInput(
  state: FormState,
  isCreate: boolean,
  options?: { preserveMods?: string[] },
): ServerProfileInput {
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
    mods:
      options?.preserveMods ??
      state.mods
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
  };
}

export function ServerForm(props: Props): JSX.Element {
  const isCreate = props.initial === null;
  const embedded = props.variant === "embedded";
  const serverActive = props.serverActive === true;
  const inputSize = embedded ? "sm" : "md";
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
    const input = toInput(state, isCreate, {
      preserveMods:
        embedded && props.initial !== null ? props.initial.mods : undefined,
    });
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

  const formBody = (
    <Stack gap={embedded ? "md" : "lg"}>
      {!embedded && (
        <Group justify="space-between" align="flex-start" className={classes.pageHeader}>
          <div>
            <Title order={2}>{isCreate ? "Nuevo servidor" : `Editar: ${props.initial!.name}`}</Title>
            <Text c="dimmed">Configura identidad, red, acceso, cluster y argumentos del servidor.</Text>
          </div>
          <Group gap="xs">
            <Button variant="subtle" leftSection={<ArrowLeft size={16} />} onClick={props.onCancel}>
              Volver
            </Button>
            <Button
              size="md"
              leftSection={<FloppyDisk size={16} />}
              onClick={() => void submit()}
              loading={saving}
            >
              Guardar
            </Button>
          </Group>
        </Group>
      )}

      {embedded && (
        <Group justify="space-between" align="flex-start" className={classes.embeddedHeader}>
          <div>
            <Title order={4}>Información del servidor</Title>
            <Text c="dimmed" fz="xs">
              Nombre, puertos, acceso, cluster y argumentos de arranque.
            </Text>
          </div>
          <Button
            size="sm"
            leftSection={<FloppyDisk size={16} />}
            onClick={() => void submit()}
            loading={saving}
          >
            Guardar
          </Button>
        </Group>
      )}

      {serverActive && (
        <Alert color="yellow" title="Servidor en ejecución">
          Puedes guardar cambios ahora; se aplicarán al reiniciar el servidor.
        </Alert>
      )}

      {error !== null && <Alert color="red">{error}</Alert>}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={embedded ? "md" : "lg"}>
        <Section title="Identidad" flat={embedded}>
          <TextInput
            label="Nombre"
            size={inputSize}
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
          <TextInput
            label="Nombre de sesión"
            size={inputSize}
            value={state.sessionName}
            onChange={(e) => setField("sessionName")(e.currentTarget.value)}
            required
          />
          <Select
            label="Mapa"
            size={inputSize}
            value={state.map}
            onChange={(value) => {
              if (value !== null) {
                setField("map")(value);
              }
            }}
            data={[...KNOWN_MAPS]}
            searchable
            allowDeselect={false}
            required
          />
          <PathField
            label={isCreate ? "Carpeta base" : "Directorio de instalación"}
            value={state.installDir}
            placeholder={isCreate ? "C:\\ark_servers" : "C:\\ark_servers\\my_server"}
            busy={browsingField === "installDir"}
            disabled={serverActive && !isCreate}
            size={inputSize}
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

        <Section title="Red" flat={embedded}>
          <NumberInput
            label="Puerto de juego"
            size={inputSize}
            value={state.gamePort}
            onChange={(value) => setField("gamePort")(String(value))}
            min={1}
            max={65535}
            allowDecimal={false}
            required
          />
          <NumberInput
            label="Puerto de query"
            size={inputSize}
            value={state.queryPort}
            onChange={(value) => setField("queryPort")(String(value))}
            min={1}
            max={65535}
            allowDecimal={false}
            required
          />
          <NumberInput
            label="Puerto RCON"
            size={inputSize}
            value={state.rconPort}
            onChange={(value) => setField("rconPort")(String(value))}
            min={1}
            max={65535}
            allowDecimal={false}
            required
          />
        </Section>

        <Section title="Acceso" flat={embedded}>
          <PasswordInput
            label="Contraseña del servidor"
            size={inputSize}
            value={state.serverPassword}
            onChange={(e) => setField("serverPassword")(e.currentTarget.value)}
            autoComplete="new-password"
          />
          <PasswordInput
            label="Contraseña de administrador"
            size={inputSize}
            value={state.adminPassword}
            onChange={(e) => setField("adminPassword")(e.currentTarget.value)}
            autoComplete="new-password"
            required
          />
        </Section>

        <Section title="Cluster" flat={embedded}>
          <TextInput
            label="Cluster ID"
            size={inputSize}
            value={state.clusterId}
            onChange={(e) => setField("clusterId")(e.currentTarget.value)}
          />
          <PathField
            label="Directorio compartido de cluster"
            value={state.clusterDir}
            placeholder="C:\\ark_servers\\cluster"
            busy={browsingField === "clusterDir"}
            size={inputSize}
            onChange={setField("clusterDir")}
            onBrowse={() => void browseDirectory("clusterDir")}
          />
        </Section>

        <Section
          title={embedded ? "Argumentos de arranque" : "Mods y argumentos"}
          flat={embedded}
          span2={embedded}
        >
          {!embedded && (
            <TextInput
              label="Mods"
              size={inputSize}
              value={state.mods}
              onChange={(e) => setField("mods")(e.currentTarget.value)}
              placeholder="928988, 929420"
            />
          )}
          {embedded && (
            <Text c="dimmed" fz="xs">
              Los mods se gestionan en el tab Mods. Aquí solo los argumentos extra del
              proceso (equivalente a Startup Parameters).
            </Text>
          )}
          <Textarea
            label={embedded ? "Argumentos extra" : "Argumentos extra"}
            size={inputSize}
            value={state.extraArgs}
            onChange={(e) => setField("extraArgs")(e.currentTarget.value)}
            placeholder="-NoBattlEye -ForceAllowCaveFlyers -servergamelog"
            description={
              embedded
                ? "Separados por espacios. Se añaden al comando de arranque del dedicated."
                : undefined
            }
            minRows={embedded ? 3 : 2}
            autosize
            maxRows={8}
          />
        </Section>
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
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  flat?: boolean;
  span2?: boolean;
}

function Section({ title, children, flat = false, span2 = false }: SectionProps): JSX.Element {
  if (flat) {
    return (
      <Stack gap="xs" className={span2 ? classes.span2 : undefined}>
        <Text fw={600} fz="sm">
          {title}
        </Text>
        {children}
      </Stack>
    );
  }

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
  size?: "sm" | "md";
  onChange: (value: string) => void;
  onBrowse: () => void;
}

function PathField({
  label,
  value,
  placeholder,
  busy,
  disabled = false,
  size = "md",
  onChange,
  onBrowse,
}: PathFieldProps): JSX.Element {
  return (
    <div>
      <Text size="sm" fw={500} mb={6}>{label}</Text>
      <Group align="flex-end" wrap="nowrap" gap="xs">
        <TextInput
          className={classes.pathInput}
          size={size}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
        <Button
          variant="default"
          size={size}
          leftSection={<FolderOpen size={14} />}
          onClick={onBrowse}
          disabled={busy || disabled}
        >
          {busy ? "Abriendo..." : "Buscar"}
        </Button>
      </Group>
    </div>
  );
}
