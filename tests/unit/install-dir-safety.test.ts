import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { assertInstallDirVacantForCreate } from "../../src/backend/domains/instances/install-dir-safety";

describe("assertInstallDirVacantForCreate", () => {
  let root: string | null = null;

  afterEach(async () => {
    if (root !== null) {
      await rm(root, { recursive: true, force: true });
      root = null;
    }
  });

  async function tempRoot(): Promise<string> {
    root = await mkdtemp(join(tmpdir(), "yark-create-path-"));
    return root;
  }

  it("allows a missing path", async () => {
    const dir = join(await tempRoot(), "missing");
    await expect(assertInstallDirVacantForCreate(dir)).resolves.toBeUndefined();
  });

  it("allows an empty folder", async () => {
    const dir = join(await tempRoot(), "empty");
    await mkdir(dir, { recursive: true });
    await expect(assertInstallDirVacantForCreate(dir)).resolves.toBeUndefined();
  });

  it("rejects a non-empty folder", async () => {
    const dir = join(await tempRoot(), "used");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "readme.txt"), "x");
    await expect(assertInstallDirVacantForCreate(dir)).rejects.toThrow(/not empty/i);
  });
});
