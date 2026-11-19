import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Badge, Button, Drawer, Group, Image, Stack, Switch, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Broom,
  Copy,
  FolderOpen,
  Moon,
  Plus,
  PuzzlePiece,
  X,
} from "@phosphor-icons/react";
import { isMapCategoryLabel, isMapModCandidate, suggestMapTokenFromMetadata } from "@shared/asa/map-token-suggest";
import type { ModMetadata } from "@shared/types";
import { MAP_NAME_COPY } from "@shared/asa/map-name-copy";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { copyTextToClipboard } from "@ui/copyToClipboard";
import { MapNameHint } from "@ui/MapNameHint/MapNameHint";
import { MetaRow } from "@ui/MetaRow/MetaRow";
import { useUiDensity } from "@app/AppProviders";
import { confirmRemoveServerMod } from "./confirmRemoveServerMod";
import { ModDetailDescription } from "./ModDetailDescription";
import { ModDetailScreenshotCarousel } from "./ModDetailScreenshotCarousel";
import { NO_CURSEFORGE_PAGE_SUBLINE, NO_CURSEFORGE_PAGE_TOOLTIP } from "./serverModsModel";
import {
  CLEAR_DOWNLOADED_FILES_LABEL,
  NO_LOCAL_MOD_FILES_YET,
  OPEN_LOCAL_FOLDER_LABEL,
  clearDownloadedFilesDisabledTitle,
} from "./serverModsRowActions";
import { UNVERIFIED_ADD_BODY, unverifiedAddAlertTitle } from "./ServerModsUnverifiedAddAlert";
import classes from "./ServerModsPanel.module.css";

/** Matches workspace secondary drawers (`ServerWorkspacePage`). */
const DRAWER_OVERLAY_OPACITY = 0.68;

interface Props {
  detail: ModMetadata | null;
  opened: boolean;
  configured: boolean;
  enabled: boolean;
  passive: boolean;
  /** Configured Project ID with no metadata cache (#698). */
  noPage?: boolean;
  /** True while this server (or shared-install ops) is locked — disables Clear downloaded files (#702). */
  serverActive?: boolean;
  /** True when this mod has local ASA folders (#702). */
  hasLocalFiles?: boolean;
  busy: boolean;
  onClose: () => void;
  onOpenExternal: (url: string) => void;
  onOpenLocalFolder?: (id: string) => void;
  onClearDownloadedFiles?: (detail: ModMetadata) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onSetPassive: (id: string, passive: boolean) => void;
  onAdd: (detail: ModMetadata) => void;
  onCheckCurseForge?: (id: string) => void;
  onRemove: (id: string) => void | Promise<boolean | void>;
}

