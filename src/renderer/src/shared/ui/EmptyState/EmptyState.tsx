import { Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./EmptyState.module.css";

interface Props {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Use `h3` for page-level empty states; default `text` for inline. */
  titleOrder?: "h3" | "text";
  /**
   * `inline` — horizontal strip (Overview).
   * `stacked` — centered column (Clusters / Logs page empties).
   */
  layout?: "inline" | "stacked";
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  titleOrder = "text",
  layout = "inline",
  className,
  children,
}: Props): JSX.Element {
  return (
    <div
      className={[classes.root, className].filter(Boolean).join(" ")}
      data-layout={layout}
      data-emphasis={titleOrder === "h3" ? "page" : "inline"}
    >
      <div className={classes.icon} aria-hidden="true">
        {icon}
      </div>
      <Stack gap="xxs" className={classes.copy}>
        {titleOrder === "h3" ? (
          <Title order={3} className={`${classes.title} ${classes.titlePage}`}>
            {title}
          </Title>
        ) : (
          <Text fw={600} className={classes.title}>
            {title}
          </Text>
        )}
        {description !== undefined && description !== null && description !== "" && (
          typeof description === "string" ? (
            <Text c="dimmed" size="sm">
              {description}
            </Text>
          ) : (
            description
          )
        )}
        {children}
      </Stack>
      {action !== undefined && <div className={classes.action}>{action}</div>}
    </div>
  );
}
