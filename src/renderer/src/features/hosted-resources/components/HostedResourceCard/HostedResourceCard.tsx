import type { ReactElement } from "react";
import { ClockCounterClockwise, Copy, DotsThreeVertical, PencilSimple, Power, Trash } from "@phosphor-icons/react";
import { ActionIcon, Anchor, Badge, CopyButton, Group, Menu, Stack, Text, Tooltip } from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import type { HostedResourceDiagnosticStatus, HostedResourceDto, HostedResourceReferenceDto } from "@shared/ipc";
import { HOSTED_RESOURCE_SURFACE_LABELS, consumerForSetting } from "@shared/settings/hosted-resource-consumers";
import {
  formatByteSize,
  formatLabel,
  resourceStateBadge,
  resourceVersionLabel,
} from "../../model/hostedResourcesPageModel";

interface Props {
  resource: HostedResourceDto;
  referencedServerCount: number;
  /** Null until diagnostics have run. */
  observedRequests: number | null;
  /** Null until diagnostics have run; never inferred from "published". */
  diagnosticStatus: HostedResourceDiagnosticStatus | null;
  referenceIssues: HostedResourceReferenceDto[];
  onOpenReference: (reference: HostedResourceReferenceDto) => void;
  busy: boolean;
  onEdit: () => void;
  onRevisions: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onDelete: () => void;
}

export function HostedResourceCard(props: Props): ReactElement {
  const { resource } = props;
  const disabled = !resource.enabled;
  const badge = resourceStateBadge(resource, props.diagnosticStatus);
  const versionLabel = resourceVersionLabel(resource);
  const hasPreviousPortReference = props.referenceIssues.some((reference) => reference.status === "stale-port");
  const hasDisabledReference = props.referenceIssues.some((reference) => reference.status === "disabled");
  return (
    <AppSurfaceCard radius={0} data-hosted-resource-card={resource.id}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap="xs" wrap="nowrap">
            <Text fw={600}>{resource.displayName}</Text>
            <Badge variant="light" color="gray">
              {formatLabel(resource.format)}
            </Badge>
            <Badge variant="light" color={badge.color} data-hosted-resource-state>
              {badge.label}
            </Badge>
            {hasPreviousPortReference && (
              <Badge variant="light" color="attention">
                Previous port
              </Badge>
            )}
            {hasDisabledReference && (
              <Badge variant="light" color="attention">
                Referenced while disabled
              </Badge>
            )}
          </Group>
          <Group gap={4} wrap="nowrap">
            <CopyButton value={resource.url} timeout={1500}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Copied" : "Copy URL"}>
                  <ActionIcon variant="subtle" aria-label="Copy URL" onClick={copy} disabled={disabled}>
                    <Copy size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
            <Tooltip label="Edit">
              <ActionIcon variant="subtle" aria-label="Edit" onClick={props.onEdit} disabled={props.busy}>
                <PencilSimple size={16} />
              </ActionIcon>
            </Tooltip>
            <Menu shadow="md" withinPortal position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" aria-label="More resource actions" disabled={props.busy}>
                  <DotsThreeVertical size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<ClockCounterClockwise size={16} />} onClick={props.onRevisions}>
                  Revisions
                </Menu.Item>
                <Menu.Item
                  leftSection={<Power size={16} />}
                  color={disabled ? "ok" : "attention"}
                  onClick={() => props.onToggleEnabled(disabled)}
                >
                  {disabled ? "Enable resource" : "Disable resource"}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item leftSection={<Trash size={16} />} color="red" onClick={props.onDelete}>
                  Delete resource
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        <Text size="sm" ff="monospace" style={{ wordBreak: "break-all" }}>
          {resource.url}
        </Text>

        {props.referenceIssues.length > 0 && (
          <Stack gap={2}>
            <Text size="sm" c="attention" fw={600}>
              {hasDisabledReference
                ? disabledReferenceMessage(props.referenceIssues)
                : "Some server settings still use a previous URL for this resource."}
            </Text>
            {props.referenceIssues.map((reference) => (
              <Text key={`${reference.serverId}:${reference.key}`} size="xs" c="dimmed">
                Fix in{" "}
                <Anchor
                  component="button"
                  type="button"
                  size="xs"
                  onClick={() => props.onOpenReference(reference)}
                >
                  {reference.serverName} · {referenceLocation(reference.key)}
                </Anchor>
              </Text>
            ))}
          </Stack>
        )}

        {versionLabel !== null && (
          <Text size="sm" c="dimmed">
            {versionLabel}
          </Text>
        )}

        {resource.notes.length > 0 && <Text size="sm">{resource.notes}</Text>}
        {resource.tags.length > 0 && (
          <Group gap="xs">
            {resource.tags.map((tag) => (
              <Badge key={tag} variant="light">
                {tag}
              </Badge>
            ))}
          </Group>
        )}

        <Group gap="lg">
          <Text size="xs" c="dimmed" data-hosted-resource-current-size>
            {resource.publishedSizeBytes === null
              ? "Current size: —"
              : `Current size: ${formatByteSize(resource.publishedSizeBytes)}`}
          </Text>
          <Text size="xs" c="dimmed">
            {resource.revisionCount} revision{resource.revisionCount === 1 ? "" : "s"}
          </Text>
          <Text size="xs" c="dimmed">
            {props.referencedServerCount} server
            {props.referencedServerCount === 1 ? "" : "s"} reference this URL
          </Text>
          <Text size="xs" c="dimmed">
            {props.observedRequests === null
              ? "Requests: check health"
              : `${props.observedRequests} request${props.observedRequests === 1 ? "" : "s"} observed`}
          </Text>
        </Group>
      </Stack>
    </AppSurfaceCard>
  );
}

function disabledReferenceMessage(references: HostedResourceReferenceDto[]): string {
  if (references.length === 1) {
    const reference = references[0];
    if (reference === undefined) {
      return "This resource is disabled, but a server setting still references it.";
    }
    return `This resource is disabled, but ${referenceLocation(reference.key)} still references it through ${reference.key}.`;
  }
  return "This resource is disabled, but server settings still reference it.";
}

function referenceLocation(key: string): string {
  const consumer = consumerForSetting(key);
  return consumer === null ? "server settings" : HOSTED_RESOURCE_SURFACE_LABELS[consumer.surface];
}
