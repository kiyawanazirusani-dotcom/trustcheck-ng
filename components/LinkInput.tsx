"use client";

import { useState } from "react";
import type { Evidence } from "@/lib/types";

export function LinkInput({ onAdd }: { onAdd: (ev: Evidence) => void }) {
  const [url, setUrl] = useState("");

  const add = () => {
    const value = url.trim();
    if (!value) return;
    onAdd({ id: crypto.randomUUID(), kind: "link", addedAt: Date.now(), url: value });
    setUrl("");
  };

  return (
    <div className="space-y-2">
      <label htmlFor="link-url" className="block text-sm font-medium">
        Paste the link you were asked to open or pay through
      </label>
      <input
        id="link-url"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        className="w-full rounded-lg border border-stone-300 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-900"
      />
      <button
        type="button"
        onClick={add}
        disabled={!url.trim()}
        className="rounded-lg bg-seam px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Add link as evidence
      </button>
    </div>
  );
}
