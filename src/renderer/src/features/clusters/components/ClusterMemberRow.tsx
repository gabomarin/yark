import type { ReactElement } from "react";
import { ActionIcon, Badge, Group, Text, Tooltip } from "@mantine/core";
import { ArrowDown, ArrowUp, X } from "@phosphor-icons/react";
import type { ServerProfile, ServerStatus } from "@shared/types";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import classes from "../clusters.module.css";

interface Props {
  server: ServerProfile;
  subtitle: string;
  status?: ServerStatus;
  canRemove?: boolean;
  removeReason?: string | null;
  hasTemplate?: boolean;
  canTemplateApply?: boolean;
  templateApplyReason?: string | null;
  onOpen: (serverId: string) => void;
  onRemove?: (serverId: string) => void;
  onPromoteToTemplate?: (serverId: string) => void;
  onRestoreFromTemplate?: (serverId: string) => void;
}

export function ClusterMemberRow(props: Props): ReactElement {
  const showRemove = props.onRemove !== undefined;
  const showPromote = props.onPromoteToTemplate !== undefined;
  const showRestore = props.onRestoreFromTemplate !== undefined;
  const canApply = props.canTemplateApply !== false;
  const hasTemplate = props.hasTemplate === true;
  const applyReason = props.templateApplyReason ?? "Unavailable";
  const restoreDisabled = !canApply || !hasTemplate;
  const restoreReason = !hasTemplate
    ? "Create an INI template first"
    : applyReason;

  const stopRowOpen = (event: { stopPropagation: () => void }): void => {
    event.stopPropagation();
  };

  return (
    <div
      className={classes.memberRow}
      data-clickable="true"
      role="button"
      tabIndex={0}
      aria-label={`Open ${props.server.name}`}
      onClick={() => props.onOpen(props.server.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          props.onOpen(props.server.id);
        }
        if (event.key === " ") {
          // Prevent page scroll; activate on keyup like a native button.
          event.preventDefault();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " ") {
          event.preventDefault();
          props.onOpen(props.server.id);
        }
      }}
    >
      <div className={classes.memberBody}>
        <Group gap="xs">
          <Text fw={600} size="sm">
            {props.server.name}
          </Text>
          {!props.server.enabled && (
            <Badge size="xs" color="gray" variant="light">
              Inactive
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {props.subtitle}
        </Text>
        {showRemove && props.canRemove === false && props.removeReason != null && (
          <Text size="xs" c="orange">
            {props.removeReason}
          </Text>
        )}
      </div>
      <Group
        gap="xs"
        wrap="nowrap"
        className={classes.memberActions}
        onClick={stopRowOpen}
        onKeyDown={stopRowOpen}
      >
        {props.status !== undefined && (
          <ServerRuntimeStatusBadge status={props.status} size="xs" />
        )}
        {showPromote && (
          <Tooltip
            withArrow
            label={
              canApply
                ? "Promote to template — copy this member’s INI into the cluster template"
                : applyReason
            }
          >
            <span>
              <ActionIcon
                size="sm"
                variant="light"
                color="gray"
                aria-label={`Promote ${props.server.name} to template`}
                disabled={!canApply}
                onClick={() => props.onPromoteToTemplate?.(props.server.id)}
              >
                <ArrowUp size={14} weight="bold" />
              </ActionIcon>
            </span>
          </Tooltip>
        )}
        {showRestore && (
          <Tooltip
            withArrow
            label={
              restoreDisabled
                ? restoreReason
                : "Restore from template — overwrite this member’s INI from the cluster template (with backup)"
            }
          >
            <span>
              <ActionIcon
                size="sm"
                variant="light"
                color="gray"
                aria-label={`Restore ${props.server.name} from template`}
                disabled={restoreDisabled}
                onClick={() => props.onRestoreFromTemplate?.(props.server.id)}
              >
                <ArrowDown size={14} weight="bold" />
              </ActionIcon>
            </span>
          </Tooltip>
        )}
        {showRemove && (
          <Tooltip
            label={
              props.canRemove === false
                ? (props.removeReason ?? "Cannot remove")
                : `Remove ${props.server.name} from this cluster`
            }
          >
            <span>
              <ActionIcon
                size="sm"
                variant="filled"
                color="red"
                aria-label={`Remove ${props.server.name}`}
                disabled={props.canRemove === false}
                onClick={() => props.onRemove?.(props.server.id)}
              >
                <X size={14} weight="bold" />
              </ActionIcon>
            </span>
          </Tooltip>
        )}
      </Group>
    </div>
  );
}
