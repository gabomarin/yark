import type { ReactElement, ReactNode } from "react";
import { ArrowClockwise, ArrowCounterClockwise, ArrowUUpLeft, FloppyDisk } from "@phosphor-icons/react";
import { Button, Group, Stack, Text, Title } from "@mantine/core";
import classes from "./ConfigurationEditor.module.css";

interface Props {
  fileLabel: string;
  subtitle: string;
  openFileAction: ReactNode;
  iniNavigation: ReactNode;
  showRestoreFile?: boolean;
  restoreFileDisabled?: boolean;
  dirty: boolean;
  busy: boolean;
  loading?: boolean;
  onReloadFromDisk?: () => void;
  onRestoreFile?: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function ConfigurationEditorHeader(props: Props): ReactElement {
  const {
    fileLabel,
    subtitle,
    openFileAction,
    iniNavigation,
    showRestoreFile = false,
    restoreFileDisabled = false,
    dirty,
    busy,
    loading = false,
    onReloadFromDisk,
    onRestoreFile,
    onDiscard,
    onSave,
  } = props;

  return (
    <Stack gap="sm">
      <div>
        <Group gap="xs" wrap="nowrap">
          <Title order={3}>INI Files</Title>
          {openFileAction}
        </Group>
        <Text c="dimmed" size="sm">
          {subtitle.replace("{fileLabel}", fileLabel)}
        </Text>
      </div>
      <div className={classes.headerToolbar}>
        {iniNavigation}
        <Group gap="xs" wrap="wrap" ml="auto">
          {onReloadFromDisk !== undefined && (
            <Button
              size="xs"
              variant="default"
              leftSection={<ArrowClockwise size={16} />}
              onClick={onReloadFromDisk}
              disabled={busy || loading}
            >
              Reload from disk
            </Button>
          )}
          {showRestoreFile && onRestoreFile !== undefined && (
            <Button
              size="xs"
              variant="default"
              leftSection={<ArrowUUpLeft size={16} />}
              onClick={onRestoreFile}
              disabled={restoreFileDisabled || busy || loading}
            >
              Restore file
            </Button>
          )}
          <Button
            size="xs"
            variant="default"
            leftSection={<ArrowCounterClockwise size={16} />}
            onClick={onDiscard}
            disabled={!dirty || busy}
          >
            Discard changes
          </Button>
          <Button
            size="xs"
            leftSection={<FloppyDisk size={16} />}
            onClick={onSave}
            disabled={!dirty || busy || loading}
          >
            Save
          </Button>
        </Group>
      </div>
    </Stack>
  );
}
