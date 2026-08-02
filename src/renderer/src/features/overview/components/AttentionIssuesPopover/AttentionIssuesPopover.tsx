import type { ReactElement } from "react";
import { Badge, Popover, Stack, Text } from "@mantine/core";
import {
  formatInstallationCheckedAt,
  installationHealthLabel,
  isInstallationReady,
} from "@shared/installation-health";
import { getServerUpdateState } from "@shared/server-update-status";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import classes from "./AttentionIssuesPopover.module.css";

export interface AttentionIssue {
  serverId: string;
  serverName: string;
  problem: string;
  guidance: string;
  checkedAt: string | null;
}

export function collectAttentionIssues(input: {
  servers: ReadonlyArray<ServerProfile>;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  officialSteamBuild: string | null;
}): AttentionIssue[] {
  const issues: AttentionIssue[] = [];
  for (const server of input.servers) {
    const status = input.statuses.get(server.id)?.status ?? "stopped";
    const installation = input.installationInfo.get(server.id) ?? null;

    if (status === "error") {
      const lastError = input.statuses.get(server.id)?.lastError?.trim();
      issues.push({
        serverId: server.id,
        serverName: server.name,
        problem: "Runtime error",
        guidance: lastError && lastError.length > 0
          ? lastError
          : "Open Logs to inspect the failure, then restart if the install is healthy.",
        checkedAt: installation?.checkedAt ?? null,
      });
      continue;
    }

    // Missing snapshot = not checked yet (scan pending). `unknown` is a final result.
    if (installation == null) {
      continue;
    }

    if (!isInstallationReady(installation)) {
      issues.push({
        serverId: server.id,
        serverName: server.name,
        problem: installationHealthLabel(installation.health),
        guidance:
          installation.guidance ||
          "Check the install path, then use Install or Check installs.",
        checkedAt: installation.checkedAt,
      });
      continue;
    }

    if (getServerUpdateState(installation, input.officialSteamBuild) === "available") {
      issues.push({
        serverId: server.id,
        serverName: server.name,
        problem: "Update available",
        guidance: "Use Update on the server card when you are ready.",
        checkedAt: installation.checkedAt,
      });
    }
  }
  return issues;
}

interface Props {
  issues: AttentionIssue[];
  scanning?: boolean;
}

export function AttentionIssuesPopover({
  issues,
  scanning = false,
}: Props): ReactElement | null {
  if (!scanning && issues.length === 0) {
    return null;
  }

  const label =
    scanning && issues.length === 0
      ? "Checking installs…"
      : issues.length === 1
        ? "1 needs attention"
        : `${issues.length} need attention`;

  return (
    <Popover width={340} position="bottom-start" shadow="md" withinPortal>
      <Popover.Target>
        <Badge
          component="button"
          type="button"
          size="sm"
          color="attention"
          variant="light"
          className={classes.trigger}
          style={{ cursor: "pointer" }}
          data-attention-count={issues.length}
          data-attention-scanning={scanning || undefined}
        >
          {label}
        </Badge>
      </Popover.Target>
      <Popover.Dropdown className={classes.dropdown} data-attention-issues>
        <Stack gap="xs" className={classes.issueList}>
          {scanning && issues.length === 0 ? (
            <Text size="sm" c="dimmed">
              Checking install folders in the background…
            </Text>
          ) : (
            issues.map((issue) => (
              <div
                key={issue.serverId}
                className={classes.issueRow}
                data-attention-issue={issue.serverId}
              >
                <Text size="sm" fw={600} className={classes.issueName}>
                  {issue.serverName}
                </Text>
                <Text size="xs" c="attention.6" fw={600}>
                  {issue.problem}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={2}>
                  {issue.guidance}
                </Text>
                {issue.checkedAt != null && (
                  <Text size="xs" c="dimmed">
                    Checked {formatInstallationCheckedAt(issue.checkedAt)}
                  </Text>
                )}
              </div>
            ))
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
