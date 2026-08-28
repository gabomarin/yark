import { useEffect, useState, type ReactElement } from "react";
import { Carousel } from "@mantine/carousel";
import { Button, Group, Image, Modal, Stack, Text, UnstyledButton } from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
import classes from "./ServerModsPanel.module.css";

interface Props {
  urls: string[];
  /** When nested under a raised drawer/modal, set above that overlay (#342). */
  lightboxZIndex?: number;
  /** Search Maps detail step keeps screenshots in-carousel only (#295). */
  allowExpand?: boolean;
  /** Map pack previews: full-width 3:2 frame, cover fill (#295). */
  frame?: "wide" | "map";
}

/**
 * CurseForge screenshot slider for the mod detail drawer (#342).
 * Hidden entirely when `urls` is empty. Uses Mantine Carousel (no strip scroll).
 */
export function ModDetailScreenshotCarousel(props: Props): ReactElement | null {
  const density = useUiDensity();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxLoadError, setLightboxLoadError] = useState(false);
  const [lightboxRetryKey, setLightboxRetryKey] = useState(0);
  const [failed, setFailed] = useState<Record<string, true>>({});

  useEffect(() => {
    setFailed({});
    setLightboxIndex(null);
    setLightboxLoadError(false);
    setLightboxRetryKey(0);
  }, [props.urls]);

  const visible = props.urls.filter((url) => failed[url] !== true);
  if (visible.length === 0) {
    return null;
  }

  const isMapFrame = props.frame === "map";
  /** Full-width 3:2 frame — between 4:3 and 16:9; cover avoids side letterboxing (#295). */
  const mapHeight = density === "compact" ? 460 : 560;
  const height = isMapFrame ? mapHeight : density === "compact" ? 168 : 220;
  const imageFit: "cover" | "contain" = isMapFrame ? "cover" : "cover";
  const allowExpand = props.allowExpand !== false;
  const lightboxSrc =
    allowExpand && lightboxIndex !== null ? (visible[lightboxIndex] ?? null) : null;

  return (
    <div className={classes.detailDrawerScreenshots}>
      <Group justify="space-between" gap="xs" mb={6}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
          Screenshots
        </Text>
        <Text size="xs" c="dimmed" ff="monospace">
          {visible.length} image{visible.length === 1 ? "" : "s"}
        </Text>
      </Group>
      <Carousel
        height={height}
        withIndicators={visible.length > 1}
        withControls={visible.length > 1}
        controlSize={28}
        emblaOptions={{ loop: true, align: "center" }}
        aria-label="CurseForge screenshots"
        classNames={{
          root: isMapFrame
            ? `${classes.detailDrawerCarousel} ${classes.detailDrawerCarouselMap}`
            : classes.detailDrawerCarousel,
          control: classes.detailDrawerCarouselControl,
          indicator: classes.detailDrawerCarouselIndicator,
          slide: isMapFrame ? classes.detailDrawerCarouselMapSlide : undefined,
        }}
      >
        {visible.map((url, index) => (
          <Carousel.Slide key={url}>
            {allowExpand ? (
              <UnstyledButton
                className={classes.detailDrawerCarouselSlideBtn}
                aria-label={`Screenshot ${index + 1}, enlarge`}
                onClick={() => {
                  setLightboxIndex(index);
                  setLightboxLoadError(false);
                }}
              >
                <ScreenshotImage
                  url={url}
                  height={height}
                  fit={imageFit}
                  fillFrame={isMapFrame}
                  onFailed={() => setFailed((prev) => ({ ...prev, [url]: true }))}
                />
              </UnstyledButton>
            ) : (
              <ScreenshotImage
                url={url}
                height={height}
                fit={imageFit}
                fillFrame={isMapFrame}
                onFailed={() => setFailed((prev) => ({ ...prev, [url]: true }))}
              />
            )}
          </Carousel.Slide>
        ))}
      </Carousel>

      {allowExpand ? (
      <Modal
        opened={lightboxSrc !== null}
        onClose={() => setLightboxIndex(null)}
        title={
          lightboxIndex !== null
            ? `Screenshot ${lightboxIndex + 1} of ${visible.length}`
            : "Screenshot"
        }
        centered
        size="lg"
        radius="md"
        zIndex={props.lightboxZIndex}
      >
        {lightboxSrc !== null && lightboxLoadError ? (
          <Stack align="center" gap="sm" py="md">
            <Text size="sm" c="dimmed" ta="center">
              Could not load this screenshot.
            </Text>
            <Group gap="xs" justify="center">
              <Button
                variant="light"
                size="xs"
                onClick={() => {
                  setLightboxLoadError(false);
                  setLightboxRetryKey((key) => key + 1);
                }}
              >
                Retry
              </Button>
              <Button
                variant="subtle"
                size="xs"
                onClick={() => setLightboxIndex(null)}
              >
                Close
              </Button>
            </Group>
          </Stack>
        ) : lightboxSrc !== null ? (
          <Image
            key={`${lightboxSrc}:${lightboxRetryKey}`}
            src={lightboxSrc}
            alt=""
            fit="contain"
            mah="70vh"
            radius="md"
            onError={() => setLightboxLoadError(true)}
          />
        ) : null}
      </Modal>
      ) : null}
    </div>
  );
}

function ScreenshotImage(props: {
  url: string;
  height: number;
  fit: "cover" | "contain";
  fillFrame?: boolean;
  onFailed: () => void;
}): ReactElement {
  return (
    <Image
      src={props.url}
      alt=""
      w={props.fillFrame === true ? "100%" : undefined}
      h={props.height}
      fit={props.fit}
      radius={props.fillFrame === true ? 0 : "md"}
      className={props.fillFrame === true ? classes.detailDrawerCarouselMapImage : undefined}
      loading="lazy"
      onError={props.onFailed}
    />
  );
}
