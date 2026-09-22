import { describe, expect, it } from "vitest";
import type { HostedResourceDto } from "@shared/ipc";
import { resourceStateBadge, resourceVersionLabel } from "./hostedResourcesPageModel";

function dto(patch: Partial<HostedResourceDto> = {}): HostedResourceDto {
  return {
    id: "hr-1",
    displayName: "Admins allowlist",
    format: "text",
    kind: "admin-list",
    url: "http://127.0.0.1:8935/r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    enabled: true,
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    revisionCount: 2,
    publishedRevisionId: "rev-2",
    publishedSequence: 2,
    publishedSha256: "b".repeat(64),
    publishedSizeBytes: 4096,
    notes: "",
    tags: [],
    ...patch,
  };
}

describe("resourceStateBadge", () => {
  it("is gray for a disabled resource", () => {
    expect(resourceStateBadge(dto({ enabled: false }), "verified")).toEqual({
      color: "gray",
      label: "Disabled",
    });
  });

  it("is gray while nothing is published", () => {
    expect(resourceStateBadge(dto({ publishedRevisionId: null }), null)).toEqual({
      color: "gray",
      label: "Nothing published",
    });
  });

  it("claims no health before diagnostics have run", () => {
    expect(resourceStateBadge(dto(), null)).toEqual({
      color: "gray",
      label: "Published · not checked",
    });
  });

  it("reports the resource-specific diagnostic result", () => {
    expect(resourceStateBadge(dto(), "verified")).toEqual({ color: "ok", label: "Verified" });
    expect(resourceStateBadge(dto(), "unreachable")).toEqual({ color: "red", label: "Unreachable" });
    expect(resourceStateBadge(dto(), "mismatch")).toEqual({ color: "attention", label: "Content changed" });
  });
});

describe("resourceVersionLabel", () => {
  it("is null while nothing is published", () => {
    expect(resourceVersionLabel(dto({ publishedRevisionId: null }))).toBeNull();
  });

  it("shows the sequence and the served sha", () => {
    expect(resourceVersionLabel(dto())).toBe("Version 2 · bbbbbbbbbbbb");
  });
});
