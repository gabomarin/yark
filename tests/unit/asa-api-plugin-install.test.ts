import { createWriteStream } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import yazl from "yazl";
import {
  installAsaApiPluginFromZip,
  resolvePluginPayloadFromStaging,
} from "@backend/domains/asa-api/asa-api-plugin-install";

let root: string | null = null;

afterEach(() => {
  if (root !== null) {
    rmSync(root, { recursive: true, force: true });
    root = null;
  }
});

async function writeZip(
  zipPath: string,
  entries: Array<{ name: string; body: string }>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const entry of entries) {
      zip.addBuffer(Buffer.from(entry.body, "utf8"), entry.name);
    }
    zip.outputStream
      .pipe(createWriteStream(zipPath))
      .on("close", () => resolve())
      .on("error", reject);
    zip.end();
  });
}

describe("asa-api-plugin-install", () => {
  it("resolves a single plugin folder with matching dll", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asa-plugin-stage-"));
    const pluginDir = join(root, "AdvancedMessages");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "AdvancedMessages.dll"), "x");
    await writeFile(join(pluginDir, "config.json"), "{}");

    const payload = await resolvePluginPayloadFromStaging(root);
    expect(payload.pluginName).toBe("AdvancedMessages");
    expect(payload.flatLayout).toBe(false);
  });

  it("installs a foldered plugin zip into ArkApi\\Plugins", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asa-plugin-inst-"));
    const installDir = join(root, "install");
    const zipPath = join(root, "AdvancedMessages.zip");
    await writeZip(zipPath, [
      { name: "AdvancedMessages/AdvancedMessages.dll", body: "dll" },
      { name: "AdvancedMessages/config.json", body: "{}" },
    ]);

    const status = await installAsaApiPluginFromZip(installDir, zipPath);
    expect(status.plugins).toHaveLength(1);
    expect(status.plugins[0]?.name).toBe("AdvancedMessages");
    expect(status.plugins[0]?.enabled).toBe(true);
    expect(
      existsSync(
        join(
          installDir,
          "ShooterGame",
          "Binaries",
          "Win64",
          "ArkApi",
          "Plugins",
          "AdvancedMessages",
          "AdvancedMessages.dll",
        ),
      ),
    ).toBe(true);
  });

  it("installs a flat zip with a single dll at the root", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asa-plugin-flat-"));
    const installDir = join(root, "install");
    const zipPath = join(root, "flat.zip");
    await writeZip(zipPath, [
      { name: "CrossChat.dll", body: "dll" },
      { name: "config.json", body: "{}" },
    ]);

    const status = await installAsaApiPluginFromZip(installDir, zipPath);
    expect(status.plugins[0]?.name).toBe("CrossChat");
    expect(
      existsSync(
        join(
          installDir,
          "ShooterGame",
          "Binaries",
          "Win64",
          "ArkApi",
          "Plugins",
          "CrossChat",
          "CrossChat.dll",
        ),
      ),
    ).toBe(true);
  });
});
