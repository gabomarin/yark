import { describe, expect, it } from "vitest";
import {
  asaLaunchOptionEntries,
  asaLaunchOptionsCatalog,
  filterLaunchOptions,
  isSelectableLaunchOption,
  listSelectableLaunchOptions,
  lookupLaunchOptionById,
} from "@shared/asa-launch-options-catalog";

describe("asa-launch-options-catalog (#92)", () => {
  it("exposes summary, details, and a concrete example per entry", () => {
    expect(asaLaunchOptionsCatalog.version).toMatch(/^0\.2\./);
    expect(asaLaunchOptionsCatalog.source.url).toContain(
      "Server_configuration#Command_line_options",
    );
    expect(asaLaunchOptionEntries.length).toBeGreaterThan(50);
    for (const entry of asaLaunchOptionEntries) {
      expect(entry.summary.trim().length).toBeGreaterThan(0);
      expect(typeof entry.details).toBe("string");
      expect(entry.example.trim().length).toBeGreaterThan(0);
      expect(
        entry.description.includes(entry.summary.replace(/…$/, "")) ||
          entry.summary.endsWith("…"),
      ).toBe(true);
    }
    const active = lookupLaunchOptionById(
      asaLaunchOptionEntries.find((e) => /ActiveEvent/i.test(e.token))?.id ?? "",
    );
    expect(active?.example).toBe("-ActiveEvent=None");
    expect(active?.summary.toLowerCase()).toContain("mods");
    expect(active?.details.length ?? 0).toBeLessThan(500);
    expect(active?.details.toLowerCase()).toContain("obsolete");
  });

  it("classifies ASA Check / Missing / Unknown and YARK-owned rows", () => {
    const { counts } = asaLaunchOptionsCatalog;
    expect(counts.supported).toBeGreaterThan(0);
    expect(counts.unsupported).toBeGreaterThan(0);
    expect(counts.uncertain).toBeGreaterThan(0);
    expect(counts.yarkOwned).toBeGreaterThanOrEqual(7);

    for (const entry of asaLaunchOptionEntries) {
      expect(["supported", "unsupported", "uncertain", "yarkOwned"]).toContain(
        entry.status,
      );
      expect(entry.token.length).toBeGreaterThan(0);
      expect(entry.sources.length).toBeGreaterThan(0);
      expect(entry.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (entry.status === "supported") {
        expect(entry.wikiAsa).toBe("Yes");
        expect(entry.wikiDeprecated).toBe(false);
      }
    }
  });

  it("keeps YARK-owned composer tokens non-selectable", () => {
    for (const id of [
      "port",
      "mods",
      "server-platform",
      "clusterid",
      "cluster-dir",
      "no-transfer-from-filtering",
      "map-session",
    ]) {
      const entry = lookupLaunchOptionById(id);
      expect(entry, id).toBeDefined();
      expect(entry!.status).toBe("yarkOwned");
      expect(isSelectableLaunchOption(entry!)).toBe(false);
    }

    const selectable = listSelectableLaunchOptions();
    expect(selectable.every((e) => e.status === "supported")).toBe(true);
    expect(selectable.some((e) => e.id === "port")).toBe(false);
  });

  it("rejects empty tokens and unknown statuses in committed data", () => {
    const statuses = new Set(asaLaunchOptionEntries.map((e) => e.status));
    expect([...statuses].sort()).toEqual(
      ["supported", "uncertain", "unsupported", "yarkOwned"].sort(),
    );
    expect(asaLaunchOptionEntries.every((e) => e.token.trim().length > 0)).toBe(
      true,
    );
  });

  it("filters by status and query (ASA browse omits unsupported)", () => {
    const supported = filterLaunchOptions({ status: "supported" });
    expect(supported.length).toBe(asaLaunchOptionsCatalog.counts.supported);
    expect(supported.every((e) => e.status !== "unsupported")).toBe(true);

    const browseAll = filterLaunchOptions({ status: "all", asaOnly: true });
    expect(browseAll.every((e) => e.status !== "unsupported")).toBe(true);

    const hits = filterLaunchOptions({ query: "NoBattlEye" });
    expect(hits.some((e) => /NoBattlEye/i.test(e.token))).toBe(true);
  });

  it("uses realistic sample values in examples (not bare value)", () => {
    const clusterDir = asaLaunchOptionEntries.find((e) =>
      /ClusterDirOverride/i.test(e.token),
    );
    expect(clusterDir?.example).toMatch(/ClusterDirOverride=C:\\ARK\\Cluster$/i);

    const clusterId = asaLaunchOptionEntries.find((e) => /^-clusterid=/i.test(e.token));
    expect(clusterId?.example).toMatch(/^-clusterid=my-cluster$/i);

    const altSave = asaLaunchOptionEntries.find((e) =>
      /AltSaveDirectoryName/i.test(e.token),
    );
    expect(altSave?.example).toMatch(/AltSaveDirectoryName=ClusterSave$/);

    const port = lookupLaunchOptionById("port");
    expect(port?.example).toMatch(/^-port=7777$/);
    expect(port?.conflicts.length).toBeGreaterThan(0);

    const platform = lookupLaunchOptionById("server-platform");
    expect(platform?.example).toBe("-ServerPlatform=ALL");

    const mapSession = lookupLaunchOptionById("map-session");
    expect(mapSession?.example).toContain("TheIsland_WP");
    expect(mapSession?.example).toContain("MyASAServer");

    expect(
      asaLaunchOptionEntries.filter((e) => /=value$/i.test(e.example)).length,
    ).toBe(0);
  });
});
