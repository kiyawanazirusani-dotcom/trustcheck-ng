"use client";

import { useState, useSyncExternalStore } from "react";
import type { Verdict } from "@/lib/types";
import {
  buildExplainRequest,
  fetchExplanation,
  type ExplainResponse,
} from "@/lib/gemini.client";
import {
  getOnlineServerSnapshot,
  getOnlineSnapshot,
  subscribeOnline,
} from "@/lib/online";
import { TtsButton } from "@/components/TtsButton";

type Phase = "idle" | "consent" | "loading" | "done";

/**
 * Optional AI explanation. Nothing leaves the device until the user presses the
 * separate "Send" button in the consent gate, which previews the exact payload.
 * Consent is per request: it is never remembered, and the parent re-keys this
 * component whenever the verdict changes.
 */
export function ExplainPanel({ verdict }: { verdict: Verdict }) {
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineServerSnapshot);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ExplainResponse | null>(null);

  const payload = buildExplainRequest(verdict);

  async function send() {
    setPhase("loading");
    const res = await fetchExplanation(payload); // same object that was previewed
    setResult(res);
    setPhase("done");
  }

  return (
    <section aria-labelledby="explain-heading" className="space-y-3 rounded-xl border border-stone-300 p-4 dark:border-stone-700">
      <h3 id="explain-heading" className="font-semibold">
        Explain in English &amp; Hausa (optional)
      </h3>

      {!online && (
        <p role="status" className="text-sm text-suspicious">
          You are offline. The AI explanation needs internet. Your verdict above still works.
        </p>
      )}

      {phase === "idle" && (
        <button
          type="button"
          disabled={!online}
          onClick={() => setPhase("consent")}
          className="rounded-lg bg-seam px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Explain with AI
        </button>
      )}

      {phase === "consent" && (
        <div role="group" aria-label="Consent to send data" className="space-y-3">
          <p className="text-sm">
            If you continue, the text below will be sent to <strong>Google Gemini</strong> (through
            our server) to write the explanation. Your screenshot and raw messages are not sent.
            You can cancel and keep the offline verdict.
          </p>
          <pre
            aria-label="Exact data that will be sent"
            className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-3 text-xs dark:bg-stone-800"
          >
            {JSON.stringify(payload, null, 2)}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={send}
              disabled={!online}
              className="rounded-lg bg-seam px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send to Google Gemini
            </button>
            <button
              type="button"
              onClick={() => setPhase("idle")}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm dark:border-stone-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === "loading" && (
        <p role="status" className="text-sm text-stone-500">
          Asking Gemini…
        </p>
      )}

      {phase === "done" && result && (
        <div className="space-y-4">
          {result.error && (
            <p role="alert" className="text-sm text-scam">
              {result.error} Your offline verdict is unaffected.
            </p>
          )}
          {result.en && (
            <div lang="en">
              <h4 className="text-sm font-semibold">English</h4>
              <p className="text-sm">{result.en}</p>
              <TtsButton text={result.en} lang="en" label="Listen (English)" />
            </div>
          )}
          {result.ha && (
            <div lang="ha">
              <h4 className="text-sm font-semibold">Hausa</h4>
              <p className="text-sm">{result.ha}</p>
              <TtsButton text={result.ha} lang="ha" label="Saurara (Hausa)" />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setPhase("idle");
            }}
            className="text-sm underline"
          >
            Done
          </button>
        </div>
      )}
    </section>
  );
}
