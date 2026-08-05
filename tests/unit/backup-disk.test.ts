import {
  ensureParentDir,
  isBackupDestinationReachable,
  sameFsPath,
  volumeRootForPath,
} from "@backend/domains/backups/backup-disk";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const tmpDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe("backup-disk helpers", () => {
  it("resolves Windows drive roots", () => {
    expect(volumeRootForPath("D:\\Backups\\Island")).toBe("D:\\");
    expect(volumeRootForPath("c:/ARK/srv/Backups")).toMatch(/^c:\\$/i);
  });

  it("compares filesystem paths case-insensitively", () => {
    expect(sameFsPath("C:\\Backups\\A.zip", "c:\\backups\\a.zip")).toBe(true);
    expect(sameFsPath("C:\\Backups\\A.zip", "C:\\Backups\\B.zip")).toBe(false);
  });

  it("treats missing roots with an existing parent as reachable", () => {
    expect(isBackupDestinationReachable(process.cwd())).toBe(true);
  });

  it("ensureParentDir creates nested folders without mkdir on existing parents", async () => {
    const root = await mkdtemp(join(tmpdir(), "ark-ensure-parent-"));
    tmpDirs.push(root);
    const nestedFile = join(root, "a", "b", "out.zip");
    await ensureParentDir(nestedFile);
    expect(existsSync(join(root, "a", "b"))).toBe(true);
    // Idempotent when parent already exists (covers drive-root skip path).
    await ensureParentDir(nestedFile);
    await writeFile(nestedFile, "ok", "utf8");
    expect(existsSync(nestedFile)).toBe(true);
  });

  it("ensureParentDir no-ops when the parent already exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "ark-ensure-exists-"));
    tmpDirs.push(root);
    await mkdir(join(root, "ready"), { recursive: true });
    await ensureParentDir(join(root, "ready", "file.zip"));
    expect(existsSync(join(root, "ready"))).toBe(true);
  });
});
