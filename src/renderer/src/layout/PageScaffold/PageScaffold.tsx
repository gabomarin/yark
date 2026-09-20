import { Stack } from "@mantine/core";
import type { PropsWithChildren, ReactNode, ReactElement } from "react";
import classes from "./PageScaffold.module.css";

interface Props extends PropsWithChildren {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  fillViewport?: boolean;
  /**
   * Flush to the AppShell main edge (no page gutter). Use for NavigationView-style
   * pages like Settings where the category pane should meet the app sidebar.
   */
  edgeToEdge?: boolean;
  /** When false, keep `title` for a11y (`aria-label`) but hide the page header. */
  showHeader?: boolean;
}

export function PageScaffold({
  title,
  subtitle,
  actions,
  fillViewport = false,
  edgeToEdge = false,
  showHeader = true,
  children,
}: Props): ReactElement {
  return (
    <Stack
      gap={edgeToEdge ? 0 : "lg"}
      className={classes.page}
      data-fill-viewport={fillViewport || undefined}
      data-edge-to-edge={edgeToEdge || undefined}
      aria-label={showHeader ? undefined : title}
      /* `aria-label` needs a role to be announced; without the header this root is the
       * page's landmark instead. */
      role={showHeader ? undefined : "region"}
    >
      {showHeader ? (
        <header className={classes.header}>
          <div className={classes.heading}>
            <h1>{title}</h1>
            {subtitle !== undefined && <p>{subtitle}</p>}
          </div>
          {actions !== undefined && <div className={classes.actions}>{actions}</div>}
        </header>
      ) : null}
      <div className={classes.body}>{children}</div>
    </Stack>
  );
}
