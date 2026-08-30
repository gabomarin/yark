import type { CSSProperties, KeyboardEvent, ReactElement } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { ActionIcon, CloseButton, TextInput, type TextInputProps } from "@mantine/core";
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
   * Filter fields show an in-field clear when non-empty; submit keeps the
   * magnifier only (no clear — TextInput has no built-in `clearable`).
   */
  onSubmit?: () => void;
  /** Disables the submit ActionIcon and shows a spinner while a remote search runs. */
  submitting?: boolean;
  /** Accessible name for the in-field submit control (default: "Search"). */
  submitLabel?: string;
  /**
   * Filter variant only: show Mantine `CloseButton` in `rightSection` when
   * there is text (default true). Ignored when `onSubmit` is set.
   */
  clearable?: boolean;
  /** Accessible name for the clear control (default: "Clear search"). */
  clearLabel?: string;
}

/** Phosphor size for the leading search icon (`xs` rail vs default fields). */
export function searchFieldIconSize(size?: TextInputProps["size"]): number {
  return size === "xs" ? 14 : 16;
}

/**
 * Shared search chrome (radius, border, panel background, muted icon).
 * Filter: decorative left magnifier; optional in-field clear when non-empty.
 * Submit: flush filled ActionIcon in `rightSection` (`onSubmit`) — do not
 * pair with a separate trailing Button.
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
  clearable = true,
  clearLabel = "Clear search",
}: Props): ReactElement {
  const visibleLabel =
    fieldLabel !== undefined && fieldLabel.trim().length > 0
      ? fieldLabel
      : undefined;
  const iconSize = searchFieldIconSize(size);
  const isSubmit = onSubmit !== undefined;
  const showClear =
    !isSubmit && clearable && value.trim().length > 0;

  const inputClass = [
    classes.input,
    isSubmit ? classes.inputSubmit : null,
    showClear ? classes.inputClearable : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <TextInput
      aria-label={visibleLabel === undefined ? (label ?? "Search") : undefined}
      label={visibleLabel}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Escape" && !isSubmit && value.length > 0) {
          event.preventDefault();
          onChange("");
          return;
        }
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
        ) : showClear ? (
          <CloseButton
            className={classes.clear}
            variant="transparent"
            aria-label={clearLabel}
            size={size === "xs" ? "sm" : "md"}
            onClick={() => onChange("")}
          />
        ) : undefined
      }
      rightSectionWidth={
        isSubmit || showClear ? "var(--input-height)" : undefined
      }
      rightSectionPointerEvents={isSubmit || showClear ? "all" : undefined}
      classNames={{
        input: inputClass,
        section: isSubmit ? classes.submitSection : classes.section,
      }}
    />
  );
}
