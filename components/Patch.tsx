"use client";

import type { Evidence, Finding } from "@/lib/types";
import { KIND_LABEL } from "@/lib/labels";


function summary(ev: Evidence): string {
  switch (ev.kind) {
    case "screenshot":
      return ev.ocrText;
    case "text":
      return ev.raw;
    case "link":
      return ev.url;
    case "phone":
      return ev.phone;
    case "bank-verify":
      return `[${ev.bank.name}] ${ev.confirmationSms}`;
    case "balance":
      return `₦${ev.balance.toLocaleString("en-US")}`;
  }
}

const SEV_BADGE: Record<Finding["severity"], string> = {
  info: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200",
  warn: "bg-suspicious/20 text-suspicious",
  danger: "bg-scam/20 text-scam",
};

export function Patch({
  ev,
  findings,
  onRemove,
}: {
  ev: Evidence;
  findings: Finding[];
  onRemove: (id: string) => void;
}) {
  const text = summary(ev);
  return (
    <article className="patch font-stitch">
      <header className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-seam">
          {KIND_LABEL[ev.kind]}
        </span>
        <button
          type="button"
          onClick={() => onRemove(ev.id)}
          aria-label="Remove this evidence patch"
          className="text-xs text-stone-500 underline hover:text-scam"
        >
          remove
        </button>
      </header>
      <p className="whitespace-pre-wrap break-words text-sm text-stone-800 dark:text-stone-200">
        {text.length > 320 ? text.slice(0, 320) + "…" : text}
      </p>
      {findings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {findings.map((f) => (
            <li
              key={f.evidenceId ?? f.id}
              className={`rounded px-2 py-1 text-xs ${SEV_BADGE[f.severity]}`}
            >
              {f.evidenceId && <code className="mr-1 font-semibold">{f.evidenceId}</code>}
              {f.message}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
