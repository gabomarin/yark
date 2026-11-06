import type { ReactElement, ReactNode } from "react";
import { ArrowClockwise, ArrowCounterClockwise, ArrowUUpLeft, FloppyDisk } from "@phosphor-icons/react";
import { ActionIcon, Button, Group, Tooltip } from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
import { WorkspaceSectionHeader } from "@ui/WorkspaceSectionHeader/WorkspaceSectionHeader";
import classes from "./ConfigurationEditor.module.css";

interface Props {
  fileLabel: string;
  subtitle: string;
  openFileAction: ReactNode;
  iniNavigation: ReactNode;
  /** Game.ini Visual views. Own row under the file toolbar, so later editors do not push Save. */
  gameViewNav?: ReactNode;
  showRestoreFile?: boolean;
  restoreFileDisabled?: boolean;
  dirty: boolean;
  /** A visible error in the open view. Save stays off; Discard stays available. */
  invalid?: boolean;
  /** Any pending edit, including one on another view. */
  discardDirty?: boolean;
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
    gameViewNav = null,
    showRestoreFile = false,
    restoreFileDisabled = false,
    dirty,
    invalid = false,
    discardDirty,
    busy,
    loading = false,
    onReloadFromDisk,
    onRestoreFile,
    onDiscard,
    onSave,
  } = props;

  const density = useUiDensity();
  const actionSize = density === "compact" ? "md" : "lg";
  const iconSize = density === "compact" ? 16 : 18;
  const reloadDisabled = busy || loading;
  const restoreDisabled = restoreFileDisabled || busy || loading;
  const discardDisabled = !(discardDirty ?? dirty) || busy;
  const saveDisabled = !dirty || invalid || busy || loading;
  const showReload = onReloadFromDisk !== undefined;
  const showRestore = showRestoreFile && onRestoreFile !== undefined;

  return (
    <WorkspaceSectionHeader
      title="INI Files"
      subtitle={subtitle.replace("{fileLabel}", fileLabel)}
      actions={openFileAction}
      toolbar={
        <div className={classes.headerToolbarStack}>
          <div className={classes.headerToolbar}>
            {iniNavigation}
            <div className={classes.fileActions}>
              <div className={classes.fileActionsLabel}>
              <Group gap="xs" wrap="wrap">
                {showReload && (
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<ArrowClockwise size={16} />}
                    onClick={onReloadFromDisk}
                    disabled={reloadDisabled}
                  >
                    Reload from disk
                  </Button>
                )}
                {showRestore && (
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<ArrowUUpLeft size={16} />}
                    onClick={onRestoreFile}
                    disabled={restoreDisabled}
                  >
                    Restore file
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<ArrowCounterClockwise size={16} />}
                  onClick={onDiscard}
                  disabled={discardDisabled}
                >
                  Discard changes
                </Button>
                <Button size="xs" leftSection={<FloppyDisk size={16} />} onClick={onSave} disabled={saveDisabled}>
                  Save
                </Button>
              </Group>
              </div>
              <div className={classes.fileActionsIcon}>
              <Group gap="xs" wrap="nowrap">
                {showReload && (
                  <FileActionIcon
                    label="Reload from disk"
                    size={actionSize}
                    disabled={reloadDisabled}
                    onClick={onReloadFromDisk}
                    icon={<ArrowClockwise size={iconSize} />}
                  />
                )}
                {showRestore && (
                  <FileActionIcon
                    label="Restore file"
                    size={actionSize}
                    disabled={restoreDisabled}
                    onClick={onRestoreFile}
                    icon={<ArrowUUpLeft size={iconSize} />}
                  />
                )}
                <FileActionIcon
                  label="Discard changes"
                  size={actionSize}
                  disabled={discardDisabled}
                  onClick={onDiscard}
                  icon={<ArrowCounterClockwise size={iconSize} />}
                />
                <FileActionIcon
                  label="Save"
                  size={actionSize}
                  variant="filled"
                  disabled={saveDisabled}
                  onClick={onSave}
                  icon={<FloppyDisk size={iconSize} />}
                />
              </Group>
              </div>
            </div>
          </div>
          {gameViewNav}
        </div>
      }
    />
  );
}

function FileActionIcon(props: {
  label: string;
  size: "md" | "lg";
  disabled: boolean;
  variant?: "default" | "filled";
  onClick: () => void;
  icon: ReactElement;
}): ReactElement {
  return (
    <Tooltip label={props.label}>
      <span className={classes.tooltipTarget}>
        <ActionIcon
          variant={props.variant ?? "default"}
          size={props.size}
          aria-label={props.label}
          disabled={props.disabled}
          onClick={props.onClick}
        >
          {props.icon}
        </ActionIcon>
      </span>
    </Tooltip>
  );
}
