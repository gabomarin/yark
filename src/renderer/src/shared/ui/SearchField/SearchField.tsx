import type { CSSProperties, KeyboardEvent, ReactElement } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { ActionIcon, TextInput, type TextInputProps } from "@mantine/core";
import classes from "./SearchField.module.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name when there is no visible `fieldLabel`. */
  label?: string;
  /** Visible Mantine caption. Empty/whitespace is treated as unset. */
  fieldLabel?: string;
  /**
   * Mantine input size. `xs` is the app default (theme); pass `sm` only when
   * pairing with other Comfortable-density controls. Do not use `md`.
   */
  size?: TextInputProps["size"];
  className?: string;
  style?: CSSProperties;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /**
   * Submit variant (#297 Discover): clickable magnifier in `rightSection`.
   * Enter still calls the same handler. Omit for instant Filter fields.
   */
  onSubmit?: () => void;
  /** Disables the submit ActionIcon and shows a spinner while a remote search runs. */
  submitting?: boolean;
  /** Accessible name for the in-field submit control (default: "Search"). */
  submitLabel?: string;
}

/** Phosphor size for the leading search icon (`xs` rail vs default fields). */
export function searchFieldIconSize(size?: TextInputProps["size"]): number {
  return size === "xs" ? 14 : 16;
}

/**
 * Shared search chrome (radius, border, panel background, muted icon).
 * Filter: decorative left magnifier. Submit: flush filled ActionIcon in
 * `rightSection` (`onSubmit`) — do not pair with a separate trailing Button.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  fieldLabel,
  size,
  className,
  style,
  onKeyDown,
  onSubmit,
  submitting = false,
  submitLabel = "Search",
}: Props): ReactElement {
  const visibleLabel =
    fieldLabel !== undefined && fieldLabel.trim().length > 0
      ? fieldLabel
      : undefined;
  const iconSize = searchFieldIconSize(size);
  const isSubmit = onSubmit !== undefined;

  return (
    <TextInput
      aria-label={visibleLabel === undefined ? (label ?? "Search") : undefined}
      label={visibleLabel}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (isSubmit && event.key === "Enter") {
          event.preventDefault();
          onSubmit();
        }
      }}
      placeholder={placeholder}
      size={size}
      className={className}
      style={style}
      leftSection={
        isSubmit ? undefined : <MagnifyingGlass size={iconSize} />
      }
      rightSection={
        isSubmit ? (
          <ActionIcon
            variant="transparent"
            className={classes.submit}
            aria-label={submitLabel}
            loading={submitting}
            onClick={onSubmit}
          >
            <MagnifyingGlass size={iconSize} weight="bold" />
          </ActionIcon>
        ) : undefined
      }
      rightSectionWidth={isSubmit ? "var(--input-height)" : undefined}
      rightSectionPointerEvents={isSubmit ? "all" : undefined}
      classNames={{
        input: isSubmit ? `${classes.input} ${classes.inputSubmit}` : classes.input,
        section: isSubmit ? classes.submitSection : classes.section,
      }}
    />
  );
}
