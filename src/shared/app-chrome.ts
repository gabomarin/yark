/**
 * The colour the app paints before the renderer's first frame.
 *
 * The main process needs it in three places (the BrowserWindow, the splash window and the
 * inline fallback splash HTML) and the renderer needs it as `darkPalette.background`, so
 * it lives here to keep them from drifting: a mismatch is exactly the colour flash on
 * startup this constant exists to prevent.
 */
export const BOOTSTRAP_BACKGROUND = "#010306";
