import { describe, expect, it } from "vitest";
import {
  createOnboardingRecord,
  parseOnboardingRecord,
  serializeOnboardingRecord,
  shouldAutoShowSetupWizard,
} from "@shared/onboarding";

describe("parseOnboardingRecord", () => {
  it("returns null for missing or blank values", () => {
    expect(parseOnboardingRecord(null)).toBeNull();
    expect(parseOnboardingRecord(undefined)).toBeNull();
    expect(parseOnboardingRecord("")).toBeNull();
    expect(parseOnboardingRecord("   ")).toBeNull();
  });

  it("parses a valid completed or skipped record", () => {
    const completed = {
      status: "completed" as const,
      completedAt: "2026-08-14T12:00:00.000Z",
    };
    expect(parseOnboardingRecord(JSON.stringify(completed))).toEqual(completed);
    expect(
      parseOnboardingRecord(
        JSON.stringify({ status: "skipped", completedAt: "2026-08-14T12:00:00.000Z" }),
      ),
    ).toEqual({
      status: "skipped",
      completedAt: "2026-08-14T12:00:00.000Z",
    });
  });

  it("rejects garbage JSON and unknown status", () => {
    expect(parseOnboardingRecord("{not json")).toBeNull();
    expect(
      parseOnboardingRecord(
        JSON.stringify({ status: "pending", completedAt: "2026-08-14T12:00:00.000Z" }),
      ),
    ).toBeNull();
  });
});

describe("serializeOnboardingRecord", () => {
  it("round-trips through parse", () => {
    const record = createOnboardingRecord(
      "completed",
      new Date("2026-08-14T12:00:00.000Z"),
      {
        clusterId: "ember",
        clusterDir: "D:\\ASA\\Clusters\\Ember",
      },
    );
    expect(parseOnboardingRecord(serializeOnboardingRecord(record))).toEqual(record);
  });
});

describe("shouldAutoShowSetupWizard", () => {
  it("shows only when the flag is unset and the fleet is empty", () => {
    expect(
      shouldAutoShowSetupWizard({ record: null, serverCount: 0 }),
    ).toBe(true);
    expect(
      shouldAutoShowSetupWizard({
        record: createOnboardingRecord("skipped"),
        serverCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldAutoShowSetupWizard({ record: null, serverCount: 1 }),
    ).toBe(false);
  });

  it("never auto-shows for E2E user-data profiles", () => {
    expect(
      shouldAutoShowSetupWizard({
        record: null,
        serverCount: 0,
        e2eUserData: "C:\\tmp\\yark-e2e",
      }),
    ).toBe(false);
  });
});
