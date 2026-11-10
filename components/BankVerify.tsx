"use client";

import { useState } from "react";
import { BANKS } from "@/lib/banks";
import type { Evidence } from "@/lib/types";

export function BankVerify({ onAdd }: { onAdd: (ev: Evidence) => void }) {
  const [bankName, setBankName] = useState("");
  const [sms, setSms] = useState("");
  const bank = BANKS.find((b) => b.name === bankName);

  const add = () => {
    if (!bank || !sms.trim()) return;
    onAdd({
      id: crypto.randomUUID(),
      kind: "bank-verify",
      addedAt: Date.now(),
      bank,
      confirmationSms: sms.trim(),
    });
    setSms("");
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        A web app cannot read your SMS or run USSD for you. Pick your bank, dial
        its official code yourself, then paste the confirmation SMS back here as
        evidence.
      </p>
      <div className="space-y-2">
        <label htmlFor="bank-select" className="block text-sm font-medium">
          Your bank
        </label>
        <select
          id="bank-select"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          className="w-full rounded-lg border border-stone-300 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-900"
        >
          <option value="">Select a bank…</option>
          {BANKS.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
              {b.appOnly ? " (app only — no USSD)" : ` — ${b.ussd}`}
            </option>
          ))}
        </select>
      </div>

      {bank && !bank.appOnly && (
        <div className="rounded-lg bg-stone-100 p-3 text-sm dark:bg-stone-800">
          <p>
            Dial <span className="font-mono font-semibold">{bank.ussd}</span> on the
            phone linked to this account, follow the prompts, then paste the SMS you
            get back.
          </p>
          <a
            href={bank.tel}
            className="mt-2 inline-block rounded-lg bg-seam px-4 py-2 font-semibold text-white"
          >
            Open dialer with {bank.ussd}
          </a>
        </div>
      )}

      {bank && bank.appOnly && (
        <div className="rounded-lg bg-stone-100 p-3 text-sm dark:bg-stone-800">
          <p>
            {bank.name} is app-only — it has no outward USSD code. Verify this
            payment inside the {bank.name} app, then paste the confirmation message
            below.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="confirm-sms" className="block text-sm font-medium">
          Paste the confirmation message (include the sender, e.g. &quot;From: GTBank&quot;)
        </label>
        <textarea
          id="confirm-sms"
          value={sms}
          onChange={(e) => setSms(e.target.value)}
          rows={4}
          placeholder={"e.g.\nFrom: GTBank\nGTBank: N5,000 transfer to … was successful. Ref 123456"}
          className="w-full rounded-lg border border-stone-300 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-900"
        />
        <button
          type="button"
          onClick={add}
          disabled={!bank || !sms.trim()}
          className="rounded-lg bg-seam px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add bank verification as evidence
        </button>
      </div>
    </div>
  );
}
