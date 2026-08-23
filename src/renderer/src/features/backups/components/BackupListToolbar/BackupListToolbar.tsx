import type { ReactElement } from "react";
import { ArrowClockwise, HardDrives, Trash, UploadSimple } from "@phosphor-icons/react";
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Tooltip,
} from "@mantine/core";
import type { BackupKind, BackupRecord } from "@shared/types";
import { SearchField } from "@ui/SearchField/SearchField";
import classes from "../../BackupsPage.module.css";

type BusyOp = "create" | "import" | "export" | "other";

interface Props {
  activeKind: BackupKind;
  activeKindLabel: string;
  serverMap: string;
  kindBackups: BackupRecord[];
  currentMapOnly: boolean;
  onCurrentMapOnlyChange: (checked: boolean) => void;
  playerSearch: string;
  onPlayerSearchChange: (value: string) => void;
  opsLocked: boolean;
  installReady: boolean;
  opsLockReason?: string;
  createLocked?: boolean;
  refreshing: boolean;
  loading: boolean;
  busy: boolean;
  busyOp: BusyOp | null;
  showImport: boolean;
  showManualCreate: boolean;
  createBlocked: boolean;
  createTooltip: string;
  createLabel: string;
  deleteTooltip: string;
  actionableSelectedCount: number;
  onRefresh: () => void;
  onImport: () => void;
  onCreate: () => void;
  onDeleteSelected: () => void;
  onClearFailed: () => void;
}

export function BackupListToolbar(props: Props): ReactElement {
  const {
    activeKind,
    activeKindLabel,
    serverMap,
    kindBackups,
    currentMapOnly,
    onCurrentMapOnlyChange,
    playerSearch,
    onPlayerSearchChange,
    opsLocked,
    installReady,
    opsLockReason,
    createLocked,
    refreshing,
    loading,
    busy,
    busyOp,
    showImport,
    showManualCreate,
    createBlocked,
    createTooltip,
    createLabel,
    deleteTooltip,
    actionableSelectedCount,
    onRefresh,
    onImport,
    onCreate,
    onDeleteSelected,
    onClearFailed,
  } = props;

  return (
    <Group
      justify="space-between"
      wrap="wrap"
      align="center"
      gap="xs"
      className={classes.listToolbar}
    >
      <Group gap="xs" wrap="wrap" align="center">
        {activeKind === "world" && kindBackups.length > 0 && (
          <Checkbox
            size="xs"
            label={`Current map only (${serverMap})`}
            checked={currentMapOnly}
            onChange={(event) => onCurrentMapOnlyChange(event.currentTarget.checked)}
          />
        )}
        {activeKind === "players" && kindBackups.length > 0 && (
          <SearchField
            size="xs"
            placeholder="Search players"
            label="Search players"
            value={playerSearch}
            onChange={onPlayerSearchChange}
            className={classes.playerSearch}
          />
        )}
      </Group>
      <Group gap={6} wrap="wrap" align="center">
        {opsLocked && (
          <Badge color="yellow" variant="light" size="sm">
            {!installReady
              ? "Install files before create/restore"
              : opsLockReason != null
                ? "Restore locked while files update"
                : "Server active – stop before restore"}
          </Badge>
        )}
        <Tooltip label="Reload the backup list">
          <ActionIcon
            variant="default"
            size="sm"
            aria-label="Refresh"
            onClick={onRefresh}
            loading={refreshing}
            disabled={loading || busy}
          >
            <ArrowClockwise size={16} />
          </ActionIcon>
        </Tooltip>
        {showImport && (
          <Tooltip label={`Import a YARK ${activeKindLabel.toLowerCase()} ZIP into this catalog`}>
            <Button
              variant="default"
              size="compact-sm"
              leftSection={<UploadSimple size={14} />}
              onClick={onImport}
              loading={busyOp === "import"}
              disabled={loading || createLocked === true || (busy && busyOp !== "import")}
            >
              Import
            </Button>
          </Tooltip>
        )}
        {showManualCreate && (
          <Tooltip label={createTooltip}>
            <Button
              size="compact-sm"
              leftSection={<HardDrives size={14} />}
              onClick={onCreate}
              loading={busyOp === "create"}
              disabled={loading || createBlocked || (busy && busyOp !== "create")}
            >
              {createLabel}
            </Button>
          </Tooltip>
        )}
        <Tooltip label={deleteTooltip}>
          <span>
            <Button
              color="red"
              variant="filled"
              size="compact-sm"
              leftSection={<Trash size={14} />}
              disabled={busy || createLocked === true || actionableSelectedCount === 0}
              onClick={onDeleteSelected}
            >
              Delete
              {actionableSelectedCount > 0 ? ` (${actionableSelectedCount})` : ""}
            </Button>
          </span>
        </Tooltip>
        <Tooltip label="Remove every failed row for this server and backup kind">
          <Button
            color="red"
            variant="filled"
            size="compact-sm"
            disabled={busy || createLocked === true}
            onClick={onClearFailed}
            data-backup-clear-failed
          >
            Clear failed
          </Button>
        </Tooltip>
      </Group>
    </Group>
  );
}
