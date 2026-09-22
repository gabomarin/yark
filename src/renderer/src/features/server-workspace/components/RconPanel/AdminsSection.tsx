import { ActionIcon, Button, Group, Stack, Text, Tooltip } from "@mantine/core";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { FloppyDisk } from "@phosphor-icons/react";
import type { MutableRefObject, ReactElement } from "react";
import { AdminsEntries } from "./AdminsEntries";
import { AdminsRemoteConfig } from "./AdminsRemoteConfig";
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

interface HeaderProps {
  readOnly: boolean;
  draftDirty: boolean;
  saving: boolean;
  saveDisabled: boolean;
  saveTooltip: string;
  onDiscard: () => void;
  onSave: () => void;
}

function AdminsHeader({
  readOnly,
  draftDirty,
  saving,
  saveDisabled,
  saveTooltip,
  onDiscard,
  onSave,
}: HeaderProps): ReactElement {
  return (
    <div className={classes.header}>
      <Text className={classes.sectionTitle}>Whitelist</Text>
      {readOnly ? null : (
        <Group gap="xs">
          <Button variant="default" disabled={!draftDirty} onClick={onDiscard}>
            Discard
          </Button>
          <Tooltip label={saveTooltip}>
            <ActionIcon
              size="sm"
              variant="filled"
              aria-label="Save admin list config"
              loading={saving}
              disabled={saveDisabled}
              onClick={onSave}
            >
              <FloppyDisk size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
    </div>
  );
}

interface NoticesProps {
  readOnly: boolean;
  editable: boolean;
  saveBlockedByIni: boolean;
  misconfigured: boolean;
  draftDirty: boolean;
}

function AdminsNotices({
  readOnly,
  editable,
  saveBlockedByIni,
  misconfigured,
  draftDirty,
}: NoticesProps): ReactElement {
  if (readOnly) {
    return (
      <AppAlert color="fossil" variant="light" p="xs">
        <Text size="xs">
          {editable
            ? "The whitelist URL is locked while the server runs, but ids below stay editable — ASA re-fetches this list automatically."
            : "Stop the server to edit the whitelist."}
        </Text>
      </AppAlert>
    );
  }
  return (
    <>
      <Text size="xs" c="dimmed" className={classes.helper}>
        Public http(s) list of EOS admin ids. Optional.
      </Text>
      {saveBlockedByIni ? (
        <AppAlert color="fossil" variant="light" p="xs">
          <Text size="xs">Save or discard INI Files changes before editing here.</Text>
        </AppAlert>
      ) : null}
      {misconfigured ? (
        <AppAlert color="attention" variant="light" p="xs">
          <Text size="xs">AdminListURL must be http(s) or empty. Fix and Save.</Text>
        </AppAlert>
      ) : null}
      {draftDirty ? (
        <AppAlert color="fossil" variant="light" p="xs">
          <Text size="xs">Unsaved changes.</Text>
        </AppAlert>
      ) : null}
    </>
  );
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

  return (
    <div className={classes.adminSection}>
      <AdminsHeader
        readOnly={readOnly}
        draftDirty={admins.draftDirty}
        saving={admins.saving}
        saveDisabled={readOnly || !admins.draftDirty || iniDirty}
        saveTooltip={readOnly ? "Stop the server to edit" : admins.saveTooltip}
        onDiscard={admins.discardDraft}
        onSave={() => void admins.saveConfig()}
      />

      <Stack gap="sm">
        <AdminsNotices
          readOnly={readOnly}
          editable={admins.editable}
          saveBlockedByIni={admins.saveBlockedByIni}
          misconfigured={admins.state?.mode === "misconfigured"}
          draftDirty={admins.draftDirty}
        />

        <AdminsRemoteConfig
          urlDraft={readOnly ? (admins.state?.adminListUrl ?? "") : admins.urlDraft}
          intervalDraft={
            readOnly ? (admins.state?.updateAllowedCheatersInterval ?? admins.intervalDraft) : admins.intervalDraft
          }
          validating={admins.validating}
          readOnly={readOnly}
          onUrlChange={admins.setUrlDraft}
          onIntervalChange={admins.setIntervalDraft}
          onValidateUrl={() => void admins.validateUrl()}
        />

        <Text className={classes.sectionTitle}>Current ids</Text>

        <AdminsEntries
          editable={admins.editable}
          mode={admins.state?.mode}
          interval={admins.state?.updateAllowedCheatersInterval ?? "…"}
          busyKey={admins.busyKey}
          loading={admins.loading}
          state={admins.state}
          error={admins.error}
          listError={admins.state?.listError}
          nameById={props.nameById ?? EMPTY_NAME_BY_ID}
          onAdd={(id) => admins.editMember(id, "add")}
          onRemove={(id) => admins.editMember(id, "remove")}
        />
      </Stack>
    </div>
  );
}
