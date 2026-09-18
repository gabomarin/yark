import type { ReactElement, ReactNode } from "react";
import { Group } from "@mantine/core";
import classes from "./AppSectionTitle.module.css";

interface Props {
  /**
   * Ramp level (#PUX-004). `lg` page-level section, `md` panel/card section,
   * `sm` dense sub-header. Never pass a raw font-size.
   */
  level?: "lg" | "md" | "sm";
  /** Renders as an `h2`-`h4` by default so the document outline stays sane. */
  order?: 2 | 3 | 4;
  /** Right-aligned actions for the section header. */
  actions?: ReactNode;
  children: ReactNode;
}

const DEFAULT_ORDER = { lg: 2, md: 3, sm: 4 } as const;

/**
 * Section header inside a pane or card. Use this (or a Mantine `Title`, which
 * renders from the same ramp) instead of a feature-local `.panelTitle` /
 * `.groupTitle` class with its own font-size.
 */
export function AppSectionTitle(props: Props): ReactElement {
  const level = props.level ?? "md";
  const Heading = `h${props.order ?? DEFAULT_ORDER[level]}` as const;
  const title = <Heading className={classes.root} data-level={level}>{props.children}</Heading>;

  if (props.actions === undefined) return title;

  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="sm">
      {title}
      <Group gap="sm">{props.actions}</Group>
    </Group>
  );
}
