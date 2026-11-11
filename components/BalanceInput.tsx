"use client";

import { useState } from "react";
import type { Evidence } from "@/lib/types";
import { parseAmount } from "@/lib/rules";

/**
 * The user types the balance they see in THEIR OWN bank app (or from a USSD
 * balance check). Compared with the balance printed in the alert: an equal
 * balance is an independent check; a different one is a red flag.
 */
export function BalanceInput({ onAdd }: { onAdd: (ev: Evidence) => void }) {
  const [value, setValue] = useState("");
  const amount = parseAmount(value.replace(/[₦N\s]/gi, ""));

  const add = () => {
    if (amount === undefined) return;
    onAdd({ id: crypto.randomUUID(), kind: "balance", addedAt: Date.now(), balance: amount });
    setValue("");
  };

  return (
    <div className="space-y-2">
      <label htmlFor="balance-amt" className="block text-sm font-medium">
        Enter the balance you see in your own bank app or by USSD (not from the alert)
      </label>
      <input
        id="balance-amt"
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. 120,500.00"
        className="w-full rounded-lg border border-stone-300 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-900"
      />
      <button
        type="button"
        onClick={add}
        disabled={amount === undefined}
        className="rounded-lg bg-seam px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Add my balance as evidence
      </button>
    </div>
  );
}
