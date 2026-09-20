/**
 * Dev-only flags injected by the build (`electron.vite.config.ts`).
 *
 * `YARK_DEBUG_THEME=1` in the gitignored `.env` is the gate for the theme/palette preview
 * tooling, which exists so the palette can be decided against the real app; operators never
 * see it. The panel is currently **detached** from the sidebar (the palette is decided), so
 * this flag alone renders nothing - see the re-attach note in
 * `src/renderer/src/layout/Sidebar/Sidebar.tsx`.
 */

declare const __YARK_DEBUG_THEME__: boolean;

/** True only when the build was made with `YARK_DEBUG_THEME=1`. */
export const DEBUG_THEME_CONTROLS: boolean =
  typeof __YARK_DEBUG_THEME__ === "boolean" && __YARK_DEBUG_THEME__;
