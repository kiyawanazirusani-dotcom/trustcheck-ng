// Nigerian bank catalog for guided verification.
// USSD codes verified against 2026 references (see README / spec). Codes can
// change; the UI reminds the user to confirm with their bank.

import type { BankCode } from "./types";

/** Encode a USSD string into a tel: link (`#` -> %23, `*` left literal). */
export function encodeTel(ussd: string): string {
  return "tel:" + ussd.replace(/#/g, "%23");
}

interface RawBank {
  name: string;
  ussd: string;
  aliases: string[];
  appOnly?: boolean;
}

// Ordered: user-named banks first, then common extras. Kuda is app-only.
const RAW_BANKS: RawBank[] = [
  { name: "GTBank", ussd: "*737#", aliases: ["gtbank", "gtb", "guaranty trust", "guaranty trust bank"] },
  { name: "Access Bank", ussd: "*901#", aliases: ["access bank", "access"] },
  { name: "Zenith Bank", ussd: "*966#", aliases: ["zenith bank", "zenith"] },
  { name: "UBA", ussd: "*919#", aliases: ["uba", "united bank for africa"] },
  { name: "FirstBank", ussd: "*894#", aliases: ["first bank", "firstbank", "first bank of nigeria"] },
  { name: "Sterling Bank", ussd: "*822#", aliases: ["sterling bank", "sterling"] },
  { name: "FCMB", ussd: "*329#", aliases: ["fcmb", "first city monument bank", "first city monument"] },
  { name: "Union Bank", ussd: "*826#", aliases: ["union bank", "union bank of nigeria"] },
  { name: "Wema Bank", ussd: "*945#", aliases: ["wema bank", "wema", "alat"] },
  { name: "OPay", ussd: "*955#", aliases: ["opay", "paycom"] },
  { name: "Moniepoint", ussd: "*5573#", aliases: ["moniepoint"] },
  { name: "PalmPay", ussd: "*861#", aliases: ["palmpay", "palm pay"] },
  { name: "Fidelity Bank", ussd: "*770#", aliases: ["fidelity bank", "fidelity"] },
  { name: "Kuda", ussd: "", aliases: ["kuda", "kuda bank"], appOnly: true },
];

export const BANKS: BankCode[] = RAW_BANKS.map((b) => ({
  name: b.name,
  ussd: b.ussd,
  tel: b.appOnly ? "" : encodeTel(b.ussd),
  aliases: b.aliases,
  appOnly: b.appOnly,
}));

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the most likely bank mentioned in free text (OCR / pasted message /
 * confirmation SMS). Matches aliases as whole tokens to avoid substrings.
 * Returns the first bank whose alias appears, or undefined.
 */
export function findBankByText(text: string): BankCode | undefined {
  const t = ` ${text.toLowerCase()} `;
  for (const bank of BANKS) {
    for (const alias of bank.aliases) {
      const re = new RegExp(
        `(?:^|[^a-z0-9])${escapeRegex(alias.toLowerCase())}(?:$|[^a-z0-9])`,
      );
      if (re.test(t)) return bank;
    }
  }
  return undefined;
}

/** Resolve a bank by its display name (used by the verification picker). */
export function findBankByName(name: string): BankCode | undefined {
  const n = name.toLowerCase();
  return BANKS.find(
    (b) => b.name.toLowerCase() === n || b.aliases.includes(n),
  );
}
