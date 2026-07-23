import { Stack } from "@mantine/core";
import type { PropsWithChildren, ReactNode } from "react";
import classes from "./PageScaffold.module.css";

interface Props extends PropsWithChildren {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageScaffold({ title, subtitle, actions, children }: Props): JSX.Element {
  return (
    <Stack gap="lg" className={classes.page}>
      <header className={classes.header}>
        <div className={classes.heading}>
          <h1>{title}</h1>
          {subtitle !== undefined && <p>{subtitle}</p>}
        </div>
        {actions !== undefined && <div className={classes.actions}>{actions}</div>}
      </header>
      <div className={classes.body}>{children}</div>
    </Stack>
  );
}