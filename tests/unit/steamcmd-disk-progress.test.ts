import { describe, expect, it } from "vitest";
import {
  estimateProgressFromDisk,
  installScopedDownloadWatchPaths,
  parseAppManifestProgress,
  steamCmdConsoleLogPath,
} from "@backend/domains/updates/steamcmd-disk-progress";

describe("steamcmd-disk-progress scoping", () => {
  it("solo genera rutas downloading/temp bajo forceInstallDir", () => {
    const paths = installScopedDownloadWatchPaths("C:\\ark_servers\\cache_only");
    for (const path of paths) {
      expect(path.toLowerCase().startsWith("c:\\ark_servers\\cache_only")).toBe(true);
      expect(path.toLowerCase().includes("depotcache")).toBe(false);
    }
  });

  it("estima percent acotado y usa total conocido", () => {
    const sample = estimateProgressFromDisk(6_419_407_408, 12_838_814_817, 0);
    expect(sample.percent).toBeCloseTo(50, 0);
    expect(sample.total).toBe(12_838_814_817);
  });

  it("resuelve la ruta de console_log.txt junto a SteamCMD", () => {
    expect(steamCmdConsoleLogPath("C:\\tools\\steamcmd")).toBe(
      "C:\\tools\\steamcmd\\logs\\console_log.txt",
    );
  });

  it("parsea BytesDownloaded del appmanifest", () => {
    const parsed = parseAppManifestProgress(`
"AppState"
{
	"appid"		"2430930"
	"BytesToDownload"		"12838814817"
	"BytesDownloaded"		"3718412089"
}
`);
    expect(parsed.bytesDownloaded).toBe(3718412089);
    expect(parsed.bytesToDownload).toBe(12838814817);
    expect(parsed.percent).toBeCloseTo(28.96, 1);
  });
});
