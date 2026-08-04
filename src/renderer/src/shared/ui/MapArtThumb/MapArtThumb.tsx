import type { ReactElement } from "react";
import { HardDrives } from "@phosphor-icons/react";
import { resolveMapArtUrl } from "./mapArt";
import classes from "./MapArtThumb.module.css";

interface Props {
  mapId: string;
  /** Friendly label for alt text when art is present. */
  label?: string;
  size?: "sm" | "md" | "lg";
  shape?: "tek" | "rounded";
  className?: string;
}

export function MapArtThumb(props: Props): ReactElement {
  const size = props.size ?? "md";
  const shape = props.shape ?? "tek";
  const src = resolveMapArtUrl(props.mapId);
  const className = [classes.thumb, props.className].filter(Boolean).join(" ");

  if (src === null) {
    return (
      <div
        className={className}
        data-size={size}
        data-shape={shape}
        aria-hidden="true"
      >
        <HardDrives
          className={classes.fallbackIcon}
          size={size === "lg" ? 22 : 18}
          weight="duotone"
        />
      </div>
    );
  }

  const alt =
    props.label !== undefined && props.label.trim().length > 0
      ? props.label.trim()
      : props.mapId;

  return (
    <div className={className} data-size={size} data-shape={shape}>
      <img className={classes.image} src={src} alt={alt} draggable={false} />
    </div>
  );
}
