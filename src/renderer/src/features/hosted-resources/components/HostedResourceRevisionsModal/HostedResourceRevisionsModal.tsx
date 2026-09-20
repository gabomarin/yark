import type { ReactElement } from "react";
import { Badge, Button, Group, ScrollArea, Stack, Text } from "@mantine/core";
import type { HostedResourceRevisionDto } from "@shared/ipc";
import { AppPanelModal } from "@ui/AppPanelModal/AppPanelModal";
import { revisionLabel, shortSha } from "../../model/hostedResourcesPageModel";

interface Props {
  opened: boolean;
  revisions: HostedResourceRevisionDto[];
  busy: boolean;
  onClose: () => void;
  onPublish: (revisionId: string) => void;
}

export function HostedResourceRevisionsModal(props: Props): ReactElement {
  return (
    <AppPanelModal
      opened={props.opened}
      onClose={props.onClose}
      title="Revisions"
      meta="Published versions of this hosted resource"
      size={672}
    >
      <Stack gap="xs">
        {props.revisions.length === 0 ? (
          <Text size="sm" c="dimmed">
            Loading revisions…
          </Text>
        ) : (
          <ScrollArea.Autosize mah={420}>
            <Stack gap="xs">
              {props.revisions.map((revision) => (
                <Group
                  key={revision.id}
                  justify="space-between"
                  wrap="nowrap"
                  data-hosted-resource-revision={revision.id}
                >
                  <div>
                    <Group gap="xs">
                      <Text size="sm" fw={600}>
                        {revisionLabel(revision)}
                      </Text>
                      {revision.published && (
                        <Badge variant="light" color="ok">
                          Current
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {shortSha(revision.sha256)} · {revision.sizeBytes} bytes
                    </Text>
                  </div>
                  <Button
                    size="xs"
                    variant="default"
                    disabled={revision.published || props.busy}
                    onClick={() => props.onPublish(revision.id)}
                  >
                    Restore
                  </Button>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </AppPanelModal>
  );
}
