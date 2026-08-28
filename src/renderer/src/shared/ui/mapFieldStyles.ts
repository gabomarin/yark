/** Mantine TextInput/Select helper under labels (fossil warn tone for save folder). */
export const mapSaveFolderDescriptionStyles = {
  description: {
    color: "var(--app-color-fossil)",
  },
} as const;

/** Standalone helper lines (Map Name hints) — matches form description size. */
export const mapFieldHelperTextProps = {
  style: {
    fontSize: "var(--app-form-description-size)",
    lineHeight: 1.5,
  },
} as const;
