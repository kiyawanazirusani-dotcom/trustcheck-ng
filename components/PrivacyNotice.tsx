"use client";

import { useState } from "react";

/**
 * Privacy notice. Shown open at the start of each session (no storage is used
 * to remember dismissal, in line with the "nothing stored" promise) and always
 * reachable again through the "Privacy" button.
 */
export function PrivacyNotice() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs text-stone-500 underline"
      >
        Privacy
      </button>
    );
  }

  return (
    <section
      aria-labelledby="privacy-heading"
      className="rounded-xl border border-stone-300 bg-stone-50 p-4 text-sm dark:border-stone-700 dark:bg-stone-900"
    >
      <h2 id="privacy-heading" className="font-semibold">
        Your privacy
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Your evidence stays in memory on this phone and is gone when you close or reload the page.</li>
        <li>Screenshots are read on your device (OCR). They are never uploaded.</li>
        <li>The verdict works offline and sends nothing anywhere.</li>
        <li>
          Only if you press &quot;Explain with AI&quot; and then confirm, a short summary of the verdict and
          its reasons is sent to Google Gemini. You see the exact text first and can cancel.
        </li>
        <li>We do not store your data or track what you check.</li>
      </ul>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-3 rounded-lg bg-seam px-4 py-2 text-sm font-semibold text-white"
      >
        Got it
      </button>
    </section>
  );
}
