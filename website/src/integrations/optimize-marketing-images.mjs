import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SHOT_WEBP_QUALITY, SHOT_WIDTHS } from "../data/screenshot-media.mjs";

const LOGO_WIDTHS = [320, 640];
const LOGO_WEBP_QUALITY = 80;

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
    .webp({ quality, effort: 4, smartSubsample: false })
    .toFile(tmp);
  await fs.rename(tmp, dest);
}

async function ensureMediaGeneration(mediaDir, stamp) {
  const stampPath = path.join(mediaDir, ".generation");
  let previous = "";
  try {
    previous = (await fs.readFile(stampPath, "utf8")).trim();
  } catch {
    previous = "";
  }
  if (previous === stamp) {
    return;
  }
  const names = await fs.readdir(mediaDir).catch(() => []);
  await Promise.all(
    names
      .filter((name) => name.endsWith(".webp"))
      .map((name) => fs.unlink(path.join(mediaDir, name))),
  );
  await fs.writeFile(stampPath, `${stamp}\n`, "utf8");
}

export async function generateMarketingImages(rootDir) {
  const shotsDir = path.join(rootDir, "public", "screenshots");
  const mediaDir = path.join(rootDir, "public", "media");
  await fs.mkdir(mediaDir, { recursive: true });
  await ensureMediaGeneration(
    mediaDir,
    `shots-${SHOT_WIDTHS.join("-")}-q${SHOT_WEBP_QUALITY}-logo-q${LOGO_WEBP_QUALITY}`,
  );

  const files = (await fs.readdir(shotsDir)).filter((name) => name.endsWith(".png"));
  for (const file of files) {
    const src = path.join(shotsDir, file);
    const slug = file.slice(0, -4);
    for (const width of SHOT_WIDTHS) {
      await writeWebp(src, path.join(mediaDir, `${slug}-${width}.webp`), width, SHOT_WEBP_QUALITY);
    }
  }

  const logoSrc = path.join(rootDir, "public", "assets", "yark-logo.png");
  for (const width of LOGO_WIDTHS) {
    await writeWebp(logoSrc, path.join(mediaDir, `yark-logo-${width}.webp`), width, LOGO_WEBP_QUALITY);
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
