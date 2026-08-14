import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SHOT_WIDTHS = [640, 960, 1280];
const LOGO_WIDTHS = [320, 640];

async function needsWrite(src, dest) {
  if (!existsSync(dest)) {
    return true;
  }
  const [sourceStat, destStat] = await Promise.all([fs.stat(src), fs.stat(dest)]);
  return sourceStat.mtimeMs > destStat.mtimeMs;
}

async function writeWebp(src, dest, width, quality) {
  if (!(await needsWrite(src, dest))) {
    return;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp.webp`;
  await sharp(src)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toFile(tmp);
  await fs.rename(tmp, dest);
}

export async function generateMarketingImages(rootDir) {
  const shotsDir = path.join(rootDir, "public", "screenshots");
  const mediaDir = path.join(rootDir, "public", "media");
  await fs.mkdir(mediaDir, { recursive: true });

  const files = (await fs.readdir(shotsDir)).filter((name) => name.endsWith(".png"));
  for (const file of files) {
    const src = path.join(shotsDir, file);
    const slug = file.slice(0, -4);
    for (const width of SHOT_WIDTHS) {
      await writeWebp(src, path.join(mediaDir, `${slug}-${width}.webp`), width, 72);
    }
  }

  const logoSrc = path.join(rootDir, "public", "assets", "yark-logo.png");
  for (const width of LOGO_WIDTHS) {
    await writeWebp(logoSrc, path.join(mediaDir, `yark-logo-${width}.webp`), width, 80);
  }
}

/** Build-time WebP derivatives for marketing PNGs (not committed). */
export function optimizeMarketingImages() {
  return {
    name: "optimize-marketing-images",
    hooks: {
      "astro:config:setup": async ({ config }) => {
        const rootDir = fileURLToPath(config.root);
        await generateMarketingImages(rootDir);
      },
    },
  };
}
