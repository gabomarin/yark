import { z } from "zod";

/** SQLite `app_settings.key` for first-run setup wizard completion. Independent of telemetry prefs. */
export const ONBOARDING_SETTING_KEY = "onboarding.v1";

export type OnboardingStatus = "completed" | "skipped";

export type OnboardingRecord = {
  status: OnboardingStatus;
  completedAt: string;
};

export const onboardingRecordSchema = z.object({
  status: z.enum(["completed", "skipped"]),
  completedAt: z.string().min(1).max(64),
});

export function parseOnboardingRecord(
  raw: string | null | undefined,
): OnboardingRecord | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const result = onboardingRecordSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function serializeOnboardingRecord(record: OnboardingRecord): string {
  return JSON.stringify({
    status: record.status,
    completedAt: record.completedAt,
  });
}

export function createOnboardingRecord(
  status: OnboardingStatus,
  now = new Date(),
): OnboardingRecord {
  return {
    status,
    completedAt: now.toISOString(),
  };
}

/**
 * Auto-open the first-run wizard only for an empty fleet that has never
 * completed or skipped setup. E2E profiles (`YARK_E2E_USER_DATA`) never auto-show.
 */
export function shouldAutoShowSetupWizard(input: {
  record: OnboardingRecord | null;
  serverCount: number;
  e2eUserData?: string | null;
}): boolean {
  if ((input.e2eUserData ?? "").trim().length > 0) {
    return false;
  }
  if (input.record !== null) {
    return false;
  }
  return input.serverCount === 0;
}
