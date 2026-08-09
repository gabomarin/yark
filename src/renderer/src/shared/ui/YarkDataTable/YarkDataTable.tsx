import type { ReactElement } from "react";
import { DataTable, type DataTableProps } from "mantine-datatable";
import { useUiDensity } from "@app/AppProviders";
import classes from "./YarkDataTable.module.css";

export type YarkDataTableProps<T> = DataTableProps<T> & {
  /** Extra class on the outer table wrapper. */
  className?: string;
};

/**
 * YARK density-aware thin wrapper around `mantine-datatable`.
 * Prefer this over raw `DataTable` so compact/comfortable spacing stays consistent.
 */
export function YarkDataTable<T>(props: YarkDataTableProps<T>): ReactElement {
  const density = useUiDensity();
  const compact = density === "compact";
  const {
    className,
    verticalSpacing = compact ? "xs" : "sm",
    horizontalSpacing = compact ? "xs" : "sm",
    fz = compact ? "xs" : "sm",
    minHeight = 160,
    withTableBorder = true,
    borderRadius = "md",
    highlightOnHover = true,
    ...rest
  } = props;

  return (
    <div
      className={[classes.root, className].filter(Boolean).join(" ")}
      data-ui-density={density}
    >
      <DataTable
        {...rest}
        verticalSpacing={verticalSpacing}
        horizontalSpacing={horizontalSpacing}
        fz={fz}
        minHeight={minHeight}
        withTableBorder={withTableBorder}
        borderRadius={borderRadius}
        highlightOnHover={highlightOnHover}
      />
    </div>
  );
}
