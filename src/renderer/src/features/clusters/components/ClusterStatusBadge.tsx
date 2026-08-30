import type { ReactElement } from "react";
import { Text } from "@mantine/core";
import type { ClusterComplianceReport } from "@shared/types";
import classes from "./ClusterStatusBadge.module.css";

interface Props {
  report: ClusterComplianceReport;
  size?: "sm" | "md" | "lg";
}

export function ClusterStatusBadge({ report, size = "sm" }: Props): ReactElement {
  const hasWarnings = report.issues.some((issue) => issue.severity === "warning");
  const tone = report.ok ? (hasWarnings ? "warn" : "ok") : "bad";
  const label = report.ok ? (hasWarnings ? "Warnings" : "Ready") : "Errors";
  const textSize = size === "lg" || size === "md" ? "sm" : "xs";

  return (
    <Text
      size={textSize}
      fw={600}
      span
      className={classes.status}
      data-tone={tone}
    >
      {label}
    </Text>
  );
}
