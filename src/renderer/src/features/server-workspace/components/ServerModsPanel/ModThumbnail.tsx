import { Image } from "@mantine/core";
import { PuzzlePiece } from "@phosphor-icons/react";
import classes from "./ServerModsPanel.module.css";

export function ModThumbnail(props: { src: string | null }): JSX.Element {
  return (
    <div className={classes.thumbnail}>
      <PuzzlePiece size={18} aria-hidden="true" />
      {props.src !== null && <Image src={props.src} alt="" loading="eager" />}
    </div>
  );
}
