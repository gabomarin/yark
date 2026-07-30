import type { ReactNode, ReactElement } from "react";
import classes from "./AccentIconTile.module.css";

interface Props {
  children: ReactNode;
  /** `tek` = asymmetric radius used on ServerCard / SteamCMD; `rounded` = control tile. */
  shape?: "tek" | "rounded";
  tone?: "accent" | "control";
  size?: "sm" | "md";
  className?: string;
}

export function AccentIconTile({
  children,
  shape = "tek",
  tone = "accent",
  size = "md",
  className,
}: Props): ReactElement {
  return (
    <div
      className={[classes.tile, className].filter(Boolean).join(" ")}
      data-shape={shape}
      data-tone={tone}
      data-size={size}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}
