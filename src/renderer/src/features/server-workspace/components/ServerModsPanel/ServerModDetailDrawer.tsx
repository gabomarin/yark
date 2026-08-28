import { useEffect, useState } from "react";
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
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { ArrowSquareOut, Copy, Plus, PuzzlePiece, X } from "@phosphor-icons/react";
import {
  isMapCategoryLabel,
  isMapModCandidate,
  suggestMapTokenFromMetadata,
} from "@shared/map-token-suggest";
import type { ModMetadata } from "@shared/types";
import { copyTextToClipboard } from "@ui/copyToClipboard";
import { MetaRow } from "@ui/MetaRow/MetaRow";
import { useUiDensity } from "@app/AppProviders";
import { confirmRemoveServerMod } from "./confirmRemoveServerMod";
import { ModDetailDescription } from "./ModDetailDescription";
import { ModDetailScreenshotCarousel } from "./ModDetailScreenshotCarousel";
import classes from "./ServerModsPanel.module.css";

/** Matches workspace secondary drawers (`ServerWorkspacePage`). */
const DRAWER_OVERLAY_OPACITY = 0.68;

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
  onRemove: (id: string) => void | Promise<boolean | void>;
}

export function ServerModDetailDrawer(props: Props): ReactElement {
  const density = useUiDensity();
  const copyButtonSize = density === "compact" ? "compact-sm" : "sm";
  const footerButtonSize = density === "compact" ? "sm" : "md";
  const [removeConfirmPending, setRemoveConfirmPending] = useState(false);
  const detail = props.detail;
  const drawerLocked = removeConfirmPending || props.busy;

  const handleClose = () => {
    if (removeConfirmPending) {
      modals.closeAll();
      if (props.busy) {
        return;
      }
      setRemoveConfirmPending(false);
    }
    props.onClose();
  };

  return (
    <Drawer.Root
      opened={props.opened}
      onClose={handleClose}
      closeOnClickOutside={!drawerLocked}
      closeOnEscape={!drawerLocked}
      position="right"
      size={440}
    >
      <Drawer.Overlay backgroundOpacity={DRAWER_OVERLAY_OPACITY} />
      <Drawer.Content classNames={{ content: classes.detailDrawer }}>
        {detail !== null && (
          <div className={classes.detailDrawerShell}>
            <Drawer.Header className={classes.detailDrawerHeader}>
              <div className={classes.detailDrawerHeaderInner}>
                <Drawer.Title className={classes.detailDrawerEyebrow}>
                  Mod details
                </Drawer.Title>
                <Group
                  align="flex-start"
                  wrap="nowrap"
                  gap="sm"
                  className={classes.detailDrawerIdentity}
                >
                  <DetailModThumbnail src={detail.thumbnailUrl} />
                  <div className={classes.detailDrawerIdentityText}>
                    <Text
                      component="h2"
                      fw={600}
                      size="lg"
                      lh={1.35}
                      lineClamp={3}
                    >
                      {detail.name}
                    </Text>
                    <Text size="sm" c="dimmed" lineClamp={1} mt={4}>
                      {detail.authors.join(", ")}
                    </Text>
                  </div>
                </Group>
              </div>
              <Drawer.CloseButton disabled={drawerLocked} />
            </Drawer.Header>

            {props.configured && (
              <div className={classes.detailDrawerLoadBand}>
                <div>
                  <Text size="sm" fw={500}>Enabled</Text>
                  {!props.enabled && (
                    <Text size="xs" c="dimmed">Stays on the list</Text>
                  )}
                </div>
                <Switch
                  checked={props.enabled}
                  disabled={props.busy}
                  aria-label={
                    `${props.enabled ? "Disable" : "Enable"} ${detail.name} from details`
                  }
                  onChange={(event) =>
                    props.onToggle(detail.id, event.currentTarget.checked)}
                />
              </div>
            )}

            <Drawer.Body className={classes.detailDrawerBody}>
              <Stack gap="md">
                <Text size="sm" className={classes.detailDrawerSummary}>
                  {detail.summary}
                </Text>
                <ModDetailScreenshotCarousel
                  urls={detail.screenshots ?? []}
                />
                {typeof detail.description === "string" &&
                  detail.description.trim().length > 0 && (
                    <ModDetailDescription text={detail.description} />
                  )}
                <ModMapTokenHint detail={detail} />
                <Group gap="xs" wrap="wrap" className={classes.detailDrawerProjectRow}>
                  <Badge
                    variant="light"
                    color="blue"
                    radius="xl"
                    tt="none"
                    className={classes.detailDrawerProjectBadge}
                  >
                    Project ID {detail.id}
                  </Badge>
                  <Button
                    size={copyButtonSize}
                    variant="default"
                    radius="md"
                    leftSection={<Copy size={14} />}
                    onClick={() => void copyTextToClipboard({
                      text: detail.id,
                      failureMessage: "Could not copy Project ID",
                    })}
                  >
                    Copy Project ID
                  </Button>
                </Group>
                <Stack gap="xs" className={classes.detailDrawerMeta}>
                  <MetaRow
                    label="Downloads"
                    value={detail.downloadCount.toLocaleString()}
                  />
                  <MetaRow
                    label="Updated"
                    value={
                      detail.dateModified === new Date(0).toISOString()
                        ? "Unknown"
                        : new Date(detail.dateModified).toLocaleString()
                    }
                  />
                  <MetaRow
                    label="Slug"
                    value={detail.slug}
                    mono
                  />
                </Stack>
                {(detail.categories ?? []).length > 0 && (
                  <Group gap="xs" className={classes.detailDrawerCategories}>
                    {(detail.categories ?? []).map((category) => (
                      <Badge
                        key={category}
                        size="sm"
                        radius="xl"
                        color={isMapCategoryLabel(category) ? "attention" : "gray"}
                        variant="light"
                        tt="none"
                      >
                        {category}
                      </Badge>
                    ))}
                  </Group>
                )}
              </Stack>
            </Drawer.Body>

            <div className={classes.detailDrawerFooter}>
              <Button
                className={classes.detailDrawerPrimaryAction}
                size={footerButtonSize}
                variant="default"
                radius="md"
                leftSection={<ArrowSquareOut size={16} />}
                onClick={() => props.onOpenExternal(detail.curseforgeUrl)}
              >
                Open on CurseForge
              </Button>
              {props.configured ? (
                <Button
                  className={classes.detailDrawerRemoveAction}
                  size={footerButtonSize}
                  color="red"
                  variant="filled"
                  radius="md"
                  leftSection={<X size={16} />}
                  disabled={drawerLocked}
                  onClick={() =>
                    confirmRemoveServerMod(
                      { id: detail.id, name: detail.name },
                      props.onRemove,
                      { onPendingChange: setRemoveConfirmPending },
                    )}
                >
                  Remove
                </Button>
              ) : (
                <Button
                  className={classes.detailDrawerRemoveAction}
                  size={footerButtonSize}
                  color="teal"
                  variant="light"
                  radius="md"
                  leftSection={<Plus size={16} />}
                  loading={props.busy}
                  disabled={drawerLocked}
                  aria-label={`Add ${detail.name} from details`}
                  onClick={() => props.onAdd(detail)}
                >
                  Add to this server
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer.Content>
    </Drawer.Root>
  );
}

function DetailModThumbnail(props: { src: string | null }): ReactElement {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [props.src]);

  const showImage = props.src !== null && !imageFailed;

  return (
    <div className={classes.detailDrawerThumb}>
      <PuzzlePiece size={22} aria-hidden="true" />
      {showImage && (
        <Image
          src={props.src!}
          alt=""
          loading="eager"
          className={classes.detailDrawerThumbImage}
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  );
}

function ModMapTokenHint(props: { detail: ModMetadata }): ReactElement | null {
  const density = useUiDensity();
  const copyButtonSize = density === "compact" ? "compact-sm" : "sm";
  if (!isMapModCandidate(props.detail)) return null;
  const suggestion = suggestMapTokenFromMetadata(props.detail);
  return (
    <Alert variant="light" color="blue" title="Map pack" radius="md">
      {suggestion !== null ? (
        <Stack gap="xs">
          <Text size="sm">
            Launch token{" "}
            <Text span ff="monospace" fw={600}>{suggestion.token}</Text>
            . Choose it under Server Information → Map (Map mods) when you want
            to use it. Your current map is unchanged.
          </Text>
          <Button
            size={copyButtonSize}
            variant="default"
            radius="md"
            leftSection={<Copy size={14} />}
            onClick={() => void copyTextToClipboard({
              text: suggestion.token,
              failureMessage: "Could not copy launch token",
            })}
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
