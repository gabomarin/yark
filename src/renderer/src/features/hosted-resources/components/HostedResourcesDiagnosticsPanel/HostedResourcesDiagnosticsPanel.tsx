import type { ReactElement } from "react";
import { Badge, Button, Group, Stack, Text } from "@mantine/core";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import type { HostedResourcesDiagnosticsDto } from "@shared/ipc";
import { shortSha } from "../../model/hostedResourcesPageModel";

interface Props {
  diagnostics: HostedResourcesDiagnosticsDto | null;
  busy: boolean;
  onRun: () => void;
}

export function HostedResourcesDiagnosticsPanel(props: Props): ReactElement {
  const diagnostics = props.diagnostics;
  return (
    <AppSurfaceCard radius={0} data-hosted-resources-diagnostics>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Diagnostics</Text>
          <Button
            size="xs"
            variant="default"
            leftSection={<ArrowClockwise size={14} />}
            loading={props.busy}
            onClick={props.onRun}
          >
            Run diagnostics
          </Button>
        </Group>

        {diagnostics === null ? (
          <Text size="sm" c="dimmed">
            Probes loopback ownership, re-reads each served resource and compares
            SHA-256, and scans managed server INIs for exact YARK URLs.
          </Text>
        ) : (
          <>
            <Group gap="xs">
              <Badge
                variant="light"
                  color={diagnostics.ownership.ok ? "ok" : "red"}
              >
                {diagnostics.ownership.ok ? "Loopback ownership verified" : "Ownership failed"}
              </Badge>
              <Text size="sm" c="dimmed">
                {diagnostics.ownership.message}
              </Text>
            </Group>

            {!diagnostics.ownership.ok && (
              <AppAlert
                color="red"
                variant="light"
                title="Host is not serving"
                icon={<WarningCircle size={16} />}
              >
                A stale URL must not be trusted while the port is unavailable or owned
                by another process.
              </AppAlert>
            )}

            <Stack gap="xs">
              {diagnostics.resources.map((resource) => (
                <Group
                  key={resource.resourceId}
                  justify="space-between"
                  wrap="nowrap"
                  data-hosted-resource-diagnostic={resource.resourceId}
                >
                  <div>
                    <Text size="sm" fw={600}>
                      {resource.displayName}
                    </Text>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {resource.url}
                    </Text>
                  </div>
                  <Stack gap={2} align="flex-end">
                    <Badge
                      variant="light"
                      color={
                        !resource.enabled || !resource.published
                          ? "gray"
                          : resource.servedOk
                            ? "ok"
                            : "red"
                      }
                    >
                      {!resource.enabled
                        ? "Disabled"
                        : !resource.published
                          ? "Nothing published"
                          : resource.servedOk
                            ? "Bytes match"
                            : "Bytes mismatch / unreachable"}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      declared {shortSha(resource.declaredSha256)} · served{" "}
                      {shortSha(resource.servedSha256)} · {resource.requestCount} requests
                    </Text>
                  </Stack>
                </Group>
              ))}
            </Stack>

            <div>
              <Text size="sm" fw={600}>
                Discovered references
              </Text>
              {diagnostics.references.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No managed server INI contains one of these exact URLs yet. Paste one
                  into a URL setting (for example `AdminListURL`) to wire it up.
                </Text>
              ) : (
                <Stack gap={2}>
                  {diagnostics.references.map((reference) => (
                    <Text
                      key={`${reference.serverId}:${reference.key}:${reference.url}`}
                      size="sm"
                      ff="monospace"
                    >
                      {reference.serverName} · {reference.key} · {reference.url}
                    </Text>
                  ))}
                </Stack>
              )}
            </div>

            <Text size="xs" c="dimmed">
              A served match only proves YARK returned those bytes over loopback; it does
              not prove the game accepted them.
            </Text>
          </>
        )}
      </Stack>
    </AppSurfaceCard>
  );
}
