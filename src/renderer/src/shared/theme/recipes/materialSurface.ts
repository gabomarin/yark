/**
 * Shared overlay / chrome / content material styles (#PUX-005-A).
 *
 * Recipes consume `--app-material-*` so fallbacks (no backdrop-filter,
 * reduced-transparency, forced-colors) can remap the same variables without
 * duplicating filter CSS on Menu, Popover, Modal, Drawer, Card and dropdowns.
 */

export const overlayMaterialStyles = {
  backgroundColor: "var(--app-material-overlay-bg)",
  backdropFilter: "var(--app-material-overlay-filter)",
  WebkitBackdropFilter: "var(--app-material-overlay-filter)",
  border: "1px solid var(--app-color-border-subtle)",
  boxShadow: "var(--app-elevation-16)",
} as const;

export const overlayDialogMaterialStyles = {
  ...overlayMaterialStyles,
  boxShadow: "var(--app-elevation-28)",
} as const;

export const contentMaterialStyles = {
  backgroundColor: "var(--app-material-content-bg)",
  backdropFilter: "var(--app-material-content-filter)",
  WebkitBackdropFilter: "var(--app-material-content-filter)",
  borderColor: "var(--app-color-border-subtle)",
  boxShadow: "var(--app-elevation-4), inset 0 1px 0 var(--app-material-inner-highlight)",
} as const;

export const controlMaterialStyles = {
  backgroundColor: "var(--app-material-content-bg)",
  backdropFilter: "var(--app-material-content-filter)",
  WebkitBackdropFilter: "var(--app-material-content-filter)",
  borderColor: "var(--app-color-border-subtle)",
  boxShadow: "inset 0 1px 0 var(--app-material-inner-highlight)",
} as const;
