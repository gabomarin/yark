import { useCallback, useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "@ui/copyToClipboard";
import { buildOpenCommand } from "./components/JoinInfoModal/joinInfoModel";

/**
 * Public IP for the workspace join surface (#505): the header's `open IP:port`
 * command and the Share connection details dialog.
 *
 * Refresh the IP when the selected server starts running. The dialog shares this
 * lookup and can refresh it on demand.
 */
export function useWorkspaceJoinInfo(isServerRunning: boolean): {
  publicIp: string;
  refreshPublicIp: () => Promise<boolean>;
  joinCommandFor: (gamePort: number) => string | null;
  copyJoinCommandFor: (gamePort: number) => void;
  copySessionName: (sessionName: string) => void;
} {
  const [publicIp, setPublicIpState] = useState("");
  const wasRunningRef = useRef(false);
  const requestIdRef = useRef(0);
  const lookupRef = useRef<Promise<boolean> | null>(null);

  const refreshPublicIp = useCallback((force = false): Promise<boolean> => {
    if (!force && lookupRef.current !== null) return lookupRef.current;

    const requestId = ++requestIdRef.current;
    const lookup = window.api
      .getPublicIp()
      .then((result) => {
        if (requestId !== requestIdRef.current || !result.ok) return false;
        setPublicIpState(result.data);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        if (lookupRef.current === lookup) lookupRef.current = null;
      });
    lookupRef.current = lookup;
    return lookup;
  }, []);

  useEffect(() => {
    if (!isServerRunning) {
      if (wasRunningRef.current) {
        requestIdRef.current += 1;
        lookupRef.current = null;
      }
      wasRunningRef.current = false;
      return;
    }
    if (wasRunningRef.current) return;
    wasRunningRef.current = true;
    void refreshPublicIp(true);
  }, [isServerRunning, refreshPublicIp]);

  const joinCommandFor = useCallback((gamePort: number) => buildOpenCommand(publicIp, gamePort), [publicIp]);
  const copyJoinCommandFor = useCallback(
    (gamePort: number) => {
      const command = joinCommandFor(gamePort);
      if (command !== null) {
        void copyTextToClipboard({ text: command, notifySuccess: true, successMessage: "In-game command copied" });
      }
    },
    [joinCommandFor],
  );
  const copySessionName = useCallback((sessionName: string) => {
    void copyTextToClipboard({ text: sessionName, notifySuccess: true, successMessage: "Session name copied" });
  }, []);

  return { publicIp, refreshPublicIp, joinCommandFor, copyJoinCommandFor, copySessionName };
}
