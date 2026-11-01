"use client";

import { useState } from "react";
import type { Evidence } from "@/lib/types";

export function PhoneInput({ onAdd }: { onAdd: (ev: Evidence) => void }) {
  const [phone, setPhone] = useState("");

  const add = () => {
    const value = phone.trim();
    if (!value) return;
    onAdd({ id: crypto.randomUUID(), kind: "phone", addedAt: Date.now(), phone: value });
    setPhone("");
  };

  return (
    <div className="space-y-2">
      <label htmlFor="phone-num" className="block text-sm font-medium">
        Enter the phone number you were given or asked to call
      </label>
      <input
        id="phone-num"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="e.g. 0803 123 4567"
        className="w-full rounded-lg border border-stone-300 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-900"
      />
      <button
        type="button"
        onClick={add}
        disabled={!phone.trim()}
        className="rounded-lg bg-seam px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Add phone number as evidence
      </button>
    </div>
  );
}
