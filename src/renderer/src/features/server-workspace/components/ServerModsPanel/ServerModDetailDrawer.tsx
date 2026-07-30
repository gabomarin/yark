import type { ReactElement } from "react";
import {
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Image,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { ArrowSquareOut, Copy } from "@phosphor-icons/react";
import type { ModMetadata } from "@shared/types";

interface Props {
  detail: ModMetadata | null;
  opened: boolean;
  onClose: () => void;
  onOpenExternal: (url: string) => void;
}

export function ServerModDetailDrawer(props: Props): ReactElement {
  const detail = props.detail;
  return (
    <Drawer
      opened={props.opened}
      onClose={props.onClose}
      title="Mod metadata"
      position="right"
      size={440}
    >
      {detail !== null && (
        <Stack gap="md">
          <Group align="flex-start" wrap="nowrap">
            {detail.thumbnailUrl !== null && (
              <Image src={detail.thumbnailUrl} alt="" w={72} h={72} radius="md" />
            )}
            <div>
              <Title order={3}>{detail.name}</Title>
              <Text size="sm" c="dimmed">{detail.authors.join(", ")}</Text>
            </div>
          </Group>
          <Text size="sm">{detail.summary}</Text>
          <Group gap="xs">
            <Badge color="teal">Project ID {detail.id}</Badge>
          </Group>
          <Button
            variant="default"
            leftSection={<Copy size={16} />}
            onClick={() => void navigator.clipboard.writeText(detail.id)}
          >
            Copy Project ID
          </Button>
          <Divider />
          <Stack gap="xs">
            <Meta label="Downloads" value={detail.downloadCount.toLocaleString()} />
            <Meta
              label="Updated"
              value={
                detail.dateModified === new Date(0).toISOString()
                  ? "Unknown"
                  : new Date(detail.dateModified).toLocaleString()
              }
            />
            <Meta label="Slug" value={detail.slug} />
          </Stack>
          <Group gap="xs">
            {(detail.categories ?? []).map((category) => (
              <Badge key={category} color="gray" variant="light">{category}</Badge>
            ))}
          </Group>
          <Button
            leftSection={<ArrowSquareOut size={16} />}
            onClick={() => props.onOpenExternal(detail.curseforgeUrl)}
          >
            Open on CurseForge
          </Button>
        </Stack>
      )}
    </Drawer>
  );
}

function Meta(props: { label: string; value: string }): ReactElement {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm" c="dimmed">{props.label}</Text>
      <Text size="sm" ta="right">{props.value}</Text>
    </Group>
  );
}
