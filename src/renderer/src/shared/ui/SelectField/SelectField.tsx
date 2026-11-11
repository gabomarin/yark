import type { ReactElement } from "react";
import { Select, type SelectProps } from "@mantine/core";
import classes from "./SelectField.module.css";

function mergeSectionClass(section: string | undefined): string {
  return [classes.section, section].filter(Boolean).join(" ");
}

/**
 * Mantine Select with the SearchField leading-icon slot.
 * Toolbar filters share this so the glyph stays centered in the field.
 */
export function SelectField(props: SelectProps): ReactElement {
  const { classNames, ...selectProps } = props;
  if (typeof classNames === "function") {
    return (
      <Select
        {...selectProps}
        classNames={(theme, selectFieldProps, ctx) => {
          const resolved = classNames(theme, selectFieldProps, ctx);
          return {
            ...resolved,
            section: mergeSectionClass(resolved?.section),
          };
        }}
      />
    );
  }
  return (
    <Select
      {...selectProps}
      classNames={{
        ...classNames,
        section: mergeSectionClass(classNames?.section),
      }}
    />
  );
}
