"use client";

import type { Finding, Verdict } from "@/lib/types";

const LEVEL_META: Record<
  Verdict["level"],
  { label: string; icon: string; badge: string; bar: string; text: string }
> = {
  clean: { label: "Clean", icon: "✓", badge: "bg-clean", bar: "bg-clean", text: "text-clean" },
  // Neutral grey on purpose: "cannot verify" must never look green.
  unverifiable: { label: "Cannot verify", icon: "?", badge: "bg-stone-500", bar: "bg-stone-400", text: "text-stone-500" },
  suspicious: { label: "Suspicious", icon: "!", badge: "bg-suspicious", bar: "bg-suspicious", text: "text-suspicious" },
  scam: { label: "Likely scam", icon: "✕", badge: "bg-scam", bar: "bg-scam", text: "text-scam" },
};

const SEV_DOT: Record<Finding["severity"], string> = {
  info: "bg-stone-400",
  warn: "bg-suspicious",
  danger: "bg-scam",
};

export function VerdictPanel({ verdict }: { verdict: Verdict }) {
  const meta = LEVEL_META[verdict.level];
  const seams = verdict.pieceFindings["__cross__"] ?? [];
  const pieceFlagCount = verdict.findings.filter((f) => f.severity !== "info" && !seams.includes(f)).length;
  const redFlagCount = verdict.findings.filter((f) => f.severity !== "info").length;
  const unverifiable = verdict.level === "unverifiable";

  return (
    <section
      aria-label="Verdict"
      className="rounded-xl border-2 border-seam p-4"
    >
      <div className="flex items-center gap-3">
        <span
          aria-label={`Verdict: ${meta.label}`}
          className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white ${meta.badge}`}
        >
          {meta.icon}
        </span>
        <div>
          <p className="text-lg font-bold">{meta.label}</p>
          <p className="text-xs text-stone-500">
            {unverifiable
              ? "Not enough checkable evidence to say either way"
              : `${Math.round(verdict.confidence * 100)}% confidence it's a scam`}
          </p>
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
        <div
          className={`h-full ${meta.bar}`}
          style={{ width: `${unverifiable ? 100 : Math.round(verdict.confidence * 100)}%` }}
        />
      </div>

      {seams.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-sm font-semibold text-seam">
            The seams don&apos;t line up
          </p>
          <ul className="space-y-1">
            {seams.map((f, i) => (
              <li key={`${f.id}-${i}`} className="flex gap-2 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[f.severity]}`} />
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {seams.length === 0 && pieceFlagCount > 0 && (
        <p className="mt-4 text-sm text-stone-500">
          Red flags are on individual pieces — see each patch above.
        </p>
      )}

      {verdict.checks.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-sm font-semibold text-clean">Checks passed</p>
          <ul className="space-y-1">
            {verdict.checks.map((c, i) => (
              <li key={`${c.id}-${i}`} className="flex gap-2 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-clean" />
                <span>{c.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unverifiable && (
        <p className="mt-4 text-sm text-stone-500">
          No red flags, but nothing here could be checked either. Add a payment
          alert, a message, a link or a bank confirmation so the pieces can be
          compared.
        </p>
      )}

      {redFlagCount === 0 && verdict.level === "clean" && (
        <p className="mt-4 text-sm text-clean">
          No red flags found across your evidence.
        </p>
      )}
    </section>
  );
}
