import { useState } from "react";
import type { ServerProfile, ServerProfileInput } from "@shared/types";
import { KNOWN_MAPS } from "@shared/types";

interface Props {
  initial: ServerProfile | null;
  onCancel: () => void;
  onSaved: () => void;
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

function toInput(state: FormState): ServerProfileInput {
  return {
    name: state.name.trim(),
    map: state.map.trim(),
    installDir: state.installDir.trim(),
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
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    mods: state.mods
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}

export function ServerForm(props: Props): JSX.Element {
  const [state, setState] = useState<FormState>(() => toFormState(props.initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setState((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const input = toInput(state);
    const result =
      props.initial === null
        ? await window.api.createServer(input)
        : await window.api.updateServer(props.initial.id, input);
    setSaving(false);
    if (result.ok) {
      props.onSaved();
    } else {
      setError(result.error);
    }
  };

  return (
    <form className="server-form" onSubmit={(e) => void submit(e)}>
      <h2>{props.initial === null ? "Nuevo servidor" : `Editar: ${props.initial.name}`}</h2>

      {error !== null && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      <fieldset>
        <legend>Identidad</legend>
        <label>
          Nombre del perfil
          <input value={state.name} onChange={set("name")} required />
        </label>
        <label>
          Nombre de sesión (visible en el juego)
          <input value={state.sessionName} onChange={set("sessionName")} required />
        </label>
        <label>
          Mapa
          <select value={state.map} onChange={set("map")}>
            {KNOWN_MAPS.map((map) => (
              <option key={map} value={map}>
                {map}
              </option>
            ))}
            {!KNOWN_MAPS.includes(state.map as (typeof KNOWN_MAPS)[number]) && (
              <option value={state.map}>{state.map}</option>
            )}
          </select>
        </label>
        <label>
          Directorio de instalación del servidor
          <input
            value={state.installDir}
            onChange={set("installDir")}
            placeholder="C:\asa-servers\island"
            required
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Red</legend>
        <label>
          Puerto de juego
          <input type="number" value={state.gamePort} onChange={set("gamePort")} required />
        </label>
        <label>
          Puerto de query
          <input type="number" value={state.queryPort} onChange={set("queryPort")} required />
        </label>
        <label>
          Puerto RCON
          <input type="number" value={state.rconPort} onChange={set("rconPort")} required />
        </label>
      </fieldset>

      <fieldset>
        <legend>Acceso</legend>
        <label>
          Password del servidor (opcional)
          <input value={state.serverPassword} onChange={set("serverPassword")} />
        </label>
        <label>
          Password de administrador (RCON)
          <input value={state.adminPassword} onChange={set("adminPassword")} required />
        </label>
      </fieldset>

      <fieldset>
        <legend>Cluster</legend>
        <label>
          Cluster ID (vacío = sin cluster)
          <input value={state.clusterId} onChange={set("clusterId")} />
        </label>
        <label>
          Directorio compartido de cluster
          <input
            value={state.clusterDir}
            onChange={set("clusterDir")}
            placeholder="C:\asa-servers\cluster"
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Mods y argumentos</legend>
        <label>
          Mods (IDs separados por coma, en orden de carga)
          <input value={state.mods} onChange={set("mods")} placeholder="928988, 929420" />
        </label>
        <label>
          Argumentos extra (separados por espacio)
          <input
            value={state.extraArgs}
            onChange={set("extraArgs")}
            placeholder="-NoBattlEye -ForceAllowCaveFlyers"
          />
        </label>
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
