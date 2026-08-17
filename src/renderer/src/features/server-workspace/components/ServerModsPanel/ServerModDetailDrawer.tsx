import type { ReactElement } from "react";
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Image,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { ArrowSquareOut, Copy, Plus } from "@phosphor-icons/react";
import {
  isMapCategoryLabel,
  isMapModCandidate,
  suggestMapTokenFromMetadata,
} from "@shared/map-token-suggest";
import type { ModMetadata } from "@shared/types";
import { confirmRemoveServerMod } from "./confirmRemoveServerMod";
import classes from "./ServerModsPanel.module.css";

interface Props {
  detail: ModMetadata | null;
  opened: boolean;
  configured: boolean;
  enabled: boolean;
  busy: boolean;
  onClose: () => void;
  onOpenExternal: (url: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onAdd: (detail: ModMetadata) => void;
  onRemove: (id: string) => void;
}

export function ServerModDetailDrawer(props: Props): ReactElement {
  const detail = props.detail;
  return (
    <Drawer.Root
      opened={props.opened}
      onClose={props.onClose}
      position="right"
      size={440}
    >
      <Drawer.Overlay />
      <Drawer.Content className={classes.detailDrawer}>
        <Drawer.Header>
          <Drawer.Title>Mod details</Drawer.Title>
          <Drawer.CloseButton />
        </Drawer.Header>
        {detail !== null && (
          <>
            <Drawer.Body className={classes.detailDrawerBody}>
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
                {props.configured && (
                  <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                    <div>
                      <Text size="sm" fw={500}>Load on Start</Text>
                      <Text size="xs" c="dimmed">
                        {props.enabled
                          ? "Enabled — included in -mods="
                          : "Disabled — stays on the list"}
                      </Text>
                    </div>
                    <Switch
                      checked={props.enabled}
                      disabled={props.busy}
                      aria-label={
                        `${props.enabled ? "Disable" : "Enable"} ${detail.name} from details`
                      }
                      styles={{ trackLabel: { pointerEvents: "none" } }}
                      onChange={(event) =>
                        props.onToggle(detail.id, event.currentTarget.checked)}
                    />
                  </Group>
                )}
                <Text size="sm">{detail.summary}</Text>
                <ModMapTokenHint detail={detail} />
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
                <Stack gap="xs">
                  <Meta
                    label="Downloads"
                    value={detail.downloadCount.toLocaleString()}
                  />
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
                    <Badge
                      key={category}
                      color={isMapCategoryLabel(category) ? "attention" : "gray"}
                      variant="light"
                      tt="none"
                    >
                      {category}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            </Drawer.Body>
            <div className={classes.detailDrawerFooter}>
              <Button
                variant="default"
                leftSection={<ArrowSquareOut size={16} />}
                onClick={() => props.onOpenExternal(detail.curseforgeUrl)}
              >
                Open on CurseForge
              </Button>
              {props.configured ? (
                <Button
                  color="red"
                  variant="subtle"
                  disabled={props.busy}
                  onClick={() =>
                    confirmRemoveServerMod(
                      { id: detail.id, name: detail.name },
                      props.onRemove,
                    )}
                >
                  Remove
                </Button>
              ) : (
                <Button
                  color="teal"
                  variant="light"
                  leftSection={<Plus size={16} />}
                  loading={props.busy}
                  disabled={props.busy}
                  aria-label={`Add ${detail.name} from details`}
                  onClick={() => props.onAdd(detail)}
                >
                  Add to this server
                </Button>
              )}
            </div>
          </>
        )}
      </Drawer.Content>
    </Drawer.Root>
  );
}

function ModMapTokenHint(props: { detail: ModMetadata }): ReactElement | null {
  if (!isMapModCandidate(props.detail)) return null;
  const suggestion = suggestMapTokenFromMetadata(props.detail);
  return (
    <Alert variant="light" color="blue" title="Map pack">
      {suggestion !== null ? (
        <Stack gap="xs">
          <Text size="sm">
            Launch token{" "}
            <Text span ff="monospace" fw={600}>{suggestion.token}</Text>
            . Choose it under Server Information → Map (Map mods) when you want
            to use it. Your current map is unchanged.
          </Text>
          <Button
            size="compact-xs"
            variant="default"
            leftSection={<Copy size={14} />}
            onClick={() => void navigator.clipboard.writeText(suggestion.token)}
          >
            Copy token
          </Button>
        </Stack>
      ) : (
        <Text size="sm">
          Set the launch token under Server Information → Map → Custom… when you
          want to use it. Your current map is unchanged.
        </Text>
      )}
    </Alert>
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
