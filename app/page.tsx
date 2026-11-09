"use client";

import { useCallback, useMemo, useState } from "react";
import type { Evidence } from "@/lib/types";
import { computeVerdict } from "@/lib/rules";
import { EvidenceInputPanel } from "@/components/EvidenceInputPanel";
import { PatchStitcher } from "@/components/PatchStitcher";
import { VerdictPanel } from "@/components/VerdictPanel";
import { ExplainPanel } from "@/components/ExplainPanel";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { buildExplainRequest } from "@/lib/gemini.client";

export default function Home() {
  const [evidence, setEvidence] = useState<Evidence[]>([]);

  const addEvidence = useCallback(
    (ev: Evidence) => setEvidence((prev) => [...prev, ev]),
    [],
  );
  const removeEvidence = useCallback(
    (id: string) => setEvidence((prev) => prev.filter((e) => e.id !== id)),
    [],
  );
  const reset = useCallback(() => setEvidence([]), []);

  // Recompute the stitched verdict on every evidence change (pure, offline).
  const verdict = useMemo(() => computeVerdict(evidence), [evidence]);
  const hasEvidence = evidence.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-16 pt-6 sm:pt-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          TrustCheck <span className="text-seam">NG</span>
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Got a “payment received” alert? Add what you have: screenshot, message,
          link, phone number. We stitch the pieces together and show you if
          they don&apos;t match.
        </p>
        <p className="text-xs text-stone-500">
          Private by default. Everything stays on your phone and works offline.
        </p>
      </header>

      <PrivacyNotice />

      <section aria-labelledby="add-heading" className="space-y-2">
        <h2 id="add-heading" className="text-lg font-semibold">
          1. Add evidence
        </h2>
        <EvidenceInputPanel onAdd={addEvidence} />
      </section>

      <section aria-labelledby="patches-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="patches-heading" className="text-lg font-semibold">
            2. Your stitched patches
            {hasEvidence && (
              <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                {evidence.length}
              </span>
            )}
          </h2>
          {hasEvidence && (
            <button
              type="button"
              onClick={reset}
              className="text-sm text-stone-500 underline hover:text-scam"
            >
              Start over
            </button>
          )}
        </div>
        <PatchStitcher
          evidence={evidence}
          pieceFindings={verdict.pieceFindings}
          onRemove={removeEvidence}
        />
      </section>

      <section aria-labelledby="verdict-heading" aria-live="polite" className="space-y-2">
        <h2 id="verdict-heading" className="text-lg font-semibold">
          3. Verdict
        </h2>
        {hasEvidence ? (
          <>
            <VerdictPanel verdict={verdict} />
            {/* Re-keyed on the payload so consent never carries over to a new verdict. */}
            <ExplainPanel
              key={JSON.stringify(buildExplainRequest(verdict))}
              verdict={verdict}
            />
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700">
            Your verdict appears here as soon as you add a piece of evidence.
          </p>
        )}
      </section>

      <footer className="text-center text-xs text-stone-500">
        Never share your PIN, OTP or BVN. A real bank alert is confirmed in your
        bank app or by USSD, not by a screenshot.
      </footer>
    </main>
  );
}
