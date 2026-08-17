/**
 * Reparse-point / Windows junction policy (#322).
 * Native junction cases run only on win32.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertDestAndParentNotReparsePoints,
  assertNoReparsePointsUnderRoot,
  assertPathChainHasNoReparsePoints,
  directorySizeSafe,
  estimateDirectoryBytes,
  isRegularFileDirent,
  isReparsePointDirent,
  isTraversableDirectoryDirent,
  listFilesRecursiveSafe,
  prepareWritableDirUnderRoot,
} from "@backend/infra/fs/reparse-points";
import { robocopyTree } from "@backend/domains/updates/robocopy-tree";
import { extractZip, zipDirectory } from "@backend/domains/backups/backup-archive";

const IS_WINDOWS = process.platform === "win32";
const roots: string[] = [];

function trackTemp(root: string): string {
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0, roots.length)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Best effort on Windows (AV may briefly lock files).
    }
  }
});

function createJunction(linkPath: string, targetPath: string): void {
  execFileSync("cmd.exe", ["/c", "mklink", "/J", linkPath, targetPath], {
    stdio: "ignore",
    windowsHide: true,
  });
}

describe("reparse-point dirent helpers", () => {
  it("treats symbolic-link dirents as non-traversable", () => {
    const link = {
      name: "j",
      isDirectory: () => false,
      isFile: () => false,
      isSymbolicLink: () => true,
    };
    expect(isReparsePointDirent(link as never)).toBe(true);
    expect(isTraversableDirectoryDirent(link as never)).toBe(false);
    expect(isRegularFileDirent(link as never)).toBe(false);
  });

  it("still traverses ordinary directories", () => {
    const dir = {
      name: "d",
      isDirectory: () => true,
      isFile: () => false,
      isSymbolicLink: () => false,
    };
    expect(isTraversableDirectoryDirent(dir as never)).toBe(true);
  });
});

describe("reparse-point walks (cross-platform)", () => {
  it("estimates and lists only regular files", async () => {
    const root = trackTemp(await mkdtemp(join(tmpdir(), "yark-reparse-walk-")));
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "a.txt"), "aa", "utf8");
    await writeFile(join(root, "nested", "b.txt"), "bbbb", "utf8");

    expect(await estimateDirectoryBytes(root)).toBe(6);
    expect(await directorySizeSafe(root)).toBe(6);
    const files = await listFilesRecursiveSafe(root);
    const rels = files.map((f) => relative(root, f).split("\\").join("/")).sort();
    expect(rels).toEqual(["a.txt", "nested/b.txt"]);
  });

  it("allows a missing destination root", async () => {
    await expect(
      assertNoReparsePointsUnderRoot(join(tmpdir(), "yark-missing-dest-nope")),
    ).resolves.toBeUndefined();
  });

  it("honors cancel during under-root scans", async () => {
    const root = trackTemp(await mkdtemp(join(tmpdir(), "yark-reparse-cancel-")));
    await mkdir(join(root, "a"), { recursive: true });
    await expect(
      assertNoReparsePointsUnderRoot(root, {
        isCancelled: () => true,
      }),
    ).rejects.toMatchObject({ name: "OperationCancelledError" });
  });

  it("skips excludeDirs during under-root scans", async () => {
    const root = trackTemp(await mkdtemp(join(tmpdir(), "yark-reparse-xd-")));
    // Cross-platform stand-in: a nested real dir named like the ASA exclude.
    await mkdir(join(root, "ShooterGame", "Saved", "deep"), { recursive: true });
    await mkdir(join(root, "ok"), { recursive: true });
    await expect(
      assertNoReparsePointsUnderRoot(root, {
        excludeDirs: ["ShooterGame\\Saved"],
      }),
    ).resolves.toBeUndefined();
  });
});

describe.runIf(IS_WINDOWS)("Windows junction hardening (#322)", () => {
  it("skips junction targets in size estimates and file lists", async () => {
    const root = trackTemp(mkdtempSync(join(tmpdir(), "yark-junc-src-")));
    const sentinel = join(root, "sentinel");
    const tree = join(root, "tree");
    mkdirSync(join(tree, "real"), { recursive: true });
    mkdirSync(sentinel, { recursive: true });
    writeFileSync(join(tree, "real", "keep.txt"), "keep", "utf8");
    writeFileSync(join(sentinel, "secret.txt"), "SECRET-BYTES-HERE", "utf8");
    createJunction(join(tree, "link"), sentinel);

    const bytes = await estimateDirectoryBytes(tree);
    expect(bytes).toBe(4);
    expect(bytes).toBeLessThan("SECRET-BYTES-HERE".length);

    const listed = await listFilesRecursiveSafe(tree);
    expect(listed.some((p) => p.toLowerCase().includes("secret"))).toBe(false);
    expect(listed.some((p) => p.endsWith("keep.txt"))).toBe(true);
  });

  it("robocopyTree does not copy through a source junction", async () => {
    const root = trackTemp(mkdtempSync(join(tmpdir(), "yark-junc-copy-")));
    const sentinel = join(root, "sentinel");
    const source = join(root, "source");
    const dest = join(root, "dest");
    mkdirSync(join(source, "real"), { recursive: true });
    mkdirSync(sentinel, { recursive: true });
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(source, "real", "keep.txt"), "keep", "utf8");
    writeFileSync(join(sentinel, "secret.txt"), "SECRET", "utf8");
    createJunction(join(source, "link"), sentinel);

    const code = await robocopyTree(source, dest, {
      operationLabel: "junction source copy test",
    });
    expect(code).toBeGreaterThanOrEqual(0);
    expect(code).toBeLessThan(8);

    expect(existsSync(join(dest, "real", "keep.txt"))).toBe(true);
    expect(existsSync(join(dest, "link"))).toBe(false);
    expect(existsSync(join(dest, "link", "secret.txt"))).toBe(false);
    expect(readFileSync(join(sentinel, "secret.txt"), "utf8")).toBe("SECRET");
  });

  it("rejects a destination tree that already contains a junction", async () => {
    const root = trackTemp(mkdtempSync(join(tmpdir(), "yark-junc-dest-")));
    const sentinel = join(root, "sentinel");
    const source = join(root, "source");
    const dest = join(root, "dest");
    mkdirSync(join(source, "data"), { recursive: true });
    mkdirSync(sentinel, { recursive: true });
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(source, "data", "payload.txt"), "PAYLOAD", "utf8");
    writeFileSync(join(sentinel, "marker.txt"), "UNTOUCHED", "utf8");
    createJunction(join(dest, "data"), sentinel);

    await expect(
      robocopyTree(source, dest, { operationLabel: "junction dest copy test" }),
    ).rejects.toThrow(/link or junction at "data"/i);

    expect(readFileSync(join(sentinel, "marker.txt"), "utf8")).toBe("UNTOUCHED");
    expect(existsSync(join(sentinel, "payload.txt"))).toBe(false);
  });

  it("rejects a parent junction on the write path before mkdir", async () => {
    const root = trackTemp(mkdtempSync(join(tmpdir(), "yark-junc-parent-")));
    const install = join(root, "install");
    const sentinel = join(root, "sentinel");
    mkdirSync(install, { recursive: true });
    mkdirSync(sentinel, { recursive: true });
    writeFileSync(join(sentinel, "marker.txt"), "UNTOUCHED", "utf8");
    createJunction(join(install, "SavedArks"), sentinel);

    const liveMap = join(install, "SavedArks", "Island");
    await expect(
      assertPathChainHasNoReparsePoints(install, liveMap, {
        operationLabel: "restore world files",
      }),
    ).rejects.toThrow(/SavedArks/i);

    await expect(
      prepareWritableDirUnderRoot(install, liveMap, {
        operationLabel: "restore world files",
      }),
    ).rejects.toThrow(/link or junction/i);

    expect(existsSync(join(sentinel, "Island"))).toBe(false);
    expect(readFileSync(join(sentinel, "marker.txt"), "utf8")).toBe("UNTOUCHED");
  });

  it("rejects extract when a grandparent is a junction", async () => {
    const root = trackTemp(await mkdtemp(join(tmpdir(), "yark-junc-grand-")));
    const sentinel = join(root, "sentinel");
    const junc = join(root, "junc");
    await mkdir(sentinel, { recursive: true });
    createJunction(junc, sentinel);

    // Create a real mid folder *through* the junction (lands in sentinel).
    const mid = join(junc, "mid");
    await mkdir(mid, { recursive: true });
    const dest = join(mid, "staging");

    await expect(
      assertDestAndParentNotReparsePoints(dest, {
        operationLabel: "extract this backup",
      }),
    ).rejects.toThrow(/link or junction/i);
  });

  it("robocopyTree rejects a missing dest whose parent is a junction", async () => {
    const root = trackTemp(mkdtempSync(join(tmpdir(), "yark-junc-robo-parent-")));
    const sentinel = join(root, "sentinel");
    const parent = join(root, "parent");
    const source = join(root, "source");
    mkdirSync(sentinel, { recursive: true });
    mkdirSync(join(source, "data"), { recursive: true });
    writeFileSync(join(source, "data", "payload.txt"), "PAYLOAD", "utf8");
    writeFileSync(join(sentinel, "marker.txt"), "UNTOUCHED", "utf8");
    createJunction(parent, sentinel);

    const dest = join(parent, "NewServer");
    await expect(
      robocopyTree(source, dest, { operationLabel: "parent junction copy" }),
    ).rejects.toThrow(/link or junction/i);

    expect(existsSync(join(sentinel, "NewServer"))).toBe(false);
    expect(readFileSync(join(sentinel, "marker.txt"), "utf8")).toBe("UNTOUCHED");
  });

  it("resolveWorldMapSaveDir ignores a map folder that is a junction", async () => {
    const { resolveWorldMapSaveDir } = await import(
      "@backend/domains/backups/world-snapshot"
    );
    const root = trackTemp(mkdtempSync(join(tmpdir(), "yark-junc-map-")));
    const savedArks = join(root, "SavedArks");
    const sentinel = join(root, "sentinel");
    mkdirSync(savedArks, { recursive: true });
    mkdirSync(sentinel, { recursive: true });
    writeFileSync(join(sentinel, "TheIsland_WP.ark"), "EXTERNAL", "utf8");
    createJunction(join(savedArks, "TheIsland_WP"), sentinel);

    await expect(resolveWorldMapSaveDir(savedArks, "TheIsland_WP")).resolves.toBeNull();
  });

  it("excludeDirs lets cache-sync skip junctions only under Saved", async () => {
    const root = trackTemp(mkdtempSync(join(tmpdir(), "yark-junc-xd-")));
    const sentinel = join(root, "sentinel");
    const dest = join(root, "dest");
    mkdirSync(join(dest, "ShooterGame", "Saved"), { recursive: true });
    mkdirSync(join(dest, "Engine"), { recursive: true });
    mkdirSync(sentinel, { recursive: true });
    createJunction(join(dest, "ShooterGame", "Saved", "escape"), sentinel);

    await expect(
      assertNoReparsePointsUnderRoot(dest, {
        excludeDirs: ["ShooterGame\\Saved"],
      }),
    ).resolves.toBeUndefined();

    createJunction(join(dest, "Engine", "bad"), sentinel);
    await expect(assertNoReparsePointsUnderRoot(dest, {
      excludeDirs: ["ShooterGame\\Saved"],
    })).rejects.toThrow(/Engine\/bad/i);
  });

  it("recursive delete removes the junction link but not the sentinel target", async () => {
    const root = trackTemp(mkdtempSync(join(tmpdir(), "yark-junc-rm-")));
    const sentinel = join(root, "sentinel");
    const tree = join(root, "tree");
    mkdirSync(tree, { recursive: true });
    mkdirSync(sentinel, { recursive: true });
    writeFileSync(join(sentinel, "alive.txt"), "alive", "utf8");
    createJunction(join(tree, "link"), sentinel);

    await rm(tree, { recursive: true, force: true });
    expect(existsSync(tree)).toBe(false);
    expect(existsSync(join(sentinel, "alive.txt"))).toBe(true);
  });

  it("backup zip packaging does not include junction target files", async () => {
    const root = trackTemp(await mkdtemp(join(tmpdir(), "yark-junc-zip-")));
    const sentinel = join(root, "sentinel");
    const source = join(root, "source");
    await mkdir(join(source, "real"), { recursive: true });
    await mkdir(sentinel, { recursive: true });
    await writeFile(join(source, "real", "keep.txt"), "keep", "utf8");
    await writeFile(join(sentinel, "secret.txt"), "SECRET", "utf8");
    createJunction(join(source, "link"), sentinel);

    const zipPath = join(root, "out.zip");
    const size = await zipDirectory(source, zipPath);
    expect(size).toBeGreaterThan(0);

    const { readZipTextEntry } = await import("@backend/domains/backups/backup-archive");
    expect(await readZipTextEntry(zipPath, "real/keep.txt")).toBe("keep");
    expect(await readZipTextEntry(zipPath, "link/secret.txt")).toBeNull();
  });

  it("assertNoReparsePointsUnderRoot names the relative path only", async () => {
    const root = trackTemp(mkdtempSync(join(tmpdir(), "yark-junc-assert-")));
    const sentinel = join(root, "outside");
    const tree = join(root, "tree");
    mkdirSync(join(tree, "nested"), { recursive: true });
    mkdirSync(sentinel, { recursive: true });
    createJunction(join(tree, "nested", "escape"), sentinel);

    await expect(assertNoReparsePointsUnderRoot(tree)).rejects.toThrow(
      /nested\/escape/i,
    );
    try {
      await assertNoReparsePointsUnderRoot(tree);
      expect.unreachable("expected reparse-point rejection");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message.toLowerCase()).not.toContain("outside");
      expect(message).not.toMatch(/[a-z]:\\/i);
    }
  });
});
