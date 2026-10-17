/**
 * Shared overlay / chrome material styles (#PUX-005-A).
 *
 * Recipes consume `--app-material-*` so fallbacks (no backdrop-filter,
 * reduced-transparency, forced-colors) can remap the same variables without
 * duplicating filter CSS on Menu, Popover, Modal, Drawer and dropdowns.
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
