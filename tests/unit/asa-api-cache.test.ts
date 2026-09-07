import { mkdir, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import {
  asaApiCachedZipPath,
  clearAsaApiDownloadCache,
  finalizeAsaApiCacheDownload,
  pruneAsaApiRepoCache,
  resolveAsaApiCachedZip,
  sanitizeAsaApiCacheSegment,
} from "@backend/domains/asa-api/asa-api-cache";

let root: string | null = null;

afterEach(() => {
  if (root !== null) {
    rmSync(root, { recursive: true, force: true });
    root = null;
  }
});

describe("asa-api cache", () => {
  it("sanitizes path segments", () => {
    expect(sanitizeAsaApiCacheSegment("2.03")).toBe("2.03");
    expect(sanitizeAsaApiCacheSegment('a/b\\c:d*e?')).toBe("a_b_c_d_e_");
  });

  it("hits cache when size matches and misses when size differs", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asa-cache-"));
    const path = asaApiCachedZipPath(root, "AsaApi", "2.03", "AsaApi_2.03.zip");
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "abcdefghij");

    expect(
      await resolveAsaApiCachedZip(root, "AsaApi", "2.03", "AsaApi_2.03.zip", 10),
    ).toBe(path);
    expect(
      await resolveAsaApiCachedZip(root, "AsaApi", "2.03", "AsaApi_2.03.zip", 99),
    ).toBeNull();
  });

  it("finalizes partial downloads into the cache path", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asa-cache-fin-"));
    const finalPath = asaApiCachedZipPath(
      root,
      "AsaApiLoader",
      "v1.0",
      "VersionLoader.zip",
    );
    const partial = `${finalPath}.partial`;
    await mkdir(join(finalPath, ".."), { recursive: true });
    await writeFile(partial, "zip-bytes");

    await finalizeAsaApiCacheDownload(partial, finalPath);
    expect(existsSync(finalPath)).toBe(true);
    expect(existsSync(partial)).toBe(false);
  });

  it("prunes older tag folders and keeps the newest two", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asa-cache-prune-"));
    const repo = join(root, "AsaApi");
    for (const tag of ["1.0", "2.0", "3.0"]) {
      const dir = join(repo, tag);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "x.zip"), tag);
      // Ensure distinct mtimes on Windows.
      await new Promise((r) => setTimeout(r, 30));
      const now = Date.now();
      const { utimes } = await import("node:fs/promises");
      await utimes(dir, now / 1000, now / 1000);
    }

    await pruneAsaApiRepoCache(root, "AsaApi", 2);
    const left = (await readdir(repo)).sort();
    expect(left).toEqual(["2.0", "3.0"]);
  });

  it("clears the whole cache tree", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asa-cache-clear-"));
    const nested = join(root, "AsaApi", "2.03");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "a.zip"), "x");
    await clearAsaApiDownloadCache(root);
    expect(existsSync(root)).toBe(true);
    expect((await readdir(root)).length).toBe(0);
    expect((await stat(root)).isDirectory()).toBe(true);
  });
});
