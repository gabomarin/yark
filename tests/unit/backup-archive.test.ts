import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractZip,
  isReadableZipArchive,
  readZipTextEntry,
  safeExtractTarget,
  validatePortableZip,
  zipDirectory,
  zipHasBackupLayout,
} from "@backend/domains/backups/backup-archive";

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** Minimal stored (no compression) zip — bypasses yazl which rejects `..` entry names. */
function buildStoredZip(entryName: string, contents: string): Buffer {
  const name = Buffer.from(entryName, "utf8");
  const data = Buffer.from(contents, "utf8");
  const crc = crc32(data);

  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8); // store
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc >>> 0, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  name.copy(local, 30);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc >>> 0, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42); // relative offset of local header
  name.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length + data.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([local, data, central, end]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i]!;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe("backup-archive zip safety", () => {
  it("rejects zip-slip entry names before extract", () => {
    const dest = join(tmpdir(), "ark-safe-dest");
    expect(() => safeExtractTarget(dest, "../evil.txt")).toThrow(/Unsafe zip entry/i);
    expect(() => safeExtractTarget(dest, "..\\evil.txt")).toThrow(/Unsafe zip entry/i);
    expect(() => safeExtractTarget(dest, "/abs/evil.txt")).toThrow(/Unsafe zip entry/i);
  });

  it("extracts normal entries under destDir", async () => {
    const root = await makeTempDir("ark-zip-ok-");
    const source = join(root, "src");
    const zipPath = join(root, "ok.zip");
    const dest = join(root, "out");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "manifest.json"), '{"ok":true}', "utf8");
    await zipDirectory(source, zipPath);
    await extractZip(zipPath, dest);
    expect(await readFile(join(dest, "manifest.json"), "utf8")).toBe('{"ok":true}');
  });

  it("reads a text entry without extracting the whole archive", async () => {
    const root = await makeTempDir("ark-zip-read-");
    const source = join(root, "src");
    const zipPath = join(root, "meta.zip");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "manifest.json"), '{"kind":"world"}', "utf8");
    await writeFile(join(source, "other.txt"), "noise", "utf8");
    await zipDirectory(source, zipPath);

    await expect(readZipTextEntry(zipPath, "manifest.json")).resolves.toBe(
      '{"kind":"world"}',
    );
    await expect(readZipTextEntry(zipPath, "missing.json")).resolves.toBeNull();
  });

  it("resolves null for an empty zip without hanging", async () => {
    const root = await makeTempDir("ark-zip-empty-");
    const source = join(root, "src");
    const zipPath = join(root, "empty.zip");
    await mkdir(source, { recursive: true });
    await zipDirectory(source, zipPath);
    await expect(readZipTextEntry(zipPath, "manifest.json")).resolves.toBeNull();
  });

  it("refuses to extract path-traversal zip entries", async () => {
    const root = await makeTempDir("ark-zip-slip-");
    const zipPath = join(root, "evil.zip");
    const dest = join(root, "staging");
    const outside = join(root, "evil.txt");
    await mkdir(dest, { recursive: true });
    await writeFile(zipPath, buildStoredZip("../evil.txt", "pwned"));

    await expect(extractZip(zipPath, dest)).rejects.toThrow(
      /Unsafe zip entry|invalid relative path/i,
    );
    expect(existsSync(outside)).toBe(false);
  });

  it("detects readable vs incomplete zip archives", async () => {
    const root = await makeTempDir("ark-zip-readable-");
    const source = join(root, "src");
    const goodZip = join(root, "good.zip");
    const badZip = join(root, "bad.zip");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "a.txt"), "ok", "utf8");
    await zipDirectory(source, goodZip);
    await writeFile(badZip, "partial-bytes-not-a-zip", "utf8");

    await expect(isReadableZipArchive(goodZip)).resolves.toBe(true);
    await expect(isReadableZipArchive(badZip)).resolves.toBe(false);
    await expect(isReadableZipArchive(join(root, "missing.zip"))).resolves.toBe(false);
  });

  it("requires manifest or known layout roots for backup zips", async () => {
    const root = await makeTempDir("ark-zip-layout-");
    const withManifest = join(root, "manifest-src");
    const withSavedArks = join(root, "saved-src");
    const unrelated = join(root, "noise-src");
    await mkdir(withManifest, { recursive: true });
    await mkdir(join(withSavedArks, "SavedArks"), { recursive: true });
    await mkdir(unrelated, { recursive: true });
    await writeFile(join(withManifest, "manifest.json"), '{"backup":{}}', "utf8");
    await writeFile(join(withSavedArks, "SavedArks", "map.ark"), "WORLD", "utf8");
    await writeFile(join(unrelated, "readme.txt"), "not a backup", "utf8");

    const manifestZip = join(root, "manifest.zip");
    const savedZip = join(root, "saved.zip");
    const noiseZip = join(root, "noise.zip");
    await zipDirectory(withManifest, manifestZip);
    await zipDirectory(withSavedArks, savedZip);
    await zipDirectory(unrelated, noiseZip);

    await expect(zipHasBackupLayout(manifestZip)).resolves.toBe(true);
    await expect(zipHasBackupLayout(savedZip)).resolves.toBe(true);
    await expect(zipHasBackupLayout(noiseZip)).resolves.toBe(false);
    await expect(zipHasBackupLayout(join(root, "missing.zip"))).resolves.toBe(false);
  });

  it("validatePortableZip accepts matching kind payload", async () => {
    const root = await makeTempDir("ark-portable-ok-");
    const source = join(root, "src");
    await mkdir(join(source, "SavedArks"), { recursive: true });
    await writeFile(
      join(source, "manifest.json"),
      JSON.stringify({ backup: { kind: "world", id: "w1" } }),
      "utf8",
    );
    await writeFile(join(source, "SavedArks", "map.ark"), "WORLD", "utf8");
    const zipPath = join(root, "world.zip");
    await zipDirectory(source, zipPath);

    await expect(validatePortableZip(zipPath, "world")).resolves.toEqual({
      manifestKind: "world",
    });
  });

  it("validatePortableZip rejects kind mismatch and traversal", async () => {
    const root = await makeTempDir("ark-portable-bad-");
    const iniSrc = join(root, "ini-src");
    await mkdir(join(iniSrc, "ConfigWindowsServer"), { recursive: true });
    await writeFile(
      join(iniSrc, "manifest.json"),
      JSON.stringify({ backup: { kind: "ini" } }),
      "utf8",
    );
    await writeFile(join(iniSrc, "ConfigWindowsServer", "Game.ini"), "[/script]", "utf8");
    const iniZip = join(root, "ini.zip");
    await zipDirectory(iniSrc, iniZip);

    await expect(validatePortableZip(iniZip, "world")).rejects.toThrow(
      /missing expected SavedArks|kind is ini/i,
    );

    const slipZip = join(root, "slip.zip");
    await writeFile(slipZip, buildStoredZip("../evil.txt", "pwned"));
    await expect(validatePortableZip(slipZip, "world")).rejects.toThrow(
      /Unsafe zip entry|corrupt|unreadable|missing expected/i,
    );
  });

  it("validatePortableZip rejects corrupt archives", async () => {
    const root = await makeTempDir("ark-portable-corrupt-");
    const badZip = join(root, "bad.zip");
    await writeFile(badZip, "not-a-zip", "utf8");
    await expect(validatePortableZip(badZip, "world")).rejects.toThrow(
      /corrupt|unreadable/i,
    );
  });
});
