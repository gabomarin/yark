import { useEffect, useState, type ReactElement } from "react";
import {
  Alert,
  Button,
  Group,
  Image,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { ArrowSquareOut, MapTrifold, PuzzlePiece } from "@phosphor-icons/react";
import { decodeHtmlEntities } from "@shared/decode-html-entities";
import { suggestMapTokenFromMetadata } from "@shared/map-token-suggest";
import type { ModMetadata } from "@shared/types";
import { CopyMetadataRow } from "@ui/CopyMetadataRow/CopyMetadataRow";
import { MapNameHint } from "@ui/MapNameHint/MapNameHint";
import { useUiDensity } from "@app/AppProviders";
import { ModDetailScreenshotCarousel } from "@features/server-workspace/components/ServerModsPanel/ModDetailScreenshotCarousel";
import classes from "./ServerFormMapsSearchModal.module.css";

interface Props {
  detail: ModMetadata;
  loading: boolean;
  error: string | null;
  onUseMap: () => void;
}

export function ServerFormMapsSearchDetailStep(props: Props): ReactElement {
  const density = useUiDensity();
  const footerButtonSize = density === "compact" ? "sm" : "md";
  const { detail } = props;
  const mapName = suggestMapTokenFromMetadata(detail);
  const descriptionText = resolveDetailDescription(detail);

  const openCurseForge = async () => {
    const result = await window.api.openCurseForgeMod(detail.curseforgeUrl);
    if (!result.ok) return;
  };

  const updatedLabel =
    detail.dateModified === new Date(0).toISOString()
      ? "Unknown"
      : new Date(detail.dateModified).toLocaleDateString();

  return (
    <div className={classes.modalStep}>
      <div className={classes.detailHeaderComposite}>
        <div className={classes.detailHeaderLeft}>
          <Group align="flex-start" wrap="nowrap" gap="sm">
            <DetailThumbnail src={detail.thumbnailUrl} />
            <Stack gap={2} className={classes.detailIdentityText}>
              <Text fw={600} size="sm" lh={1.35} lineClamp={2}>
                {detail.name}
              </Text>
              <Text size="sm" c="dimmed" lineClamp={1}>
                {(detail.authors ?? []).join(", ") || "Unknown author"}
              </Text>
            </Stack>
          </Group>

          {props.loading ? (
            <DetailHeaderSkeleton />
          ) : (
            <Stack gap="xs">
              {props.error !== null ? (
                <Alert color="yellow" variant="light">
                  Could not refresh from CurseForge. Showing cached summary.
                </Alert>
              ) : null}
              <Stack gap="xs" className={classes.detailMetaRow}>
                <MapNameHint suggestion={mapName} variant="inline" />
                <CopyMetadataRow
                  label="Project ID"
                  value={detail.id}
                  failureMessage="Could not copy Project ID"
                />
              </Stack>
              <Text size="xs" c="dimmed">
                {detail.downloadCount.toLocaleString()} downloads · Updated {updatedLabel}
              </Text>
            </Stack>
          )}
        </div>

        <div className={classes.detailHeaderDivider} aria-hidden="true" />

        <div className={classes.detailHeaderRight}>
          {props.loading ? (
            <Skeleton height="100%" width="100%" radius={0} aria-hidden />
          ) : (
            <div className={classes.detailDescriptionPanel}>
              <div className={classes.detailDescriptionScroll}>
                <Text size="sm" lh={1.55} className={classes.detailDescriptionText}>
                  {descriptionText}
                </Text>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={classes.modalStepScroll}>
        {props.loading ? (
          <DetailMediaSkeleton />
        ) : (
          <ModDetailScreenshotCarousel
            urls={detail.screenshots ?? []}
            allowExpand={false}
            frame="map"
          />
        )}
      </div>

      <Group justify="flex-end" align="center" gap="xs" className={classes.detailFooter}>
        <Button
          size={footerButtonSize}
          variant="default"
          leftSection={<ArrowSquareOut size={16} />}
          disabled={props.loading}
          onClick={() => void openCurseForge()}
        >
          Open on CurseForge
        </Button>
        <Button
          size={footerButtonSize}
          leftSection={<MapTrifold size={16} />}
          disabled={props.loading}
          onClick={props.onUseMap}
        >
          Use this map
        </Button>
      </Group>
    </div>
  );
}

function resolveDetailDescription(detail: ModMetadata): string {
  if (typeof detail.description === "string" && detail.description.trim().length > 0) {
    return decodeHtmlEntities(detail.description.trim());
  }
  if (detail.summary.trim().length > 0) {
    return decodeHtmlEntities(detail.summary.trim());
  }
  return "No description on CurseForge.";
}

function DetailHeaderSkeleton(): ReactElement {
  return (
    <Stack gap="xs" aria-hidden>
      <Skeleton height={32} radius="sm" />
      <Skeleton height={32} radius="sm" />
      <Skeleton height={12} width="70%" radius="sm" />
    </Stack>
  );
}

function DetailMediaSkeleton(): ReactElement {
  const density = useUiDensity();
  const mapHeight = density === "compact" ? 460 : 560;

  return (
    <Skeleton
      height={mapHeight}
      width="100%"
      radius="md"
      aria-busy="true"
      aria-label="Loading map screenshots"
    />
  );
}

function DetailThumbnail(props: { src: string | null }): ReactElement {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [props.src]);

  const showImage = props.src !== null && !imageFailed;

  return (
    <div className={classes.detailThumb}>
      <PuzzlePiece size={22} aria-hidden="true" />
      {showImage && (
        <Image
          src={props.src!}
          alt=""
          loading="eager"
          className={classes.detailThumbImage}
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  );
}
