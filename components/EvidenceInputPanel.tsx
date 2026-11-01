"use client";

import { useState } from "react";
import type { Evidence } from "@/lib/types";
import { ScreenshotCapture } from "./ScreenshotCapture";
import { TextPaste } from "./TextPaste";
import { LinkInput } from "./LinkInput";
import { PhoneInput } from "./PhoneInput";
import { BankVerify } from "./BankVerify";

const TABS = [
  { id: "screenshot", label: "Screenshot", Comp: ScreenshotCapture },
  { id: "text", label: "Text", Comp: TextPaste },
  { id: "link", label: "Link", Comp: LinkInput },
  { id: "phone", label: "Phone", Comp: PhoneInput },
  { id: "bank-verify", label: "Bank verify", Comp: BankVerify },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function EvidenceInputPanel({ onAdd }: { onAdd: (ev: Evidence) => void }) {
  const [active, setActive] = useState<TabId>("screenshot");
  const Active = TABS.find((t) => t.id === active)!.Comp;

  return (
    <section className="space-y-3" aria-label="Add evidence">
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              active === t.id
                ? "bg-seam text-white"
                : "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
        <Active onAdd={onAdd} />
      </div>
    </section>
  );
}
