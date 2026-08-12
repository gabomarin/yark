import type { ReactElement } from "react";
import {
  Alert,
  NumberInput,
  PasswordInput,
  SimpleGrid,
  Stack,
  TextInput,
} from "@mantine/core";
import { isOfficialMap, normalizeMapToken } from "@shared/map-identity";
import type { KnownClusterOption } from "@features/clusters/knownClusterOptions";
import type { ModMetadata, ServerProfile } from "@shared/types";
import { ServerFormCreateClusterFields } from "../ServerForm/ServerFormCreateClusterFields";
import { ServerFormMapField } from "../ServerForm/ServerFormMapField";
import { ServerFormPortConflictAlert } from "../ServerForm/ServerFormPortConflictAlert";
import type { ImportFormState } from "../../importInstallModel";

interface Props {
  servers: ServerProfile[];
  form: ImportFormState;
  installDir: string;
  nameError: string | null;
  knownClusters: KnownClusterOption[];
  /** CurseForge rows for discovered mods (map-category candidates for Map field). */
  mapMods: ModMetadata[];
  onOpenClusters?: () => void;
  onChange: (next: ImportFormState) => void;
}

export function ImportInstallEditStep(props: Props): ReactElement {
  const set = (patch: Partial<ImportFormState>): void => {
    props.onChange({ ...props.form, ...patch });
  };
  const mapToken = normalizeMapToken(props.form.map);
  const customMapNeedsLink =
    mapToken.length > 0 && !isOfficialMap(mapToken) && props.form.mapModId === null;

  return (
    <Stack gap="sm">
      <ServerFormPortConflictAlert
        servers={props.servers}
        name={props.form.name}
        gamePort={props.form.gamePort}
        queryPort={props.form.queryPort}
        rconPort={props.form.rconPort}
      />
      {customMapNeedsLink && (
        <Alert color="yellow" title="Custom map">
          Link a Maps-category Project ID below (or on the Mods tab after import)
          before the first Start, or Start will block until map identity is set.
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <TextInput
          label="Name"
          value={props.form.name}
          error={props.nameError}
          onChange={(e) => set({ name: e.currentTarget.value })}
        />
        <TextInput
          label="Session name"
          value={props.form.sessionName}
          onChange={(e) => set({ sessionName: e.currentTarget.value })}
        />
      </SimpleGrid>
      <ServerFormMapField
        map={props.form.map}
        mapModId={props.form.mapModId}
        mapSaveFolder={props.form.mapSaveFolder}
        inputSize="sm"
        mapMods={props.mapMods}
        onChange={(next) =>
          set({
            map: next.map,
            mapModId: next.mapModId,
            mapSaveFolder: next.mapSaveFolder,
          })
        }
      />
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <NumberInput
          label="Game port"
          value={props.form.gamePort === "" ? "" : Number(props.form.gamePort)}
          allowDecimal={false}
          allowNegative={false}
          onChange={(value) =>
            set({
              gamePort: value === "" || value === undefined ? "" : String(value),
            })
          }
        />
        <NumberInput
          label="Query port"
          value={props.form.queryPort === "" ? "" : Number(props.form.queryPort)}
          allowDecimal={false}
          allowNegative={false}
          onChange={(value) =>
            set({
              queryPort: value === "" || value === undefined ? "" : String(value),
            })
          }
        />
        <NumberInput
          label="RCON port"
          value={props.form.rconPort === "" ? "" : Number(props.form.rconPort)}
          allowDecimal={false}
          allowNegative={false}
          onChange={(value) =>
            set({
              rconPort: value === "" || value === undefined ? "" : String(value),
            })
          }
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <PasswordInput
          label="Admin password"
          value={props.form.adminPassword}
          onChange={(e) => set({ adminPassword: e.currentTarget.value })}
        />
        <PasswordInput
          label="Server password"
          placeholder="Optional"
          value={props.form.serverPassword}
          onChange={(e) => set({ serverPassword: e.currentTarget.value })}
        />
      </SimpleGrid>
      <TextInput
        label="Install path"
        value={props.installDir}
        readOnly
        description="Absolute path — not nested under a base folder"
      />
      <ServerFormCreateClusterFields
        options={props.knownClusters}
        selectedClusterId={
          props.form.clusterId.trim().length > 0 ? props.form.clusterId : null
        }
        inputSize="sm"
        onOpenClusters={props.onOpenClusters}
        onSelectCluster={(clusterId) => {
          if (clusterId === null) {
            set({ clusterId: "", clusterDir: "" });
            return;
          }
          const selected = props.knownClusters.find(
            (option) => option.clusterId === clusterId,
          );
          if (selected === undefined) return;
          set({
            clusterId: selected.clusterId,
            clusterDir: selected.clusterDir,
          });
        }}
      />
    </Stack>
  );
}
