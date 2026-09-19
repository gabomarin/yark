import {
  Badge,
  Button,
  Group,
  NumberInput,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { CRASH_RECOVERY_LIMITS } from "@shared/crash-recovery/crash-recovery-policy";
import type { CrashRecoveryPolicy } from "@shared/types";
import { useCrashRecoveryPanel } from "@features/crash-recovery/hooks/useCrashRecoveryPanel";
import { type ReactElement, useState } from "react";
import classes from "../../MaintenancePanel.module.css";

function Chevron({ open }: { open: boolean }): ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={`${classes.chevron}${open ? ` ${classes.chevronOpen}` : ""}`}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function recoveryState(policy: CrashRecoveryPolicy): {
  label: string;
  color: string;
  summary: string;
} {
  if (!policy.enabled) {
    return { label: "Off", color: "gray", summary: "Off" };
  }
  if (policy.exhausted) {
    return {
      label: "Exhausted",
      color: "red",
      summary: `Recovery stopped after ${policy.maxAttempts} attempts`,
    };
  }
  if (policy.paused) {
    return { label: "Paused", color: "attention", summary: "Paused by you" };
  }
  if (policy.attempts > 0) {
    return {
      label: `${policy.attempts} of ${policy.maxAttempts}`,
      color: "attention",
      summary: `${policy.attempts} of ${policy.maxAttempts} attempts used`,
    };
  }
  return {
    label: "Armed",
    color: "gray",
    summary: `Armed · up to ${policy.maxAttempts} automatic restarts`,
  };
}

/**
 * Crash recovery policy block (#563) rendered with the other Maintenance slabs.
 * Default off; only restarts after a real unexpected exit.
 */
export function CrashRecoverySection({
  serverId,
}: {
  serverId: string;
}): ReactElement {
  const panel = useCrashRecoveryPanel(serverId);
  const policy = panel.policy;
  const [open, setOpen] = useState(false);
  const state = policy !== null ? recoveryState(policy) : null;
  const controlsDisabled = panel.busy || policy?.enabled !== true;

  return (
    <section className={classes.slab} style={{ marginTop: -1 }} data-crash-recovery-section>
      <div className={classes.slabHeader}>
        <button
          type="button"
          className={classes.slabHeaderToggle}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <Chevron open={open} />
            <div>
              <Text size="sm" fw={600}>
                Crash recovery
              </Text>
              <Text size="xs" c="dimmed">
                {state?.summary ?? "Loading…"}
              </Text>
            </div>
          </Group>
        </button>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {policy?.enabled === true ? "On" : "Off"}
          </Text>
          <Switch
            size="sm"
            checked={policy?.enabled === true}
            disabled={panel.busy || policy === null}
            aria-label="Enable crash recovery"
            onChange={(e) => {
              const on = e.currentTarget.checked;
              void panel.patch({ enabled: on }).then((ok) => {
                if (ok && on) setOpen(true);
              });
            }}
          />
        </Group>
      </div>

      {open && (
        <div className={classes.slabBody}>
          <Stack gap="sm">
            {panel.error !== null && (
              <Text size="xs" c="red">
                {panel.error}
              </Text>
            )}

            {policy !== null && (
              <>
                <Group gap="xs">
                  <Badge color={state?.color} variant="light">
                    {state?.label}
                  </Badge>
                  <Text size="xs" c="dimmed">
                    Attempts used: {policy.attempts} of {policy.maxAttempts}
                  </Text>
                </Group>

                <Text size="xs" c="dimmed">
                  After an unexpected crash, YARK retries the server up to the
                  configured limit. The counter resets after a stable run. Normal
                  stops, manual restarts, maintenance windows, and disabled
                  servers are excluded.
                </Text>

                <NumberInput
                  label="Restart attempts"
                  description="Maximum number of automatic restart attempts."
                  size="xs"
                  min={CRASH_RECOVERY_LIMITS.minAttempts}
                  max={CRASH_RECOVERY_LIMITS.maxAttempts}
                  clampBehavior="strict"
                  value={policy.maxAttempts}
                  disabled={controlsDisabled}
                  onChange={(value) => {
                    if (typeof value === "number") {
                      void panel.patch({ maxAttempts: value });
                    }
                  }}
                />
                <NumberInput
                  label="Delay before retry (seconds)"
                  description="Increases after each failed attempt (30s, 60s, 90s…)."
                  size="xs"
                  min={CRASH_RECOVERY_LIMITS.minBackoffSeconds}
                  max={CRASH_RECOVERY_LIMITS.maxBackoffSeconds}
                  clampBehavior="strict"
                  value={policy.backoffSeconds}
                  disabled={controlsDisabled}
                  onChange={(value) => {
                    if (typeof value === "number") {
                      void panel.patch({ backoffSeconds: value });
                    }
                  }}
                />
                <NumberInput
                  label="Reset attempts after (minutes of uptime)"
                  description="Once the server has been running this long, the attempt count starts over. Time while stopped does not count."
                  size="xs"
                  min={CRASH_RECOVERY_LIMITS.minStabilitySeconds / 60}
                  max={CRASH_RECOVERY_LIMITS.maxStabilitySeconds / 60}
                  clampBehavior="strict"
                  value={Math.max(1, Math.round(policy.stabilitySeconds / 60))}
                  disabled={controlsDisabled}
                  onChange={(value) => {
                    if (typeof value === "number") {
                      void panel.patch({ stabilitySeconds: value * 60 });
                    }
                  }}
                />

                {policy.lastFailureReason !== null && (
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    Last failure: {policy.lastFailureReason}
                  </Text>
                )}

                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    disabled={panel.busy || policy.attempts === 0 || policy.paused}
                    onClick={() => void panel.resetAttempts()}
                  >
                    Reset attempts
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color={policy.paused ? "blue" : "attention"}
                    disabled={panel.busy || !policy.enabled}
                    onClick={() => void panel.patch({ paused: !policy.paused })}
                  >
                    {policy.paused ? "Resume auto-restart" : "Pause auto-restart"}
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </div>
      )}
    </section>
  );
}
