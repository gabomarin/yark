import { Warning, WarningCircle } from "@phosphor-icons/react";
import { Text } from "@mantine/core";
import type { ClusterComplianceIssue } from "@shared/types";
import classes from "../clusters.module.css";

interface Props {
  issue: ClusterComplianceIssue;
  relatedServerName: string | null;
}

export function ClusterIssueRow(props: Props): JSX.Element {
  return (
    <li className={classes.issueRow} data-severity={props.issue.severity}>
      <span className={classes.issueIcon}>
        {props.issue.severity === "error" ? (
          <WarningCircle size={16} />
        ) : (
          <Warning size={16} />
        )}
      </span>
      <div className={classes.issueCopy}>
        <Text size="sm">{props.issue.message}</Text>
        {props.relatedServerName !== null && (
          <Text size="xs" c="dimmed">
            Related server: {props.relatedServerName}
          </Text>
        )}
      </div>
    </li>
  );
}
