import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { APP_VERSION } from "@shared/app-version";
import { shouldShowWhatsNewForVersion } from "@shared/changelog";
import {
  createOnboardingRecord,
  shouldAutoShowSetupWizard,
  type OnboardingRecord,
} from "@shared/onboarding";
import {
  type PendingSetupCluster,
  type SetupWizardMode,
} from "@features/setup-wizard/setupWizardModel";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useRef, useState } from "react";

export function useAppOnboarding(options: {
  overviewLoading: boolean;
  serverCount: number;
}) {
  const { overviewLoading, serverCount } = options;
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogInitialTab, setChangelogInitialTab] = useState<"current" | "recent">(
    "current",
  );
  const changelogPromptSettledRef = useRef(false);
  const [setupWizardMode, setSetupWizardMode] = useState<SetupWizardMode | null>(null);
  const [setupWizardBusy, setSetupWizardBusy] = useState(false);
  const [pendingSetupCluster, setPendingSetupCluster] =
    useState<PendingSetupCluster | null>(null);
  const setupWizardPromptSettledRef = useRef(false);
  const setupWizardBusyRef = useRef(false);
  const onboardingRecordRef = useRef<OnboardingRecord | null>(null);
  const retryOnboardingReadRef = useRef<(() => void) | null>(null);

  const persistOnboardingStatus = useCallback(
    async (
      status: "completed" | "skipped",
      cluster: PendingSetupCluster | null,
    ): Promise<boolean> => {
      if (typeof window.api.setOnboarding !== "function") {
        showOperatorError("Onboarding settings are unavailable. Try restarting YARK.");
        return false;
      }
      const record = createOnboardingRecord(status, new Date(), cluster);
      try {
        const result = await window.api.setOnboarding(record);
        if (!result.ok) {
          showOperatorError(result.error ?? "Could not save setup progress");
          return false;
        }
        onboardingRecordRef.current = result.data ?? record;
        return true;
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        showOperatorError(detail, "Could not save setup progress");
        return false;
      }
    },
    [],
  );

  const closeSetupWizard = useCallback(() => {
    setSetupWizardMode(null);
  }, []);

  const finishSetupWizard = useCallback(
    async (
      status: "completed" | "skipped",
      cluster: PendingSetupCluster | null,
    ): Promise<boolean> => {
      if (setupWizardBusyRef.current) {
        return false;
      }
      setupWizardBusyRef.current = true;
      setSetupWizardBusy(true);
      return runWithFinally(async () => {
        const saved = await persistOnboardingStatus(status, cluster);
        if (!saved) {
          return false;
        }
        setPendingSetupCluster(cluster);
        closeSetupWizard();
        return true;
      }, () => {
        setupWizardBusyRef.current = false;
        setSetupWizardBusy(false);
      });
    },
    [closeSetupWizard, persistOnboardingStatus],
  );

  const consumePendingSetupCluster = useCallback(() => {
    setPendingSetupCluster(null);
    const current = onboardingRecordRef.current;
    if (current?.pendingCluster === undefined || typeof window.api.setOnboarding !== "function") {
      return;
    }
    const { pendingCluster: _pendingCluster, ...next } = current;
    void (async () => {
      try {
        const result = await window.api.setOnboarding(next);
        if (result.ok) {
          onboardingRecordRef.current = result.data ?? next;
        }
      } catch {
        // The created/imported server now owns the cluster; fleet dedupe prevents a duplicate option.
      }
    })();
  }, []);

  const markChangelogSeen = useCallback(() => {
    changelogPromptSettledRef.current = true;
    void window.api.setLastSeenChangelogVersion(APP_VERSION);
  }, []);

  const openWhatsNew = useCallback((tab: "current" | "recent" = "current") => {
    changelogPromptSettledRef.current = true;
    setChangelogInitialTab(tab);
    setChangelogOpen(true);
  }, []);

  const onWhatsNewClick = useCallback(() => {
    openWhatsNew("current");
  }, [openWhatsNew]);

  useEffect(() => {
    if (overviewLoading) {
      return;
    }
    let cancelled = false;

    const loadOnboardingAndMaybeOpen = async (): Promise<boolean> => {
      if (
        typeof window.api.getOnboarding !== "function" ||
        setupWizardPromptSettledRef.current
      ) {
        return false;
      }
      let onboardingRes: Awaited<ReturnType<typeof window.api.getOnboarding>>;
      try {
        onboardingRes = await window.api.getOnboarding();
      } catch (error: unknown) {
        onboardingRes = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (cancelled) {
        return true;
      }
      if (!onboardingRes.ok) {
        showOperatorToast({
          id: "onboarding-load-failed",
          title: "Could not load setup status",
          message: `${onboardingRes.error ?? "Setup progress could not be read."} Click this message to retry.`,
          color: "red",
          autoClose: false,
          onClick: () => {
            retryOnboardingReadRef.current?.();
          },
        });
        return false;
      }
      notifications.hide("onboarding-load-failed");
      const record = onboardingRes.data;
      onboardingRecordRef.current = record;
      setPendingSetupCluster(record?.pendingCluster ?? null);
      setupWizardPromptSettledRef.current = true;
      if (
        shouldAutoShowSetupWizard({
          record,
          serverCount,
          readOk: true,
        })
      ) {
        changelogPromptSettledRef.current = true;
        setSetupWizardMode("first-run");
        return true;
      }
      return false;
    };

    retryOnboardingReadRef.current = () => {
      void loadOnboardingAndMaybeOpen();
    };

    void (async () => {
      const openedWizard = await loadOnboardingAndMaybeOpen();
      if (openedWizard || cancelled) {
        return;
      }
      if (typeof window.api.getLastSeenChangelogVersion !== "function") {
        return;
      }
      const result = await window.api.getLastSeenChangelogVersion();
      if (cancelled || !result.ok || changelogPromptSettledRef.current) {
        return;
      }
      if (!shouldShowWhatsNewForVersion(APP_VERSION, result.data)) {
        return;
      }
      const latest = await window.api.getLastSeenChangelogVersion();
      if (cancelled || !latest.ok || changelogPromptSettledRef.current) {
        return;
      }
      if (!shouldShowWhatsNewForVersion(APP_VERSION, latest.data)) {
        return;
      }
      changelogPromptSettledRef.current = true;
      setChangelogInitialTab("current");
      setChangelogOpen(true);
    })();
    return () => {
      cancelled = true;
      retryOnboardingReadRef.current = null;
    };
  }, [overviewLoading, serverCount]);

  const onRunSetupAgain = useCallback(() => {
    if (serverCount === 0) {
      void (async () => {
        if (typeof window.api.setOnboarding !== "function") {
          showOperatorError("Onboarding settings are unavailable. Try restarting YARK.");
          return;
        }
        try {
          const result = await window.api.setOnboarding(null);
          if (!result.ok) {
            showOperatorError(result.error ?? "Could not reset setup progress");
            return;
          }
          onboardingRecordRef.current = null;
          setPendingSetupCluster(null);
          setupWizardPromptSettledRef.current = true;
          setSetupWizardMode("first-run");
        } catch (error: unknown) {
          const detail = error instanceof Error ? error.message : String(error);
          showOperatorError(detail, "Could not reset setup progress");
        }
      })();
      return;
    }
    setSetupWizardMode("paths-shell");
  }, [serverCount]);

  return {
    changelogOpen,
    setChangelogOpen,
    changelogInitialTab,
    markChangelogSeen,
    onWhatsNewClick,
    setupWizardMode,
    setupWizardBusy,
    pendingSetupCluster,
    closeSetupWizard,
    finishSetupWizard,
    consumePendingSetupCluster,
    onRunSetupAgain,
  };
}
