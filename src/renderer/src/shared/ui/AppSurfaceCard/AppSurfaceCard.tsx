import { Card, type CardProps } from "@mantine/core";
import type { ReactNode, ReactElement } from "react";
import classes from "./AppSurfaceCard.module.css";

export type AppSurfaceTone = "cool" | "coolEmphasis" | "flat" | "chrome";

type InheritedCardProps = Omit<CardProps, "children" | "classNames" | "className" | "withBorder">;

interface Props extends InheritedCardProps {
  children: ReactNode;
  /** Visual recipe. Default `cool` for page panels. */
  tone?: AppSurfaceTone;
  /** Stretch to fill a grid/flex parent (Clusters/Logs split panes). */
  fill?: boolean;
  /** Status accent rail (detail panels). */
  statusTone?: "ok" | "error" | "busy" | "attention" | "ready" | null;
  className?: string;
}

/**
 * Homogeneous page/panel container on top of Mantine Card.
 * Prefer this over local `.panel` gradients so new screens stay aligned.
 */
export function AppSurfaceCard({
  children,
  tone = "cool",
  fill = false,
  statusTone = null,
  className,
  padding = "md",
  radius = "lg",
  ...cardProps
}: Props): ReactElement {
  return (
    <Card
      {...cardProps}
      withBorder
      padding={padding}
      radius={radius}
      className={[classes.root, className].filter(Boolean).join(" ")}
      data-tone={tone}
      data-fill={fill || undefined}
      data-status={statusTone ?? undefined}
    >
      {children}
    </Card>
  );
}
