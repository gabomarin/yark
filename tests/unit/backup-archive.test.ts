import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractZip,
  safeExtractTarget,
  zipDirectory,
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
});
