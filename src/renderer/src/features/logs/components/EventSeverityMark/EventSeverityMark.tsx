import type { ReactElement } from "react";
import { Badge } from "@mantine/core";
import type { AppEvent } from "@shared/types";
import classes from "../../LogsPage.module.css";

interface Props {
  severity: AppEvent["severity"];
}

function severityColor(severity: AppEvent["severity"]): string {
  if (severity === "error") return "red";
  if (severity === "warning") return "yellow";
  return "gray";
}

/** Every event keeps a badge; only ERROR/WARNING use attention color. */
export function EventSeverityMark(props: Props): ReactElement {
  return (
    <Badge
      className={classes.eventSeverityBadge}
      color={severityColor(props.severity)}
      variant="light"
    >
      {props.severity}
    </Badge>
  );
}
