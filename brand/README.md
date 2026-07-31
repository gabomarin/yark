# Brand assets

## Canonical (edit here)

| File | Use |
| --- | --- |
| `yark-logo.png` | Full lockup — website hero; sidebar gets a resized copy |
| `yark-icon.png` | Mark only — source for Windows/web icons |
| `yark-logo.svg` | Optional local design source (gitignored; not committed / not runtime) |

## Derived / wired

| Destination | Built from |
| --- | --- |
| `build/icon.ico` | `yark-icon.png` (16…256 multi-size) |
| `website/favicon.ico` | `yark-icon.png` |
| `website/favicon-32x32.png` | `yark-icon.png` |
| `website/apple-touch-icon.png` | `yark-icon.png` |
| `src/renderer/public/favicon.png` | `yark-icon.png` (32×32) |
| `src/renderer/src/assets/brand/yark-logo.png` | `yark-logo.png` resized to 336px wide |
| `website/assets/yark-logo.png` | `yark-logo.png` (full lockup) |

After replacing `yark-icon.png` or `yark-logo.png`:

```bash
npm i --no-save sharp png-to-ico
node brand/_build-icons.cjs
```

## Not kept

Android Chrome / `site.webmanifest` — GitHub Pages is a landing page, not a PWA.
