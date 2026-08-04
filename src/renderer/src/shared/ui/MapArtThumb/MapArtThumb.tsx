import type { ReactElement } from "react";
import { HardDrives } from "@phosphor-icons/react";
import { resolveMapArtUrl } from "./mapArt";
import classes from "./MapArtThumb.module.css";

interface Props {
  mapId: string;
  /**
   * Accessible name when `decorative` is false.
   * Defaults to `mapId` when omitted.
   */
  label?: string;
  /**
   * When true (default), hide from assistive tech — map text is already nearby
   * in ServerCard / WorkspaceHeader.
   */
  decorative?: boolean;
  size?: "sm" | "md" | "lg";
  shape?: "tek" | "rounded";
  className?: string;
}

export function MapArtThumb(props: Props): ReactElement {
  const size = props.size ?? "md";
  const shape = props.shape ?? "tek";
  const decorative = props.decorative !== false;
  const src = resolveMapArtUrl(props.mapId);
  const className = [classes.thumb, props.className].filter(Boolean).join(" ");
  const accessibleName =
    props.label !== undefined && props.label.trim().length > 0
      ? props.label.trim()
      : props.mapId;

  if (src === null) {
    return (
      <div
        className={className}
        data-size={size}
        data-shape={shape}
        aria-hidden={decorative ? true : undefined}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : accessibleName}
      >
        <HardDrives
          className={classes.fallbackIcon}
          size={size === "lg" ? 22 : 18}
          weight="duotone"
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      data-size={size}
      data-shape={shape}
      aria-hidden={decorative ? true : undefined}
    >
      <img
        className={classes.image}
        src={src}
        alt={decorative ? "" : accessibleName}
        draggable={false}
      />
    </div>
  );
}
