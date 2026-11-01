"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

// During SSR (and the initial client hydration) assume online so the banner
// is not rendered — avoiding a hydration mismatch.
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Shows an offline banner when the device has no network. The verdict and OCR
 * still work offline; only the optional AI explanation needs the internet.
 */
export function OfflineIndicator() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 bg-suspicious/95 px-4 py-2 text-center text-sm font-medium text-white"
    >
      Offline — verdict &amp; OCR still work. The AI explanation needs internet.
    </div>
  );
}
