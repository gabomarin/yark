export type DownloadRowMetaInput = {
  subtitle: string;
  phase: string;
  statusLabel: string;
  byteProgress: string | null;
  byteProgressNoun: string | null;
};

const PHASE_LABELS: Record<string, string> = {
  queued: "Queued",
  cancelled: "Cancelled",
  paused: "Paused",
  failed: "Failed",
  blocked: "Blocked",
  downloading: "Downloading",
  validating: "Validating",
  validated: "Validated",
  "applying-files": "Applying files",
  "files-applied": "Files applied",
  "restarting-server": "Restarting server",
  "stopping-server": "Stopping server",
  "creating-pre-update-backup": "Creating pre-update backup",
  "pre-update-backup-complete": "Pre-update backup complete",
  "rollback-complete": "Rollback complete",
};

function kebabToSentence(value: string): string {
  const spaced = value.replace(/[-_]+/g, " ").trim();
  if (spaced.length === 0) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Humanize durable job phases (`applying-files` → `Applying files`). */
export function formatDownloadPhase(phase: string): string {
  const trimmed = phase.trim();
  if (trimmed.length === 0) return trimmed;
  const known = PHASE_LABELS[trimmed];
  if (known !== undefined) return known;
  if (trimmed.startsWith("rollback-")) {
    return `Rollback: ${kebabToSentence(trimmed.slice("rollback-".length))}`;
  }
  return kebabToSentence(trimmed);
}

function isRedundantPhase(statusLabel: string, phase: string): boolean {
  return (
    statusLabel.replace(/[-_]+/g, " ").toLowerCase()
    === phase.replace(/[-_]+/g, " ").toLowerCase()
  );
}

/** Subtitle plus optional bytes or non-redundant phase. */
export function downloadRowMeta(row: DownloadRowMetaInput): string {
  if (row.byteProgress !== null && row.byteProgressNoun !== null) {
    return `${row.subtitle} · ${row.byteProgressNoun}: ${row.byteProgress}`;
  }
  if (isRedundantPhase(row.statusLabel, row.phase)) {
    return row.subtitle;
  }
  // Blocked leftovers often keep phase "queued" — don't say Queued next to BLOCKED.
  if (row.statusLabel !== "queued" && isRedundantPhase("queued", row.phase)) {
    return row.subtitle;
  }
  return `${row.subtitle} · ${row.phase}`;
}
