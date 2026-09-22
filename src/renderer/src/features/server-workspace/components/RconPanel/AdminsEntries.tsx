import { ActionIcon, Button, Group, Loader, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { X } from "@phosphor-icons/react";
import type { AdminListStateDto } from "@shared/ipc";
import type { KeyboardEvent, ReactElement } from "react";
import { useState } from "react";
import { PlayerIdentityRow, resolvePlayerDisplayName } from "./PlayerIdentityRow";
import classes from "./RconPanel.module.css";

interface AddIdRowProps {
  interval: number | "…";
  disabled: boolean;
  onAdd: (id: string) => Promise<boolean>;
}

/** Own draft + inline error, so a failed add keeps the id for an immediate retry. */
function AddIdRow({ interval, disabled, onAdd }: AddIdRowProps): ReactElement {
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async (): Promise<void> => {
    const trimmed = id.trim();
    if (trimmed.length === 0) return;
    setError(null);
    if (await onAdd(trimmed)) {
      setId("");
    } else {
      setError(`Could not add ${trimmed}. See the notification for details.`);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") void add();
  };

  return (
    <Stack gap={4}>
      <Group gap="xs" align="flex-end">
        <TextInput
          label="Add admin id"
          size="xs"
          placeholder="EOS account id"
          value={id}
          onChange={(event) => {
            setId(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          disabled={disabled}
          error={error ?? undefined}
        />
        <Button size="xs" disabled={id.trim().length === 0 || disabled} onClick={() => void add()}>
          Add
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        Changes publish instantly; ASA re-checks this list every {interval}s.
      </Text>
    </Stack>
  );
}

interface EntriesListProps {
  entries: AdminListStateDto["entries"];
  editable: boolean;
  busyKey: string | null;
  nameById: ReadonlyMap<string, string>;
  onRemove: (id: string) => Promise<boolean>;
}

function AdminEntriesList({ entries, editable, busyKey, nameById, onRemove }: EntriesListProps): ReactElement {
  const rowsDisabled = !editable || busyKey !== null;
  return (
    <div className={classes.playerList}>
      {entries.map((entry) => {
        const label = resolvePlayerDisplayName(entry.id, entry.name, nameById);
        return (
          <PlayerIdentityRow
            key={entry.id}
            name={label}
            playerKey={entry.id}
            actions={
              editable ? (
                <Tooltip label="Remove from admin list">
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    aria-label={`Remove ${label} from admin list`}
                    loading={busyKey === entry.id}
                    disabled={rowsDisabled}
                    onClick={() => void onRemove(entry.id)}
                  >
                    <X size={12} />
                  </ActionIcon>
                </Tooltip>
              ) : undefined
            }
          />
        );
      })}
    </div>
  );
}

interface EntriesBodyProps extends Omit<EntriesListProps, "entries"> {
  loading: boolean;
  state: AdminListStateDto | null;
}

function AdminEntriesBody({
  loading,
  state,
  editable,
  busyKey,
  nameById,
  onRemove,
}: EntriesBodyProps): ReactElement | null {
  if (loading && state === null) {
    return (
      <Group gap="xs">
        <Loader size="xs" />
        <Text size="sm" c="dimmed">
          Loading…
        </Text>
      </Group>
    );
  }
  if (state !== null && state.entries.length === 0 && !state.listError) {
    return (
      <Text size="sm" c="dimmed">
        {state.mode === "remote" || state.mode === "loopback" ? "No ids in the list." : "No list URL set."}
      </Text>
    );
  }
  if (state !== null && state.entries.length > 0) {
    return (
      <AdminEntriesList
        entries={state.entries}
        editable={editable}
        busyKey={busyKey}
        nameById={nameById}
        onRemove={onRemove}
      />
    );
  }
  return null;
}

interface AdminsEntriesProps {
  editable: boolean;
  mode: AdminListStateDto["mode"] | undefined;
  interval: number | "…";
  busyKey: string | null;
  loading: boolean;
  state: AdminListStateDto | null;
  error: string | null;
  listError: string | null | undefined;
  nameById: ReadonlyMap<string, string>;
  onAdd: (id: string) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

/** The add form, inline errors and entry rows of the Admins tab. */
export function AdminsEntries({
  editable,
  mode,
  interval,
  busyKey,
  loading,
  state,
  error,
  listError,
  nameById,
  onAdd,
  onRemove,
}: AdminsEntriesProps): ReactElement {
  return (
    <>
      {editable ? (
        <AddIdRow interval={interval} disabled={busyKey !== null} onAdd={onAdd} />
      ) : mode === "remote" ? (
        <Text size="xs" c="dimmed">
          Read-only: this list is hosted elsewhere. Edit it at its source.
        </Text>
      ) : null}

      {error !== null ? (
        <Text size="sm" c="red">
          {error}
        </Text>
      ) : null}
      {listError !== null && listError !== undefined ? (
        <Text size="sm" c="attention">
          {listError}
        </Text>
      ) : null}

      <AdminEntriesBody
        loading={loading}
        state={state}
        editable={editable}
        busyKey={busyKey}
        nameById={nameById}
        onRemove={onRemove}
      />
    </>
  );
}
