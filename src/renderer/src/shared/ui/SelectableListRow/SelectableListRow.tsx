import type { ButtonHTMLAttributes, ReactNode } from "react";
import classes from "./SelectableListRow.module.css";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

interface Props extends ButtonProps {
  selected?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}

/** Shared selectable list/row chrome (Clusters, Logs, workspace server switcher). */
export function SelectableListRow({
  selected = false,
  leading,
  trailing,
  children,
  className,
  type = "button",
  ...buttonProps
}: Props): JSX.Element {
  return (
    <button
      {...buttonProps}
      type={type}
      className={[classes.row, className].filter(Boolean).join(" ")}
      data-selected={selected || undefined}
      aria-pressed={selected}
    >
      {leading !== undefined && <span className={classes.leading}>{leading}</span>}
      <span className={classes.body}>{children}</span>
      {trailing !== undefined && <span className={classes.trailing}>{trailing}</span>}
    </button>
  );
}
