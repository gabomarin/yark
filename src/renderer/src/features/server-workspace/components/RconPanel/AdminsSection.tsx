import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { FloppyDisk } from "@phosphor-icons/react";
import type { MutableRefObject, ReactElement } from "react";
import { AdminsRemoteConfig } from "./AdminsRemoteConfig";
import { PlayerIdentityRow, resolvePlayerDisplayName } from "./PlayerIdentityRow";
import { useAdminsSection } from "./useAdminsSection";
import classes from "./RconPanel.module.css";

const EMPTY_NAME_BY_ID: ReadonlyMap<string, string> = new Map();

interface Props {
  serverId: string;
  /** When INI Files has unsaved edits, block admin-list writes to GUS. */
  iniDirty?: boolean;
  /** Name hints from Online / Banned (ASA whitelist has ids only). */
  nameById?: ReadonlyMap<string, string>;
  reloadRef?: MutableRefObject<(() => Promise<void>) | null>;
  /** Starting or running – whitelist is view-only until the dedicated stops. */
  readOnly?: boolean;
}

export function AdminsSection(props: Props): ReactElement {
  const iniDirty = props.iniDirty === true;
  const readOnly = props.readOnly === true;
  const admins = useAdminsSection({
    serverId: props.serverId,
    iniDirty,
    nameById: props.nameById,
    reloadRef: props.reloadRef,
  });

  const saveDisabled = readOnly || !admins.draftDirty || iniDirty;
  const saveTooltip = readOnly
    ? "Stop the server to edit"
    : admins.saveTooltip;
  const displayUrl = readOnly
    ? (admins.state?.adminListUrl ?? "")
    : admins.urlDraft;
  const displayInterval = readOnly
    ? (admins.state?.updateAllowedCheatersInterval ?? admins.intervalDraft)
    : admins.intervalDraft;

  return (
    <div className={classes.adminSection}>
      <div className={classes.header}>
        <Text className={classes.sectionTitle}>Whitelist</Text>
        {!readOnly ? (
          <Group gap="xs">
            <Button
              size="compact-xs"
              variant="default"
              disabled={!admins.draftDirty}
              onClick={admins.discardDraft}
            >
              Discard
            </Button>
            <Tooltip label={saveTooltip}>
              <ActionIcon
                size="sm"
                variant="filled"
                aria-label="Save admin list config"
                loading={admins.saving}
                disabled={saveDisabled}
                onClick={() => void admins.saveConfig()}
              >
                <FloppyDisk size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ) : null}
      </div>

      <Stack gap="sm">
        {readOnly ? (
          <Alert color="fossil" variant="light" p="xs">
            <Text size="xs">Stop the server to edit the whitelist.</Text>
          </Alert>
        ) : (
          <Text size="xs" c="dimmed" className={classes.helper}>
            Public http(s) list of EOS admin ids. Optional.
          </Text>
        )}

        {admins.saveBlockedByIni && !readOnly ? (
          <Alert color="fossil" variant="light" p="xs">
            <Text size="xs">
              Save or discard INI Files changes before editing here.
            </Text>
          </Alert>
        ) : null}

        {admins.state?.mode === "misconfigured" && !readOnly ? (
          <Alert color="attention" variant="light" p="xs">
            <Text size="xs">
              AdminListURL must be http(s) or empty. Fix and Save.
            </Text>
          </Alert>
        ) : null}

        {admins.draftDirty && !readOnly ? (
          <Alert color="fossil" variant="light" p="xs">
            <Text size="xs">Unsaved changes.</Text>
          </Alert>
        ) : null}

        <AdminsRemoteConfig
          urlDraft={displayUrl}
          intervalDraft={displayInterval}
          validating={admins.validating}
          readOnly={readOnly}
          onUrlChange={admins.setUrlDraft}
          onIntervalChange={admins.setIntervalDraft}
          onValidateUrl={() => void admins.validateUrl()}
        />

        <Text className={classes.sectionTitle}>Current ids</Text>

        {admins.error !== null ? (
          <Text size="sm" c="red">
            {admins.error}
          </Text>
        ) : null}
        {admins.state?.listError !== null &&
        admins.state?.listError !== undefined ? (
          <Text size="sm" c="orange">
            {admins.state.listError}
          </Text>
        ) : null}

        {admins.loading && admins.state === null ? (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              Loading…
            </Text>
          </Group>
        ) : admins.state !== null &&
          admins.state.entries.length === 0 &&
          !admins.state.listError ? (
          <Text size="sm" c="dimmed">
            {admins.state.mode === "remote" ? "No ids in the list." : "No list URL set."}
          </Text>
        ) : admins.state !== null && admins.state.entries.length > 0 ? (
          <div className={classes.playerList}>
            {admins.state.entries.map((entry) => (
              <PlayerIdentityRow
                key={entry.id}
                name={resolvePlayerDisplayName(
                  entry.id,
                  entry.name,
                  props.nameById ?? EMPTY_NAME_BY_ID,
                )}
                playerKey={entry.id}
              />
            ))}
          </div>
        ) : null}
      </Stack>
    </div>
  );
}
