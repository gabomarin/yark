import type { ReactElement } from "react";
import type { AppEvent } from "@shared/types";
import { StatusWord, type StatusWordTone } from "@ui/StatusWord/StatusWord";
import classes from "../../LogsPage.module.css";

interface Props {
  severity: AppEvent["severity"];
}

function severityTone(severity: AppEvent["severity"]): StatusWordTone {
  if (severity === "error") return "danger";
  if (severity === "warning") return "warn";
  return "neutral";
}

function severityLabel(severity: AppEvent["severity"]): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/** Severity reads as a word + dot: only ERROR/WARNING carry colour (§4). */
export function EventSeverityMark(props: Props): ReactElement {
  return (
    <StatusWord tone={severityTone(props.severity)} className={classes.eventSeverityBadge}>
      {severityLabel(props.severity)}
    </StatusWord>
  );
}
