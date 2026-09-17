import type { ReactElement } from "react";
import {
  ClockCounterClockwise,
  Copy,
  PencilSimple,
  Power,
  Trash,
} from "@phosphor-icons/react";
import {
  ActionIcon,
  Badge,
  Button,
  CopyButton,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import type { HostedResourceDto } from "@shared/ipc";
import {
  formatByteSize,
  formatLabel,
  resourcePublishedLabel,
} from "../../model/hostedResourcesPageModel";

interface Props {
  resource: HostedResourceDto;
  referencedServerCount: number;
  /** Null until diagnostics have run. */
  observedRequests: number | null;
  busy: boolean;
  onEdit: () => void;
  onRevisions: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onDelete: () => void;
}

export function HostedResourceCard(props: Props): ReactElement {
  const { resource } = props;
  const disabled = !resource.enabled;
  return (
    <AppSurfaceCard data-hosted-resource-card={resource.id}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap="xs" wrap="nowrap">
            <Text fw={600}>{resource.displayName}</Text>
            <Badge variant="light" color="gray" size="sm">
              {formatLabel(resource.format)}
            </Badge>
            {disabled && (
              <Badge variant="light" color="gray" size="sm">
                Disabled
              </Badge>
            )}
          </Group>
          <Group gap={4} wrap="nowrap">
            <CopyButton value={resource.url} timeout={1500}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Copied" : "Copy URL"}>
                  <ActionIcon
                    variant="subtle"
                    aria-label="Copy URL"
                    onClick={copy}
                    disabled={disabled}
                  >
                    <Copy size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
            <Tooltip label="Revisions">
              <ActionIcon variant="subtle" aria-label="Revisions" onClick={props.onRevisions}>
                <ClockCounterClockwise size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={disabled ? "Enable" : "Disable"}>
              <ActionIcon
                variant="subtle"
                color={disabled ? "teal" : "orange"}
                aria-label={disabled ? "Enable resource" : "Disable resource"}
                onClick={() => props.onToggleEnabled(disabled)}
                disabled={props.busy}
              >
                <Power size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete">
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Delete resource"
                onClick={props.onDelete}
                disabled={props.busy}
              >
                <Trash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Text size="sm" ff="monospace" style={{ wordBreak: "break-all" }}>
          {resource.url}
        </Text>

        <Text size="sm" c="dimmed">
          {resourcePublishedLabel(resource)}
        </Text>

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
              ? "Requests: run diagnostics"
              : `${props.observedRequests} request${props.observedRequests === 1 ? "" : "s"} observed`}
          </Text>
        </Group>

        <Group>
          <Button
            size="xs"
            variant="light"
            leftSection={<PencilSimple size={14} />}
            onClick={props.onEdit}
            disabled={props.busy}
          >
            Edit
          </Button>
        </Group>
      </Stack>
    </AppSurfaceCard>
  );
}
