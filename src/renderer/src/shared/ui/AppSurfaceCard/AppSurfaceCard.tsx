import { Card, type CardProps } from "@mantine/core";
import type { ReactNode, ReactElement } from "react";
import classes from "./AppSurfaceCard.module.css";

type AppSurfaceTone = "cool" | "coolEmphasis" | "flat" | "chrome";

type InheritedCardProps = Omit<CardProps, "children" | "classNames" | "className" | "withBorder">;

interface Props extends InheritedCardProps {
  children: ReactNode;
  /** Visual recipe. Default `flat` for content panels (#346). */
  tone?: AppSurfaceTone;
  /** Stretch to fill a grid/flex parent (Clusters/Logs split panes). */
  fill?: boolean;
  /** Status accent rail (detail panels). */
  statusTone?: "ok" | "error" | "busy" | "attention" | "ready" | null;
  className?: string;
}

/**
 * Card for a discrete entity or chrome rail — not the whole page pane (#469).
 * Default `tone="flat"` + `radius="md"`. Use `cool` / `coolEmphasis` only for
 * rare accent cards; `chrome` for shell rails (Settings nav).
 */
export function AppSurfaceCard({
  children,
  tone = "flat",
  fill = false,
  statusTone = null,
  className,
  padding = "md",
  radius = "md",
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
