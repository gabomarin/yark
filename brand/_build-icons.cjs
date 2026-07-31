/**
 * Rebuild Windows/web icons from brand/yark-icon.png and sync yark-logo.png copies.
 * Usage (from repo root): node brand/_build-icons.cjs
 * Requires: npm i --no-save sharp png-to-ico
 */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico");
const toIco = pngToIco.default || pngToIco;

const ROOT = path.join(__dirname, "..");
const ICON_SRC = path.join(__dirname, "yark-icon.png");
const LOGO_SRC = path.join(__dirname, "yark-logo.png");
/** Sidebar displays ≤168px; keep 2× for sharpness without shipping the full lockup. */
const SIDEBAR_LOGO_WIDTH = 336;

async function main() {
  if (!fs.existsSync(ICON_SRC)) {
    throw new Error(`Missing ${ICON_SRC}`);
  }
  if (!fs.existsSync(LOGO_SRC)) {
    throw new Error(`Missing ${LOGO_SRC}`);
  }

  fs.mkdirSync(path.join(ROOT, "build"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "src", "renderer", "public"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "src", "renderer", "src", "assets", "brand"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "website", "assets"), { recursive: true });

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBufs = [];
  for (const size of icoSizes) {
    icoBufs.push(
      await sharp(ICON_SRC)
        .resize(size, size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        })
        .png()
        .toBuffer(),
    );
  }
  const winIco = await toIco(icoBufs);
  fs.writeFileSync(path.join(ROOT, "build", "icon.ico"), winIco);

  await sharp(ICON_SRC).resize(32, 32).png().toFile(path.join(ROOT, "website", "favicon-32x32.png"));
  await sharp(ICON_SRC)
    .resize(32, 32)
    .png()
    .toFile(path.join(ROOT, "src", "renderer", "public", "favicon.png"));
  await sharp(ICON_SRC)
    .resize(180, 180)
    .png()
    .toFile(path.join(ROOT, "website", "apple-touch-icon.png"));

  const favIco = await toIco([
    await sharp(ICON_SRC).resize(16, 16).png().toBuffer(),
    await sharp(ICON_SRC).resize(32, 32).png().toBuffer(),
    await sharp(ICON_SRC).resize(48, 48).png().toBuffer(),
  ]);
  fs.writeFileSync(path.join(ROOT, "website", "favicon.ico"), favIco);

  await sharp(LOGO_SRC)
    .resize(SIDEBAR_LOGO_WIDTH, null, { fit: "inside", withoutEnlargement: true })
    .png()
    .toFile(path.join(ROOT, "src", "renderer", "src", "assets", "brand", "yark-logo.png"));

  fs.copyFileSync(LOGO_SRC, path.join(ROOT, "website", "assets", "yark-logo.png"));

  console.log("ok: build/icon.ico, web favicons, sidebar logo (336px), website lockup");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
