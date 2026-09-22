import { ActionIcon, Button, Group, Loader, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { FloppyDisk, Star } from "@phosphor-icons/react";
import type { KeyboardEvent, MutableRefObject, ReactElement } from "react";
import { useState } from "react";
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
  const [newId, setNewId] = useState("");
  const [newIdError, setNewIdError] = useState<string | null>(null);
  const admins = useAdminsSection({
    serverId: props.serverId,
    iniDirty,
    nameById: props.nameById,
    reloadRef: props.reloadRef,
  });
  const editable = admins.editable;
  const entriesEditable = editable && admins.busyKey === null;

  const addId = async (): Promise<void> => {
    const id = newId.trim();
    if (id.length === 0) return;
    setNewIdError(null);
    await admins.editMember(id, "add");
    setNewId("");
  };

  const onAddIdKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") void addId();
  };

  const saveDisabled = readOnly || !admins.draftDirty || iniDirty;
  const saveTooltip = readOnly ? "Stop the server to edit" : admins.saveTooltip;
  const displayUrl = readOnly ? (admins.state?.adminListUrl ?? "") : admins.urlDraft;
  const displayInterval = readOnly
    ? (admins.state?.updateAllowedCheatersInterval ?? admins.intervalDraft)
    : admins.intervalDraft;

  return (
    <div className={classes.adminSection}>
      <div className={classes.header}>
        <Text className={classes.sectionTitle}>Whitelist</Text>
        {!readOnly ? (
          <Group gap="xs">
            <Button variant="default" disabled={!admins.draftDirty} onClick={admins.discardDraft}>
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
          <AppAlert color="fossil" variant="light" p="xs">
            <Text size="xs">
              {editable
                ? "The whitelist URL is locked while the server runs, but ids below stay editable — ASA re-fetches this list automatically."
                : "Stop the server to edit the whitelist."}
            </Text>
          </AppAlert>
        ) : (
          <Text size="xs" c="dimmed" className={classes.helper}>
            Public http(s) list of EOS admin ids. Optional.
          </Text>
        )}

        {admins.saveBlockedByIni && !readOnly ? (
          <AppAlert color="fossil" variant="light" p="xs">
            <Text size="xs">Save or discard INI Files changes before editing here.</Text>
          </AppAlert>
        ) : null}

        {admins.state?.mode === "misconfigured" && !readOnly ? (
          <AppAlert color="attention" variant="light" p="xs">
            <Text size="xs">AdminListURL must be http(s) or empty. Fix and Save.</Text>
          </AppAlert>
        ) : null}

        {admins.draftDirty && !readOnly ? (
          <AppAlert color="fossil" variant="light" p="xs">
            <Text size="xs">Unsaved changes.</Text>
          </AppAlert>
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

        {editable ? (
          <Stack gap={4}>
            <Group gap="xs" align="flex-end">
              <TextInput
                label="Add admin id"
                size="xs"
                placeholder="EOS account id"
                value={newId}
                onChange={(event) => setNewId(event.currentTarget.value)}
                onKeyDown={onAddIdKeyDown}
                disabled={!entriesEditable}
                error={newIdError ?? undefined}
              />
              <Button
                size="xs"
                disabled={newId.trim().length === 0 || !entriesEditable}
                onClick={() => void addId()}
              >
                Add
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Changes publish instantly; ASA re-checks this list every{" "}
              {admins.state?.updateAllowedCheatersInterval ?? "…"}s.
            </Text>
          </Stack>
        ) : admins.state?.mode === "remote" ? (
          <Text size="xs" c="dimmed">
            Read-only: this list is hosted elsewhere. Edit it at its source.
          </Text>
        ) : null}

        {admins.error !== null ? (
          <Text size="sm" c="red">
            {admins.error}
          </Text>
        ) : null}
        {admins.state?.listError !== null && admins.state?.listError !== undefined ? (
          <Text size="sm" c="attention">
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
        ) : admins.state !== null && admins.state.entries.length === 0 && !admins.state.listError ? (
          <Text size="sm" c="dimmed">
            {admins.state.mode === "remote" || admins.state.mode === "loopback"
              ? "No ids in the list."
              : "No list URL set."}
          </Text>
        ) : admins.state !== null && admins.state.entries.length > 0 ? (
          <div className={classes.playerList}>
            {admins.state.entries.map((entry) => (
              <PlayerIdentityRow
                key={entry.id}
                name={resolvePlayerDisplayName(entry.id, entry.name, props.nameById ?? EMPTY_NAME_BY_ID)}
                playerKey={entry.id}
                actions={
                  editable ? (
                    <Tooltip label="Remove from admin list">
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        aria-label={`Remove ${resolvePlayerDisplayName(entry.id, entry.name, props.nameById ?? EMPTY_NAME_BY_ID)} from admin list`}
                        loading={admins.busyKey === entry.id}
                        disabled={!entriesEditable}
                        onClick={() => void admins.editMember(entry.id, "remove")}
                      >
                        <Star size={12} weight="fill" />
                      </ActionIcon>
                    </Tooltip>
                  ) : undefined
                }
              />
            ))}
          </div>
        ) : null}
      </Stack>
    </div>
  );
}
