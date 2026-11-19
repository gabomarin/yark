import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import {
  deleteLocalModFolders,
  listLocalModFolders,
  listLocalModPresence,
  NO_LOCAL_MOD_FILES_REDOWNLOAD,
} from "@backend/domains/mods/asa-mod-local-files";

const roots: string[] = [];

async function tempInstall(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "yark-mod-files-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

async function seedFolder(install: string, tree: "primary" | "secondary", name: string): Promise<string> {
  const dir =
    tree === "primary"
      ? join(install, "ShooterGame", "Binaries", "Win64", "ShooterGame", "Mods", "83374", name)
      : join(install, "ShooterGame", "Mods", "83374", name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "marker.txt"), "x");
  return dir;
}

describe("asa-mod-local-files (#702)", () => {
  it("lists matching folders from both 83374 trees", async () => {
    const install = await tempInstall();
    const primary = await seedFolder(install, "primary", "947033_1");
    const secondary = await seedFolder(install, "secondary", "947033_2");
    await seedFolder(install, "primary", "929420_9");

    const found = await listLocalModFolders(install, "947033");
    expect(found.sort()).toEqual([primary, secondary].map((path) => path).sort());
  });

  it("does not match a Project ID that is a prefix of another (#702 boundary)", async () => {
    const install = await tempInstall();
    await seedFolder(install, "primary", "123_9");
    await seedFolder(install, "primary", "12_1");

    expect(await listLocalModFolders(install, "12")).toHaveLength(1);
    expect((await listLocalModFolders(install, "12"))[0]).toMatch(/12_1$/);
    expect(await listLocalModFolders(install, "123")).toHaveLength(1);
  });

  it("reports presence for requested Project IDs only", async () => {
    const install = await tempInstall();
    await seedFolder(install, "primary", "947033_1");
    await seedFolder(install, "secondary", "929420_2");

    expect(await listLocalModPresence(install, ["947033", "111", "929420"])).toEqual({
      "947033": true,
      "111": false,
      "929420": true,
    });
  });

  it("deletes every matching folder and reports none when empty", async () => {
    const install = await tempInstall();
    await seedFolder(install, "primary", "947033_1");
    await seedFolder(install, "secondary", "947033_99");
    await seedFolder(install, "primary", "929420_1");

    const result = await deleteLocalModFolders(install, "947033");
    expect(result.deletedPaths).toHaveLength(2);
    expect(await listLocalModFolders(install, "947033")).toEqual([]);
    expect(await listLocalModFolders(install, "929420")).toHaveLength(1);

    const empty = await deleteLocalModFolders(install, "111");
    expect(empty.deletedPaths).toEqual([]);
    expect(empty.message).toBe(NO_LOCAL_MOD_FILES_REDOWNLOAD);
  });
});
