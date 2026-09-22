import { describe, expect, it } from "vitest";
import {
  formatForHostedResourceKind,
  hostedResourceLaunchArg,
  isHostedResourceKind,
  kindsForHostedResourceFormat,
  normalizeHostedResourceKind,
  parseHostedResourceUrl,
} from "@shared/settings/hosted-resources";
import {
  ADMIN_LIST_URL_CONSUMER,
  BAD_WORD_LIST_URL_CONSUMER,
  BAD_WORD_WHITE_LIST_URL_CONSUMER,
  BAN_LIST_URL_CONSUMER,
  CUSTOM_DYNAMIC_CONFIG_URL_CONSUMER,
  CUSTOM_LIVE_TUNING_URL_CONSUMER,
  CUSTOM_NOTIFICATION_URL_CONSUMER,
  HOSTED_RESOURCE_CONSUMERS,
  HOSTED_RESOURCE_SURFACE_LABELS,
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
    expect(consumerForSetting("badwordlisturl")).toBe(BAD_WORD_LIST_URL_CONSUMER);
    expect(consumerForSetting(" badwordwhitelisturl ")).toBe(BAD_WORD_WHITE_LIST_URL_CONSUMER);
    expect(consumerForSetting("customlivetuningurl")).toBe(CUSTOM_LIVE_TUNING_URL_CONSUMER);
    expect(consumerForSetting("NotASetting")).toBeNull();
    expect(consumerForLaunchOptionId("customdynamicconfigurl-url")).toBe(CUSTOM_DYNAMIC_CONFIG_URL_CONSUMER);
    expect(consumerForLaunchOptionId("customnotificationurl-url")).toBe(CUSTOM_NOTIFICATION_URL_CONSUMER);
    expect(consumerForLaunchOptionId("usedynamicconfig")).toBeNull();
    expect(HOSTED_RESOURCE_CONSUMERS).toHaveLength(7);
    // The launch row only becomes interactive with its parent flag on.
    expect(CUSTOM_DYNAMIC_CONFIG_URL_CONSUMER.dependsOnLaunchOptionId).toBe("usedynamicconfig");
  });

  it("keeps every kind on a single format", () => {
    expect(formatForHostedResourceKind("admin-list")).toBe("text");
    expect(formatForHostedResourceKind("ban-list")).toBe("text");
    expect(formatForHostedResourceKind("dynamic-config")).toBe("ini");
    expect(formatForHostedResourceKind("notification-url")).toBe("text");
    expect(formatForHostedResourceKind("bad-word-list")).toBe("text");
    expect(formatForHostedResourceKind("good-word-list")).toBe("text");
    expect(formatForHostedResourceKind("live-tuning")).toBe("json");
    expect(kindsForHostedResourceFormat("text")).toEqual([
      "admin-list",
      "ban-list",
      "notification-url",
      "bad-word-list",
      "good-word-list",
    ]);
    expect(kindsForHostedResourceFormat("ini")).toEqual(["dynamic-config"]);
    expect(kindsForHostedResourceFormat("json")).toEqual(["live-tuning"]);
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

  it("labels the surface a reference jumps to, not where the key name suggests", () => {
    expect(HOSTED_RESOURCE_SURFACE_LABELS[ADMIN_LIST_URL_CONSUMER.surface]).toBe("RCON → Admins");
    expect(HOSTED_RESOURCE_SURFACE_LABELS[BAN_LIST_URL_CONSUMER.surface]).toBe("INI Files → Visual");
    expect(HOSTED_RESOURCE_SURFACE_LABELS[CUSTOM_LIVE_TUNING_URL_CONSUMER.surface]).toBe("INI Files → Visual");
    expect(HOSTED_RESOURCE_SURFACE_LABELS[CUSTOM_NOTIFICATION_URL_CONSUMER.surface]).toBe("Launch");
    for (const consumer of HOSTED_RESOURCE_CONSUMERS) {
      expect(HOSTED_RESOURCE_SURFACE_LABELS[consumer.surface]).toBeTruthy();
    }
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

describe("hostedResourceLaunchArg", () => {
  it("reads the flag name and value of a launch argument that points at a resource", () => {
    expect(hostedResourceLaunchArg(`-CustomNotificationURL="http://127.0.0.1:8935/r/${TOKEN}"`)).toEqual({
      key: "CustomNotificationURL",
      value: `http://127.0.0.1:8935/r/${TOKEN}`,
    });
    expect(hostedResourceLaunchArg(`?CustomLiveTuningUrl=http://127.0.0.1:8935/r/${TOKEN}`)).toMatchObject({
      key: "CustomLiveTuningUrl",
    });
    // A mod's own argument counts too: anything whose value is a YARK URL.
    expect(hostedResourceLaunchArg(`-MyModConfigOverride=http://localhost/r/${TOKEN}`)).toMatchObject({
      key: "MyModConfigOverride",
    });
  });

  it("names the flag that precedes the URL when ASA joins several options into one argument", () => {
    expect(hostedResourceLaunchArg(`?Flag1=x?CustomDynamicConfigUrl=http://127.0.0.1:8935/r/${TOKEN}`)).toMatchObject({
      key: "CustomDynamicConfigUrl",
    });
  });

  it("ignores flags that are not resource URLs", () => {
    expect(hostedResourceLaunchArg("-port=7777")).toBeNull();
    expect(hostedResourceLaunchArg("-CustomDynamicConfigUrl=https://example.com/dynamicconfig.ini")).toBeNull();
    expect(hostedResourceLaunchArg("-NoBattlEye")).toBeNull();
    expect(hostedResourceLaunchArg(`http://127.0.0.1:8935/r/${TOKEN}`)).toBeNull();
  });
});

describe("parseHostedResourceUrl", () => {
  it("extracts the token from a YARK loopback URL, including a quoted INI value", () => {
    expect(parseHostedResourceUrl(`http://127.0.0.1:8935/r/${TOKEN}`)).toMatchObject({ token: TOKEN, port: 8935 });
    expect(parseHostedResourceUrl(`"http://127.0.0.1:8935/r/${TOKEN}"`)).toMatchObject({ token: TOKEN });
    expect(parseHostedResourceUrl(`'http://127.0.0.1:8935/r/${TOKEN}'`)).toMatchObject({ token: TOKEN });
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
