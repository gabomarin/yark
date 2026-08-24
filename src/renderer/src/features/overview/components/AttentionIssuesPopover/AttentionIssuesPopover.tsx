import type { ReactElement } from "react";
import { Popover, Stack, Text } from "@mantine/core";
import { formatInstallationCheckedAt } from "@shared/installation-health";
import type { AttentionIssue } from "../../model/attentionIssues";
import classes from "./AttentionIssuesPopover.module.css";

interface Props {
  issues: AttentionIssue[];
  /** Trigger control (e.g. info ActionIcon). Omitted / empty issues → nothing rendered. */
  target: ReactElement;
}

/** Attention issue details popover — trigger is owned by the caller (#314). */
export function AttentionIssuesPopover({
  issues,
  target,
}: Props): ReactElement | null {
  if (issues.length === 0) {
    return null;
  }

  return (
    <Popover width={340} position="bottom-end" shadow="md" withinPortal>
      <Popover.Target>{target}</Popover.Target>
      <Popover.Dropdown className={classes.dropdown} data-attention-issues>
        <Stack gap="xs" className={classes.issueList}>
          {issues.map((issue) => (
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
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
