import { describe, expect, it } from "vitest";
import {
  formatForHostedResourceKind,
  isHostedResourceKind,
  kindsForHostedResourceFormat,
  normalizeHostedResourceKind,
  parseHostedResourceUrl,
} from "@shared/settings/hosted-resources";
import {
  ADMIN_LIST_URL_CONSUMER,
  BAN_LIST_URL_CONSUMER,
  CUSTOM_DYNAMIC_CONFIG_URL_CONSUMER,
  HOSTED_RESOURCE_CONSUMERS,
  consumerForLaunchOptionId,
  consumerForSetting,
  isHostedResourceCompatible,
  type HostedResourceLike,
} from "@shared/settings/hosted-resource-consumers";

const TOKEN = "A".repeat(43);

function resource(overrides: Partial<HostedResourceLike> = {}): HostedResourceLike {
  return {
    id: "hr-1",
    displayName: "Admins allowlist",
    url: `http://127.0.0.1:8935/r/${TOKEN}`,
    enabled: true,
    kind: "admin-list",
    publishedRevisionId: "rev-1",
    ...overrides,
  };
}

describe("hosted resource consumers (#577)", () => {
  it("maps settings and launch options to one kind each", () => {
    expect(consumerForSetting("adminlisturl")).toBe(ADMIN_LIST_URL_CONSUMER);
    expect(consumerForSetting(" BanListURL ")).toBe(BAN_LIST_URL_CONSUMER);
    expect(consumerForSetting("NotASetting")).toBeNull();
    expect(consumerForLaunchOptionId("customdynamicconfigurl-url")).toBe(CUSTOM_DYNAMIC_CONFIG_URL_CONSUMER);
    expect(consumerForLaunchOptionId("usedynamicconfig")).toBeNull();
    expect(HOSTED_RESOURCE_CONSUMERS).toHaveLength(3);
    // The launch row only becomes interactive with its parent flag on.
    expect(CUSTOM_DYNAMIC_CONFIG_URL_CONSUMER.dependsOnLaunchOptionId).toBe("usedynamicconfig");
  });

  it("keeps every kind on a single format", () => {
    expect(formatForHostedResourceKind("admin-list")).toBe("text");
    expect(formatForHostedResourceKind("ban-list")).toBe("text");
    expect(formatForHostedResourceKind("dynamic-config")).toBe("ini");
    expect(kindsForHostedResourceFormat("text")).toEqual(["admin-list", "ban-list"]);
    expect(kindsForHostedResourceFormat("ini")).toEqual(["dynamic-config"]);
    expect(kindsForHostedResourceFormat("json")).toEqual([]);
  });

  it("normalizes kinds and rejects unknown ones", () => {
    expect(normalizeHostedResourceKind(null)).toBeNull();
    expect(normalizeHostedResourceKind(undefined)).toBeNull();
    expect(normalizeHostedResourceKind("")).toBeNull();
    expect(normalizeHostedResourceKind(" ADMIN-LIST ")).toBe("admin-list");
    expect(normalizeHostedResourceKind("ban-list")).toBe("ban-list");
    expect(() => normalizeHostedResourceKind("gist")).toThrow(/Unknown hosted resource kind/);
    expect(isHostedResourceKind("dynamic-config")).toBe(true);
    expect(isHostedResourceKind("gist")).toBe(false);
    expect(isHostedResourceKind(null)).toBe(false);
  });

  it("offers only enabled, published resources of the consumer's kind", () => {
    const consumer = ADMIN_LIST_URL_CONSUMER;
    expect(isHostedResourceCompatible(resource(), consumer)).toBe(true);
    expect(isHostedResourceCompatible(resource({ enabled: false }), consumer)).toBe(false);
    expect(isHostedResourceCompatible(resource({ publishedRevisionId: null }), consumer)).toBe(false);
    expect(isHostedResourceCompatible(resource({ kind: null }), consumer)).toBe(false);
    expect(isHostedResourceCompatible(resource({ kind: "ban-list" }), consumer)).toBe(false);
  });
});

describe("parseHostedResourceUrl", () => {
  it("extracts the token from a YARK loopback URL, including a quoted INI value", () => {
    expect(parseHostedResourceUrl(`http://127.0.0.1:8935/r/${TOKEN}`)).toMatchObject({ token: TOKEN, port: 8935 });
    expect(parseHostedResourceUrl(`"http://127.0.0.1:8935/r/${TOKEN}"`)).toMatchObject({ token: TOKEN });
    expect(parseHostedResourceUrl(`http://localhost/r/${TOKEN}`)).toMatchObject({ token: TOKEN, port: null });
    expect(parseHostedResourceUrl(`http://[::1]:9000/r/${TOKEN}`)).toMatchObject({ token: TOKEN });
  });

  it("matches on the token so a host port change keeps the reference", () => {
    const before = parseHostedResourceUrl(`http://127.0.0.1:8935/r/${TOKEN}`);
    const after = parseHostedResourceUrl(`http://127.0.0.1:9123/r/${TOKEN}`);
    expect(before?.token).toBe(after?.token);
  });

  it("returns null for external URLs, wrong tokens, and junk", () => {
    expect(parseHostedResourceUrl("https://example.com/admins.txt")).toBeNull();
    expect(parseHostedResourceUrl(`http://192.168.1.20:8935/r/${TOKEN}`)).toBeNull();
    expect(parseHostedResourceUrl("http://127.0.0.1:8935/r/short")).toBeNull();
    expect(parseHostedResourceUrl(`file:///C:/ARK/r/${TOKEN}`)).toBeNull();
    expect(parseHostedResourceUrl("http://127.0.0.1:8935/other/path")).toBeNull();
    expect(parseHostedResourceUrl("")).toBeNull();
    expect(parseHostedResourceUrl("not a url")).toBeNull();
  });
});
