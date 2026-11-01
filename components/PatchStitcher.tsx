"use client";

import { Fragment } from "react";
import type { Evidence, Finding } from "@/lib/types";
import { Patch } from "./Patch";

function Seam() {
  // A visible "stitch" between patches — the Frankenstein motif.
  return (
    <div aria-hidden className="my-2 flex items-center justify-center text-seam">
      <span className="h-px w-10 border-t-2 border-dashed border-seam" />
      <span className="mx-1 text-xs">✛</span>
      <span className="h-px w-10 border-t-2 border-dashed border-seam" />
    </div>
  );
}

export function PatchStitcher({
  evidence,
  pieceFindings,
  onRemove,
}: {
  evidence: Evidence[];
  pieceFindings: Record<string, Finding[]>;
  onRemove: (id: string) => void;
}) {
  if (evidence.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700">
        No evidence yet. Add a screenshot, message, link, phone number, or bank
        verification above to start stitching a verdict.
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {evidence.map((ev, i) => (
        <Fragment key={ev.id}>
          {i > 0 && <Seam />}
          <Patch ev={ev} findings={pieceFindings[ev.id] ?? []} onRemove={onRemove} />
        </Fragment>
      ))}
    </div>
  );
}
