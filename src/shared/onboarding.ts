import { z } from "zod";

/** SQLite `app_settings.key` for first-run setup wizard completion. Independent of telemetry prefs. */
export const ONBOARDING_SETTING_KEY = "onboarding.v1";

export type OnboardingStatus = "completed" | "skipped";

export type OnboardingPendingCluster = {
  clusterId: string;
  clusterDir: string;
};

export type OnboardingRecord = {
  status: OnboardingStatus;
  completedAt: string;
  pendingCluster?: OnboardingPendingCluster;
};

export const onboardingRecordSchema = z.object({
  status: z.enum(["completed", "skipped"]),
  completedAt: z.string().min(1).max(64),
  pendingCluster: z
    .object({
      clusterId: z.string().min(1).max(128),
      clusterDir: z.string().min(1).max(4_096),
    })
    .optional(),
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
    ...(record.pendingCluster === undefined
      ? {}
      : { pendingCluster: record.pendingCluster }),
  });
}

export function createOnboardingRecord(
  status: OnboardingStatus,
  now = new Date(),
  pendingCluster?: OnboardingPendingCluster | null,
): OnboardingRecord {
  return {
    status,
    completedAt: now.toISOString(),
    ...(pendingCluster == null ? {} : { pendingCluster }),
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
