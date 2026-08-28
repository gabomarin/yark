import { useEffect, useState, type ReactElement } from "react";
import { Alert, Button, Group, Image, Stack, Text, TextInput } from "@mantine/core";
import { PuzzlePiece } from "@phosphor-icons/react";
import { MAP_NAME_COPY } from "@shared/map-name-copy";
import type { ModMetadata } from "@shared/types";
import { mapSaveFolderDescriptionStyles } from "@ui/mapFieldStyles";
import type { MapsSearchRow } from "./mapsSearchModel";
import classes from "./ServerFormMapsSearchModal.module.css";

interface Props {
  picked: MapsSearchRow;
  confirmToken: string;
  saveFolder: string;
  ready: boolean;
  onConfirmTokenChange: (value: string) => void;
  onSaveFolderChange: (value: string) => void;
  onApply: () => void;
}

export function ServerFormMapsSearchConfirmStep(props: Props): ReactElement {
  const { picked } = props;

  return (
    <div className={classes.confirmStep}>
      <MapsSearchConfirmIdentity mod={picked.mod} />
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Writes Map Name, links mapModId {picked.mod.id}, and enables that Project ID on Mods.
        </Text>
        {picked.token === null ? (
          <Alert color="yellow" variant="light" title={MAP_NAME_COPY.notInferredTitle}>
            {MAP_NAME_COPY.notInferredBody} Use this map stays disabled until then.
          </Alert>
        ) : picked.token.source === "bare" ? (
          <Alert color="yellow" variant="light" title={MAP_NAME_COPY.confirmTitle}>
            {MAP_NAME_COPY.confirmBareWp}
          </Alert>
        ) : null}
        <TextInput
          label={MAP_NAME_COPY.label}
          required
          value={props.confirmToken}
          onChange={(event) => props.onConfirmTokenChange(event.currentTarget.value)}
          placeholder="e.g. Svartalfheim_WP"
          description={
            picked.token === null
              ? MAP_NAME_COPY.requiredFromCurseForge
              : MAP_NAME_COPY.usuallyEndsWp
          }
        />
        <TextInput
          label="World save folder"
          value={props.saveFolder}
          onChange={(event) => props.onSaveFolderChange(event.currentTarget.value)}
          placeholder="e.g. Svartalfheim"
          description={MAP_NAME_COPY.saveFolderDiffers}
          styles={mapSaveFolderDescriptionStyles}
        />
      </Stack>
      <Group justify="flex-end" className={classes.footer}>
        <Button disabled={!props.ready} onClick={props.onApply}>
          Use this map
        </Button>
      </Group>
    </div>
  );
}

function MapsSearchConfirmIdentity(props: { mod: ModMetadata }): ReactElement {
  const thumb = props.mod.thumbnailUrl?.trim() ?? "";
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [thumb]);

  const showImage = thumb.length > 0 && !imageFailed;

  return (
    <div className={classes.confirmIdentity}>
      <div className={classes.confirmThumb}>
        <PuzzlePiece size={20} aria-hidden="true" />
        {showImage ? (
          <Image
            src={thumb}
            alt=""
            loading="eager"
            className={classes.confirmThumbImage}
            onError={() => setImageFailed(true)}
          />
        ) : null}
      </div>
      <Stack gap={2} className={classes.confirmIdentityText}>
        <Text fw={600} size="sm" lh={1.35} lineClamp={2}>
          {props.mod.name}
        </Text>
        <Text size="sm" c="dimmed" lineClamp={1}>
          {(props.mod.authors ?? []).join(", ") || "Unknown author"}
        </Text>
      </Stack>
    </div>
  );
}
