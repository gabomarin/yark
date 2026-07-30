import type { ButtonHTMLAttributes, ReactNode, ReactElement } from "react";
import classes from "./SelectableListRow.module.css";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

interface Props extends ButtonProps {
  selected?: boolean;
  /**
   * `surface` — always-visible control chrome (default; Clusters rows).
   * `ghost` — transparent until hover (dense nested lists).
   */
  variant?: "surface" | "ghost";
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}

/** Shared selectable list/row chrome (Clusters, Logs, workspace server switcher). */
export function SelectableListRow({
  selected = false,
  variant = "surface",
  leading,
  trailing,
  children,
  className,
  type = "button",
  ...buttonProps
}: Props): ReactElement {
  return (
    <button
      {...buttonProps}
      type={type}
      className={[classes.row, className].filter(Boolean).join(" ")}
      data-variant={variant}
      data-selected={selected || undefined}
      aria-pressed={selected}
    >
      {leading !== undefined && <span className={classes.leading}>{leading}</span>}
      <span className={classes.body}>{children}</span>
      {trailing !== undefined && <span className={classes.trailing}>{trailing}</span>}
    </button>
  );
}
