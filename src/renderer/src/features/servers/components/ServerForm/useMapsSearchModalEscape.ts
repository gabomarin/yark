import { useEffect } from "react";

type Step = "search" | "detail" | "confirm";

interface Options {
  opened: boolean;
  step: Step;
  onClose: () => void;
  onBack: () => void;
}

/** Escape closes on search; nested steps go back (desktop-style). */
export function useMapsSearchModalEscape(options: Options): void {
  const { opened, step, onClose, onBack } = options;

  useEffect(() => {
    if (!opened) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      if ((event.target as HTMLElement)?.getAttribute("data-mantine-stop-propagation") === "true") {
        return;
      }

      if (step === "search") {
        onClose();
        return;
      }

      event.preventDefault();
      onBack();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [opened, step, onClose, onBack]);
}
