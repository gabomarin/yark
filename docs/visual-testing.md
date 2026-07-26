# Visual testing protocol

This guide is mandatory when a change modifies layout, styles, navigation,
visible components, or responsive behavior of the renderer.

## Required window sizes

Review must run, at minimum, at these three renderer viewports:

| Profile | Viewport (CSS pixels) | Goal |
| --- | ---: | --- |
| HD / compact | `1280 × 720` | Catch clipping, actions out of view, missing scrolls, and overly dense layouts. |
| Full HD | `1920 × 1080` | Validate the primary desktop experience. |
| QHD / 2K | `2560 × 1440` | Catch excessive widths, content that does not grow, and unintentional empty space. |

In this project, **2K means QHD `2560 × 1440`**. Measurements correspond to the
Electron content viewport, not the monitor’s physical resolution. Playwright
must set them explicitly with `page.setViewportSize`.

If the change affects a specific breakpoint, add a resolution near that
breakpoint; it does not replace any of the three required sizes.

## Requirements

- Native Windows or an environment capable of opening Windows GUI applications.
- Node.js 20 or newer and npm.
- Dependencies installed via `npm install`.
- Electron and Playwright available from the project dependencies.
- An up-to-date build generated with `npm run build`.
- Permission to temporarily open the Electron window and save screenshots.
- Enough local data to represent the reviewed flow. For the workspace, at least
  one server and content that produces scroll are required; for INI files there
  must be enough settings to validate the long table.

Some environments have `ELECTRON_RUN_AS_NODE=1`. Electron will not open its
window correctly while that variable is active. Remove it only for the test
process:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

```bash
unset ELECTRON_RUN_AS_NODE
```

In an isolated Node script this can be done before launching Electron:

```js
delete process.env.ELECTRON_RUN_AS_NODE;
```

On Cursor Cloud / Linux agents, also use a real desktop display (not a headless
process). See [AGENTS.md](../AGENTS.md) for benign dbus/GPU warnings and other
VM pitfalls.

## Playwright procedure

1. Run `npm run build`.
2. Launch the compiled project with `_electron.launch`.
3. Wait for `domcontentloaded` and a stable element on the screen.
4. Record `console` and `pageerror` errors.
5. Walk `1280×720`, `1920×1080`, and `2560×1440` via `page.setViewportSize`.
6. Capture the initial screen and relevant states after interacting.
7. Test scroll with the mouse wheel, not only by setting `scrollTop` via
   JavaScript.
8. Close Electron even if the test fails.

Minimal template:

```js
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

async function run() {
  const sizes = [
    { name: "hd", width: 1280, height: 720 },
    { name: "full-hd", width: 1920, height: 1080 },
    { name: "qhd-2k", width: 2560, height: 1440 },
  ];

  const app = await electron.launch({ args: ["."], cwd: process.cwd() });

  try {
    const page = await app.firstWindow();
    const errors = [];

    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.waitForLoadState("domcontentloaded");

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.screenshot({
        path: path.join(os.tmpdir(), `visual-${size.name}.png`),
        fullPage: false,
      });
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

The template is a starting point. Each review must navigate and interact with
the modified screen, not only capture the initial screen.

## What to review

At each resolution:

- The primary action is visible and does not compete with secondary actions.
- There is no clipped content or inaccessible controls.
- All long content has an obvious, working scroll.
- No unexpected horizontal overflow appears.
- Surfaces that should grow use the available height and width.
- Sticky headers, toolbars, and actions do not cover content.
- Text is not truncated unless there is an alternative way to read it.
- Hover, focus, disabled, loading, error, and empty states remain readable when
  they are part of the change.
- There are no console errors or renderer exceptions.

The review must include the full screen — shell, sidebar, and adjacent panels —
in addition to the modified component. If the change affects the server
workspace, review at least the Server, `Game.ini`, `GameUserSettings.ini`, Mods,
and Advanced tabs.

## Evidence and closure

Before closing the change, record:

- Resolutions reviewed.
- Screens and states walked.
- Console and `pageerror` results.
- Problems found and fixes applied.
- Any limitation that prevented completing a resolution.

Temporary screenshots do not need to be versioned. If a visual decision must be
kept as a product reference, its documentation should be added to `docs/` or the
corresponding plan.

## Packaged helper scripts

These are convenience launchers under `scripts/`. They are **not** substitutes
for the mandatory three-viewport protocol above unless noted.

| Script | How to run | Notes |
| --- | --- | --- |
| `visual-backups.cjs` | `npm run build && node scripts/visual-backups.cjs` | HD / Full HD / QHD matrix for workspace Backups; clears `ELECTRON_RUN_AS_NODE`; needs ≥1 server (may create a temp profile) |
| `visual-logs.cjs` | Prefer `node scripts/seed-server-logs.cjs` first, then `npm run build && node scripts/visual-logs.cjs` | Single **1440×900** evidence pass (supplement only); clears `ELECTRON_RUN_AS_NODE` |
| `visual-overview.cjs` | `npm run build && node scripts/visual-overview.cjs` | Overview layout evidence |
| `seed-server-logs.cjs` | `node scripts/seed-server-logs.cjs [serverName]` | Seeds events + update log files for Logs UI review. Resolves Electron userData cross-platform (`APPDATA` / macOS Application Support / `~/.config`); override with `YARK_USER_DATA` |
| `e2e:smoke` / `e2e` | `npm run e2e:smoke` / `npm run e2e` | Need display + `ELECTRON_RUN_AS_NODE` unset in the shell (these two scripts do **not** clear it). Smoke may still fail on stale `section.servers h2`; the suite uses `[data-server-card]`. Server create needs a Windows-style install path, admin password ≥4 chars, unique ports |

Related domain context: [backups.md](backups.md), [updates-steamcmd.md](updates-steamcmd.md), [logs.md](logs.md), [AGENTS.md](../AGENTS.md).
