import type { ReactElement } from "react";
import { Stack, Text } from "@mantine/core";
import type { IniDiffEntry, IniPreview } from "@shared/types";
import classes from "./ClusterIniDiffSummary.module.css";

interface Props {
  preview: IniPreview;
  /** Shown under the table when secret keys appear in the diff. */
  secretNote?: string;
}

function changeLabel(change: IniDiffEntry["change"]): string {
  if (change === "added") return "Added";
  if (change === "removed") return "Removed";
  return "Changed";
}

function fileLabel(fileKey: IniDiffEntry["fileKey"]): string {
  return fileKey === "game" ? "Game" : "GUS";
}

const SECRET_KEYS = new Set(["ServerAdminPassword", "ServerPassword"]);

export function ClusterIniDiffSummary(props: Props): ReactElement {
  const { preview } = props;
  if (!preview.valid) {
    return (
      <Stack gap="xs">
        {preview.issues.map((issue) => (
          <Text key={`${issue.fileKey}-${issue.message}`} size="sm" c="red">
            {issue.fileKey}: {issue.message}
          </Text>
        ))}
      </Stack>
    );
  }

  if (preview.diff.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No INI differences.
      </Text>
    );
  }

  const secretCount = preview.diff.filter((entry) =>
    SECRET_KEYS.has(entry.key),
  ).length;

  return (
    <Stack gap="sm">
      <div className={classes.table} data-cluster-ini-diff-table>
        <div className={classes.header} role="row">
          <span>Change</span>
          <span>Key</span>
          <span>Before</span>
          <span>After</span>
          <span>File</span>
        </div>
        <div className={classes.body}>
          {preview.diff.map((entry) => (
            <div
              key={`${entry.fileKey}.${entry.section}.${entry.key}.${entry.change}`}
              className={classes.row}
              role="row"
            >
              <span className={classes.change} data-change={entry.change}>
                {changeLabel(entry.change)}
              </span>
              <div className={classes.keyBlock}>
                <div className={classes.key} title={entry.key}>
                  {entry.key}
                </div>
                <div className={classes.section} title={entry.section}>
                  {entry.section}
                </div>
              </div>
              <code className={classes.value} title={entry.before ?? undefined}>
                {entry.before ?? "—"}
              </code>
              <code
                className={classes.valueAfter}
                title={entry.after ?? undefined}
              >
                {entry.after ?? "—"}
              </code>
              <span className={classes.file}>{fileLabel(entry.fileKey)}</span>
            </div>
          ))}
        </div>
      </div>
      {secretCount > 0 && props.secretNote !== undefined && (
        <p className={classes.secretNote}>
          {props.secretNote} ({secretCount} secret field
          {secretCount === 1 ? "" : "s"} redacted in values)
        </p>
      )}
    </Stack>
  );
}
