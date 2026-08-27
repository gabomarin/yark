import { FolderOpen } from "@phosphor-icons/react";
import { Button, Group, Text, Tooltip } from "@mantine/core";
import type { ReactElement } from "react";
import { PathField } from "@ui/PathField/PathField";
import type { DraftPolicy } from "../../model/serverBackupPanelModel";
import classes from "../../BackupsPage.module.css";

interface Props {
  draftPolicy: DraftPolicy;
  defaultBackupHint: string;
  resolvedRoot: string | null;
  busy: boolean;
  browsingDir: boolean;
  onDraftPolicyChange: (draft: DraftPolicy) => void;
  onBrowseBackupDir: () => void;
  onOpenDestination: () => void;
}

/** Shared archive root for world, players, and INI backups (#231). */
export function ServerBackupDestination(props: Props): ReactElement {
  const {
    draftPolicy,
    defaultBackupHint,
    resolvedRoot,
    busy,
    browsingDir,
    onDraftPolicyChange,
    onBrowseBackupDir,
    onOpenDestination,
  } = props;

  return (
    <Group
      align="center"
      gap={6}
      wrap="nowrap"
      className={classes.sharedDestination}
      data-server-backup-destination
    >
      <Tooltip label="Shared folder for world, player, and INI archives">
        <Text size="xs" className={classes.inlineLabel}>
          Destination
        </Text>
      </Tooltip>
      <PathField
        id="backup-destination"
        className={classes.dirField}
        size="xs"
        inline
        aria-label="Destination"
        value={draftPolicy.backupDir ?? ""}
        placeholder={
          draftPolicy.backupDir === null || draftPolicy.backupDir.length === 0
            ? defaultBackupHint
            : (resolvedRoot ?? draftPolicy.backupDir)
        }
        busy={browsingDir}
        disabled={busy}
        clearable
        onChange={(value) =>
          onDraftPolicyChange({
            ...draftPolicy,
            backupDir: value.trim().length > 0 ? value : null,
          })
        }
        onBrowse={onBrowseBackupDir}
      />
      <Tooltip label="Open the backup destination folder">
        <Button
          variant="subtle"
          size="xs"
          leftSection={<FolderOpen size={12} />}
          onClick={onOpenDestination}
          disabled={busy}
        >
          Open
        </Button>
      </Tooltip>
    </Group>
  );
}
