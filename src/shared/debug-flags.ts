/**
 * Dev-only flags injected by the build (`electron.vite.config.ts`).
 *
 * `YARK_DEBUG_THEME=1` in the gitignored `.env` turns the theme/palette preview
 * controls on in the sidebar. They exist so the palette can be decided against the
 * real app; operators never see them.
 */

declare const __YARK_DEBUG_THEME__: boolean;

/** True only when the build was made with `YARK_DEBUG_THEME=1`. */
export const DEBUG_THEME_CONTROLS: boolean =
  typeof __YARK_DEBUG_THEME__ === "boolean" && __YARK_DEBUG_THEME__;
