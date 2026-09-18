import type { ReactElement } from "react";
import {
  ClockCounterClockwise,
  Copy,
  DotsThreeVertical,
  PencilSimple,
  Power,
  Trash,
} from "@phosphor-icons/react";
import {
  ActionIcon,
  Badge,
  CopyButton,
  Group,
  Menu,
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
    <AppSurfaceCard radius={0} data-hosted-resource-card={resource.id}>
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
            <Tooltip label="Edit">
              <ActionIcon
                variant="subtle"
                aria-label="Edit"
                onClick={props.onEdit}
                disabled={props.busy}
              >
                <PencilSimple size={16} />
              </ActionIcon>
            </Tooltip>
            <Menu shadow="md" withinPortal position="bottom-end">
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  aria-label="More resource actions"
                  disabled={props.busy}
                >
                  <DotsThreeVertical size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<ClockCounterClockwise size={16} />}
                  onClick={props.onRevisions}
                >
                  Revisions
                </Menu.Item>
                <Menu.Item
                  leftSection={<Power size={16} />}
                  color={disabled ? "teal" : "orange"}
                  onClick={() => props.onToggleEnabled(disabled)}
                >
                  {disabled ? "Enable resource" : "Disable resource"}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<Trash size={16} />}
                  color="red"
                  onClick={props.onDelete}
                >
                  Delete resource
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        <Text size="sm" ff="monospace" style={{ wordBreak: "break-all" }}>
          {resource.url}
        </Text>

        <Text size="sm" c="dimmed">
          {resourcePublishedLabel(resource)}
        </Text>

        {resource.notes.length > 0 && <Text size="sm">{resource.notes}</Text>}
        {resource.tags.length > 0 && (
          <Group gap="xs">
            {resource.tags.map((tag) => (
              <Badge key={tag} variant="light" color="blue" size="sm">
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
              ? "Requests: run diagnostics"
              : `${props.observedRequests} request${props.observedRequests === 1 ? "" : "s"} observed`}
          </Text>
        </Group>
      </Stack>
    </AppSurfaceCard>
  );
}