export function ServerModDetailDrawer(props: Props): ReactElement {
  const density = useUiDensity();
  const copyButtonSize = density === "compact" ? "compact-sm" : "sm";
  const footerButtonSize = density === "compact" ? "sm" : "md";
  const [removeConfirmPending, setRemoveConfirmPending] = useState(false);
  const detail = props.detail;
  const noPage = props.noPage === true;
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
                <Drawer.Title className={classes.detailDrawerEyebrow}>Mod details</Drawer.Title>
                <Group align="flex-start" wrap="nowrap" gap="sm" className={classes.detailDrawerIdentity}>
                  <DetailModThumbnail src={detail.thumbnailUrl} />
                  <div className={classes.detailDrawerIdentityText}>
                    <Text component="h2" fw={600} size="lg" lh={1.35} lineClamp={3}>
                      {detail.name}
                    </Text>
                    <Text size="sm" c="dimmed" lineClamp={1} mt={4}>
                      {noPage ? NO_CURSEFORGE_PAGE_SUBLINE : detail.authors.join(", ") || "Unknown author"}
                    </Text>
                  </div>
                </Group>
              </div>
              <Drawer.CloseButton disabled={drawerLocked} />
            </Drawer.Header>

            {noPage && props.configured && (
              <div className={classes.detailDrawerLoadBand}>
                <AppAlert
                  variant="light"
                  color="attention"
                  title={unverifiedAddAlertTitle([detail.id])}
                  className={classes.statusAlert}
                >
                  <Stack gap="sm">
                    <Text size="sm">{UNVERIFIED_ADD_BODY}</Text>
                    <Text size="xs" c="dimmed">
                      {NO_CURSEFORGE_PAGE_TOOLTIP}
                    </Text>
                    {props.onCheckCurseForge !== undefined && (
                      <Group>
                        <Button
                          size="xs"
                          variant="default"
                          leftSection={<ArrowsClockwise size={14} />}
                          loading={props.busy}
                          disabled={drawerLocked}
                          onClick={() => props.onCheckCurseForge?.(detail.id)}
                        >
                          Check CurseForge again
                        </Button>
                      </Group>
                    )}
                  </Stack>
                </AppAlert>
              </div>
            )}

            {props.configured && (
              <div className={classes.detailDrawerLoadBand}>
                <div>
                  <Text size="sm" fw={500}>
                    Enabled
                  </Text>
                  {!props.enabled && (
                    <Text size="xs" c="dimmed">
                      Stays on the list
                    </Text>
                  )}
                </div>
                <Switch
                  checked={props.enabled}
                  disabled={props.busy}
                  aria-label={`${props.enabled ? "Disable" : "Enable"} ${detail.name} from details`}
                  onChange={(event) => props.onToggle(detail.id, event.currentTarget.checked)}
                />
              </div>
            )}

            {props.configured && (
              <div className={classes.detailDrawerLoadBand}>
                <div>
                  <Text size="sm" fw={500}>
                    Passive
                  </Text>
                  <Text size="xs" c="dimmed">
                    {props.passive
                      ? "Loads data only — no spawns. Sent on -passivemods=."
                      : "Load data without spawns (cluster transfer)."}
                  </Text>
                </div>
                <Button
                  size={copyButtonSize}
                  variant="default"
                  leftSection={<Moon size={14} weight={props.passive ? "fill" : "regular"} />}
                  disabled={props.busy || !props.enabled}
                  aria-label={`${props.passive ? "Mark active" : "Mark passive"} ${detail.name} from details`}
                  onClick={() => props.onSetPassive(detail.id, !props.passive)}
                >
                  {props.passive ? "Mark active" : "Mark passive"}
                </Button>
              </div>
            )}

            <Drawer.Body className={classes.detailDrawerBody}>
              <Stack gap="md">
                <Text size="sm" className={classes.detailDrawerSummary}>
                  {detail.summary}
                </Text>
                <ModDetailScreenshotCarousel urls={detail.screenshots ?? []} />
                {typeof detail.description === "string" && detail.description.trim().length > 0 && (
                  <ModDetailDescription text={detail.description} />
                )}
                <MapPackHint detail={detail} />
                <Group gap="xs" wrap="wrap" className={classes.detailDrawerProjectRow}>
                  <Badge variant="light">Project ID {detail.id}</Badge>
                  <Button
                    size={copyButtonSize}
                    variant="default"
                    leftSection={<Copy size={14} />}
                    onClick={() =>
                      void copyTextToClipboard({
                        text: detail.id,
                        failureMessage: "Could not copy Project ID",
                      })
                    }
                  >
                    Copy Project ID
                  </Button>
                </Group>
                <Stack gap="xs" className={classes.detailDrawerMeta}>
                  <MetaRow label="Downloads" value={noPage ? "Unknown" : detail.downloadCount.toLocaleString()} />
                  <MetaRow
                    label="Updated"
                    value={
                      noPage || detail.dateModified === new Date(0).toISOString()
                        ? "Unknown"
                        : new Date(detail.dateModified).toLocaleString()
                    }
                  />
                  {!noPage && <MetaRow label="Slug" value={detail.slug} mono />}
                </Stack>
                {(detail.categories ?? []).length > 0 && (
                  <Group gap="xs" className={classes.detailDrawerCategories}>
                    {(detail.categories ?? []).map((category) => (
                      <Badge key={category} color={isMapCategoryLabel(category) ? "attention" : "gray"} variant="light">
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
                leftSection={<ArrowSquareOut size={16} />}
                disabled={noPage || detail.curseforgeUrl.trim().length === 0}
                onClick={() => props.onOpenExternal(detail.curseforgeUrl)}
              >
                Open on CurseForge
              </Button>
              {props.configured && props.onOpenLocalFolder !== undefined ? (
                <Button
                  className={classes.detailDrawerSecondaryAction}
                  size={footerButtonSize}
                  variant="default"
                  leftSection={<FolderOpen size={16} />}
                  disabled={drawerLocked || props.hasLocalFiles !== true}
                  title={props.hasLocalFiles !== true ? NO_LOCAL_MOD_FILES_YET : undefined}
                  onClick={() => props.onOpenLocalFolder?.(detail.id)}
                >
                  {OPEN_LOCAL_FOLDER_LABEL}
                </Button>
              ) : null}
              {props.configured && props.onClearDownloadedFiles !== undefined ? (
                <Button
                  className={classes.detailDrawerSecondaryAction}
                  size={footerButtonSize}
                  variant="default"
                  leftSection={<Broom size={16} />}
                  disabled={drawerLocked || props.serverActive === true || props.hasLocalFiles !== true}
                  title={clearDownloadedFilesDisabledTitle({
                    hasLocalFiles: props.hasLocalFiles === true,
                    serverActive: props.serverActive === true,
                  })}
                  onClick={() => props.onClearDownloadedFiles?.(detail)}
                >
                  {CLEAR_DOWNLOADED_FILES_LABEL}
                </Button>
              ) : null}
              {props.configured ? (
                <Button
                  className={classes.detailDrawerRemoveAction}
                  size={footerButtonSize}
                  color="red"
                  variant="filled"
                  leftSection={<X size={16} />}
                  disabled={drawerLocked}
                  onClick={() =>
                    confirmRemoveServerMod({ id: detail.id, name: detail.name }, props.onRemove, {
                      onPendingChange: setRemoveConfirmPending,
                    })
                  }
                >
                  Remove
                </Button>
              ) : (
                <Button
                  className={classes.detailDrawerRemoveAction}
                  size={footerButtonSize}
                  color="ok"
                  variant="default"
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

function MapPackHint(props: { detail: ModMetadata }): ReactElement | null {
  if (!isMapModCandidate(props.detail)) return null;
  const suggestion = suggestMapTokenFromMetadata(props.detail);
  return (
    <AppAlert variant="light" color="blue" title={MAP_NAME_COPY.mapPackAlertTitle}>
      <MapNameHint suggestion={suggestion} variant="embedded" />
    </AppAlert>
  );
}
