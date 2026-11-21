/**
 * Fetch installer-only download count from the release-downloads Worker
 * and reveal the home strip when a number is available.
 * Runbook: docs/release-downloads.md
 */
const DOWNLOAD_COUNT_FORMAT = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

export function initReleaseDownloads(): void {
  const root = document.querySelector<HTMLElement>("[data-release-downloads]");
  if (!root) return;

  const url = root.dataset.url?.trim();
  const countEl = root.querySelector<HTMLElement>("[data-release-downloads-count]");
  if (!url || !countEl) return;

  void (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object") return;
      const downloads = (payload as { downloads?: unknown }).downloads;
      if (typeof downloads !== "number" || !Number.isFinite(downloads) || downloads < 0) {
        return;
      }
      countEl.textContent = DOWNLOAD_COUNT_FORMAT.format(downloads);
      root.hidden = false;
    } catch {
      // Keep the strip hidden; do not invent a number.
    }
  })();
}
