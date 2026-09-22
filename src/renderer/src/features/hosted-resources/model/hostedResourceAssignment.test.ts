import { describe, expect, it } from "vitest";
import { ADMIN_LIST_URL_CONSUMER } from "@shared/settings/hosted-resource-consumers";
import type { HostedResourceLike } from "@shared/settings/hosted-resource-consumers";
import { assignmentIssueMessage, classifyHostedResourceValue, compatibleResources } from "./hostedResourceAssignment";

const TOKEN = "B".repeat(43);

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

describe("classifyHostedResourceValue", () => {
  const consumer = ADMIN_LIST_URL_CONSUMER;

  it("leaves external URLs, other port spellings of loopback paths, and blanks alone", () => {
    for (const value of ["", "https://gist.example.com/admins.txt", "   "]) {
      expect(classifyHostedResourceValue(value, [], consumer)).toEqual({ resource: null, issue: null });
    }
  });

  it("reports a compatible resource as fine", () => {
    const assignment = classifyHostedResourceValue(resource().url, [resource()], consumer);
    expect(assignment.issue).toBeNull();
    expect(assignment.resource?.id).toBe("hr-1");
  });

  it("reports each broken state", () => {
    expect(classifyHostedResourceValue(resource().url, [resource({ enabled: false })], consumer).issue).toBe(
      "disabled",
    );
    expect(classifyHostedResourceValue(resource().url, [resource({ publishedRevisionId: null })], consumer).issue).toBe(
      "unpublished",
    );
    expect(classifyHostedResourceValue(resource().url, [resource({ kind: null })], consumer).issue).toBe("untyped");
    expect(classifyHostedResourceValue(resource().url, [resource({ kind: "ban-list" })], consumer).issue).toBe(
      "incompatible-kind",
    );
    expect(classifyHostedResourceValue(resource().url, [], consumer).issue).toBe("missing");
  });

  it("flags a value left on an older host port, still naming the resource", () => {
    const moved = resource({ url: `http://127.0.0.1:9999/r/${TOKEN}` });
    const assignment = classifyHostedResourceValue(resource().url, [moved], consumer);
    expect(assignment.issue).toBe("stale-port");
    expect(assignment.resource?.id).toBe("hr-1");
    expect(assignmentIssueMessage(assignment, consumer)).toMatch(/served on port 9999/i);
  });

  it("accepts the value once it carries the port the host serves on", () => {
    const moved = resource({ url: `http://127.0.0.1:9999/r/${TOKEN}` });
    expect(classifyHostedResourceValue(moved.url, [moved], consumer).issue).toBeNull();
  });

  it("writes copy for every issue, naming the resource where one matched", () => {
    const states: Array<Partial<HostedResourceLike>> = [
      { enabled: false },
      { publishedRevisionId: null },
      { kind: null },
      { kind: "ban-list" },
    ];
    for (const overrides of states) {
      const assignment = classifyHostedResourceValue(resource().url, [resource(overrides)], consumer);
      const message = assignmentIssueMessage(assignment, consumer);
      expect(message).toContain("Admins allowlist");
    }
    expect(classifyHostedResourceValue("", [], consumer).issue).toBeNull();
    expect(assignmentIssueMessage(classifyHostedResourceValue(resource().url, [], consumer), consumer)).toMatch(
      /no current resource serves it/i,
    );
  });
});

describe("compatibleResources", () => {
  it("filters by kind, enabled, and published", () => {
    const list = [
      resource({ id: "ok" }),
      resource({ id: "other-kind", kind: "ban-list" }),
      resource({ id: "off", enabled: false }),
      resource({ id: "empty", publishedRevisionId: null }),
      resource({ id: "untyped", kind: null }),
    ];
    expect(compatibleResources(list, ADMIN_LIST_URL_CONSUMER).map((entry) => entry.id)).toEqual(["ok"]);
  });
});
