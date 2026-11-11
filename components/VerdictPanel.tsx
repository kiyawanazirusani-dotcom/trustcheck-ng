"use client";

import type { Finding, RiskLevel, Verdict } from "@/lib/types";
import { RISK_LABEL_EN, VERDICT_LABEL_EN, VERDICT_LABEL_HA } from "@/lib/labels";

const LEVEL_META: Record<Verdict["level"], { icon: string; badge: string; text: string }> = {
  // Green is reserved for VERIFIED: an independent check passed.
  VERIFIED: { icon: "✓", badge: "bg-clean", text: "text-clean" },
  // Neutral grey on purpose: UNVERIFIED must never look green.
  UNVERIFIED: { icon: "?", badge: "bg-stone-500", text: "text-stone-500" },
  SUSPICIOUS: { icon: "!", badge: "bg-suspicious", text: "text-suspicious" },
  LIKELY_FAKE: { icon: "✕", badge: "bg-scam", text: "text-scam" },
};

const RISK_BADGE: Record<RiskLevel, string> = {
  LOW: "bg-clean/15 text-clean",
  MODERATE: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200",
  HIGH: "bg-suspicious/20 text-suspicious",
  CRITICAL: "bg-scam/20 text-scam",
};

const SEV_DOT: Record<Finding["severity"], string> = {
  info: "bg-stone-400",
  warn: "bg-suspicious",
  danger: "bg-scam",
};

function EvId({ id }: { id?: string }) {
  if (!id) return null;
  return (
    <code className="mr-1.5 rounded bg-stone-200 px-1 py-0.5 text-[10px] font-semibold text-stone-700 dark:bg-stone-700 dark:text-stone-200">
      {id}
    </code>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="mb-1 text-sm font-semibold">{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function VerdictPanel({ verdict }: { verdict: Verdict }) {
  const meta = LEVEL_META[verdict.level];
  const label = VERDICT_LABEL_EN[verdict.level];
  const { report } = verdict;
  const flagged = verdict.findings.filter((f) => f.severity !== "info");

  return (
    <section aria-label="Verdict" className="rounded-xl border-2 border-seam p-4">
      <div className="flex items-center gap-3">
        <span
          aria-label={`Verdict: ${label}`}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${meta.badge}`}
        >
          {meta.icon}
        </span>
        <div>
          <p className={`text-lg font-bold ${meta.text}`}>{label}</p>
          <p className="text-xs">
            Risk level:{" "}
            <span className={`rounded px-1.5 py-0.5 font-semibold ${RISK_BADGE[verdict.risk]}`}>
              {RISK_LABEL_EN[verdict.risk]}
            </span>
          </p>
        </div>
      </div>
      <p lang="ha" className="mt-2 text-sm font-medium">
        {VERDICT_LABEL_HA[verdict.level]}
      </p>

      <div className="mt-4">
        <h4 className="mb-1 text-sm font-semibold">How we reached this verdict</h4>
        <p className="text-sm">{verdict.explanation}</p>
      </div>

      {flagged.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-sm font-semibold text-seam">Findings</h4>
          <ul className="space-y-1">
            {flagged.map((f, i) => (
              <li key={`${f.evidenceId}-${i}`} className="flex gap-2 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[f.severity]}`} />
                <span>
                  <EvId id={f.evidenceId} />
                  {f.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {verdict.checks.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-sm font-semibold text-clean">Checks passed</h4>
          <ul className="space-y-1">
            {verdict.checks.map((c, i) => (
              <li key={`${c.id}-${i}`} className="flex gap-2 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-clean" />
                <span>
                  <EvId id={c.evidenceId} />
                  {c.message}
                  {c.independent ? " (independent check)" : " (supporting only)"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-4 rounded-lg border border-stone-300 p-3 dark:border-stone-700" open>
        <summary className="cursor-pointer text-sm font-semibold">Full report</summary>

        <p className="mt-2 text-xs text-stone-500">
          Generated: <time dateTime={report.generatedAtIso}>{report.generatedAtIso}</time>
        </p>

        <Section
          title="Evidence examined"
          items={report.evidenceExamined.map((e) => `${e.label} (${e.id.slice(0, 8)})`)}
        />
        <Section title="Methods used" items={report.methods} />

        {report.contradictions.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-1 text-sm font-semibold text-scam">Contradictions</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {report.contradictions.map((c, i) => (
                <li key={`${c.evidenceId}-${i}`}>
                  <EvId id={c.evidenceId} />
                  {c.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Section title="Missing information" items={report.missingInformation} />
        <Section title="Limitations" items={report.limitations} />
        <Section title="Recommended actions" items={report.recommendedActions} />
      </details>
    </section>
  );
}
