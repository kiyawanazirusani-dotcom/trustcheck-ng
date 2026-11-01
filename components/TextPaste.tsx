"use client";

import { useState } from "react";
import type { Evidence } from "@/lib/types";

export function TextPaste({ onAdd }: { onAdd: (ev: Evidence) => void }) {
  const [raw, setRaw] = useState("");

  const add = () => {
    const value = raw.trim();
    if (!value) return;
    onAdd({ id: crypto.randomUUID(), kind: "text", addedAt: Date.now(), raw: value });
    setRaw("");
  };

  return (
    <div className="space-y-2">
      <label htmlFor="paste-text" className="block text-sm font-medium">
        Paste the SMS or WhatsApp message
      </label>
      <textarea
        id="paste-text"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={5}
        placeholder="e.g. From: ALERT — You have received N5,000 from GTBank…"
        className="w-full rounded-lg border border-stone-300 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-900"
      />
      <button
        type="button"
        onClick={add}
        disabled={!raw.trim()}
        className="rounded-lg bg-seam px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Add text as evidence
      </button>
    </div>
  );
}
