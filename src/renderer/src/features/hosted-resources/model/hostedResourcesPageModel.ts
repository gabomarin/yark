import type { HostedResourceDto, HostedResourceRevisionDto } from "@shared/ipc";
import type { HostedResourceFormat } from "@shared/settings/hosted-resources";

interface FormatOption {
  value: HostedResourceFormat;
  label: string;
  description: string;
}

export const HOSTED_RESOURCE_FORMAT_OPTIONS: FormatOption[] = [
  {
    value: "text",
    label: "Plain text",
    description: "One value per line, e.g. administrator IDs.",
  },
  {
    value: "ini",
    label: "INI",
    description: "Flat Key=Value lines for ASA dynamic configuration.",
  },
  {
    value: "json",
    label: "JSON",
    description: "Structured JSON body.",
  },
];

export function formatLabel(format: HostedResourceFormat): string {
  return (
    HOSTED_RESOURCE_FORMAT_OPTIONS.find((option) => option.value === format)
      ?.label ?? format
  );
}

export function contentPlaceholder(format: HostedResourceFormat): string {
  if (format === "json") {
    return '{\n  "example": true\n}';
  }
  if (format === "ini") {
    return "TamingSpeedMultiplier=5.0\nHarvestAmountMultiplier=2.0";
  }
  return "EOSID0000000000000000000000000000\nEOSID1111111111111111111111111111";
}

export function shortSha(sha: string | null): string {
  return sha === null ? "—" : sha.slice(0, 12);
}

/** UTF-8 byte length of a draft body (matches the publish-time validation). */
export function contentByteLength(content: string): number {
  return new TextEncoder().encode(content).length;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return kb < 100 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Reference counts are per server; wording avoids implying the game loaded it. */
export function summarizeReferences(
  references: { serverId: string }[],
): number {
  return new Set(references.map((reference) => reference.serverId)).size;
}
export function resourcePublishedLabel(resource: HostedResourceDto): string {
  if (!resource.enabled) {
    return "Disabled — not served";
  }
  if (resource.publishedRevisionId === null) {
    return "Nothing published yet";
  }
  return `Serving version ${resource.publishedSequence ?? "?"} · ${shortSha(resource.publishedSha256)}`;
}

export function revisionLabel(revision: HostedResourceRevisionDto): string {
  const when = new Date(revision.publishedAt ?? revision.createdAt);
  const stamp = Number.isNaN(when.getTime())
    ? revision.createdAt
    : when.toLocaleString();
  return `Version ${revision.sequence} · ${stamp}`;
}

/**
 * Badge tone for a served resource: disabled or unpublished is a fact (`gray`), a served
 * resource that stops answering is state (`red`), and a live one is `ok`.
 */
export function servedBadgeColor(resource: {
  enabled: boolean;
  published: boolean;
  servedOk: boolean;
}): string {
  if (!resource.enabled || !resource.published) return "gray";
  return resource.servedOk ? "ok" : "red";
}
