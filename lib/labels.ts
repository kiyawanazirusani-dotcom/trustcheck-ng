// Display labels for verdicts and risk levels (pure data, no side effects).

import type { EvidenceKind, RiskLevel, VerdictLevel } from "./types";

export const VERDICT_LABEL_EN: Record<VerdictLevel, string> = {
  VERIFIED: "VERIFIED",
  LIKELY_FAKE: "LIKELY FAKE",
  SUSPICIOUS: "SUSPICIOUS",
  UNVERIFIED: "UNVERIFIED",
};

/** Hausa verdict statements (exact wording required by the product spec). */
export const VERDICT_LABEL_HA: Record<VerdictLevel, string> = {
  UNVERIFIED: "Ba a samu sahihin tabbaci mai zaman kansa ba",
  SUSPICIOUS: "An gano alamomi masu nuna yiwuwar zamba",
  LIKELY_FAKE: "Akwai hujjoji masu ƙarfi da ke nuna cewa wannan na iya zama na bogi",
  VERIFIED: "An samu sahihin tabbaci daga wata majiya mai zaman kanta",
};

export const RISK_LABEL_EN: Record<RiskLevel, string> = {
  LOW: "LOW",
  MODERATE: "MODERATE",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
};

export const KIND_LABEL: Record<EvidenceKind, string> = {
  screenshot: "Screenshot (OCR)",
  text: "Text message",
  link: "Link",
  phone: "Phone number",
  "bank-verify": "Bank verification",
  balance: "Balance you checked",
};
