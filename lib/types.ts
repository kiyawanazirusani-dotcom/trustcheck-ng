// Shared domain types for TrustCheck NG. Pure types, no runtime side effects,
// so they can be imported by both the (pure) rules engine and React components.

export type EvidenceKind =
  | "screenshot"
  | "text"
  | "link"
  | "phone"
  | "bank-verify"
  | "balance";

export type Severity = "info" | "warn" | "danger";

/** A single scam-signal finding produced by a rule. */
export interface Finding {
  /** Rule id, e.g. "phone-mismatch", "link-lookalike". */
  id: string;
  severity: Severity;
  /** Human-readable reason, in English (the Gemini layer adds Hausa). */
  message: string;
  /** Evidence patches (piece ids) this finding relates to (cross-piece seams).
   *  The flag is shown on each of these patches. Not the same as `evidenceId`. */
  evidenceIds?: string[];
  /**
   * Report-level evidence ID, e.g. "EV-003". Assigned by computeVerdict: every
   * finding and passed check in a Verdict has a unique one (stable for the same
   * input). Absent only on findings returned directly by analyzePiece/analyzeCross.
   */
  evidenceId?: string;
}

/** A real check that passed (a positive signal). */
export interface PassedCheck {
  id: string;
  message: string;
  /** Report-level evidence ID, e.g. "EV-007" (assigned by computeVerdict). */
  evidenceId?: string;
  /**
   * True only for checks that come from a source independent of the evidence
   * itself: a matching bank confirmation or a user-entered balance equal to the
   * alert balance. Only independent checks can make a verdict VERIFIED.
   */
  independent: boolean;
}

/**
 * The four verdicts.
 *  - VERIFIED    an independent check passed and nothing contradicts it.
 *  - LIKELY_FAKE strong evidence of a scam.
 *  - SUSPICIOUS  warning signs found, not conclusive.
 *  - UNVERIFIED  nothing independent could confirm it (this is NOT "safe").
 */
export type VerdictLevel = "VERIFIED" | "LIKELY_FAKE" | "SUSPICIOUS" | "UNVERIFIED";

export const VERDICT_LEVELS: readonly VerdictLevel[] = ["VERIFIED", "LIKELY_FAKE", "SUSPICIOUS", "UNVERIFIED"];

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export const RISK_LEVELS: readonly RiskLevel[] = ["LOW", "MODERATE", "HIGH", "CRITICAL"];

/** One piece of evidence listed in the report. */
export interface ExaminedEvidence {
  /** Piece id (matches the patch). */
  id: string;
  kind: EvidenceKind;
  /** Short human label, e.g. "Screenshot (OCR)". */
  label: string;
}

/** A contradiction (seam) between pieces, with its report evidence ID. */
export interface Contradiction {
  evidenceId: string;
  message: string;
}

/** The structured, explainable report behind a verdict. */
export interface Report {
  /** When the report was produced (epoch ms; injected `now`). */
  generatedAt: number;
  /** ISO-8601 form of generatedAt. */
  generatedAtIso: string;
  evidenceExamined: ExaminedEvidence[];
  methods: string[];
  contradictions: Contradiction[];
  missingInformation: string[];
  limitations: string[];
  recommendedActions: string[];
}

/** The stitched verdict — the "monster" assembled from the evidence patches. */
export interface Verdict {
  level: VerdictLevel;
  risk: RiskLevel;
  /** Plain-language account of how the verdict was reached (no percentages). */
  explanation: string;
  /** All findings, aggregated across pieces and cross-piece rules. */
  findings: Finding[];
  /** Findings grouped by the evidence id they relate to. */
  pieceFindings: Record<string, Finding[]>;
  /** Real checks that passed. */
  checks: PassedCheck[];
  report: Report;
}

/** A bank in the guided-verification catalog. */
export interface BankCode {
  /** Display name, e.g. "GTBank". */
  name: string;
  /** Official transfer USSD code without the tel: scheme, e.g. "*737#". Empty if app-only. */
  ussd: string;
  /** A ready-to-use tel: link with `#` percent-encoded as %23, e.g. "tel:*737%23". Empty if app-only. */
  tel: string;
  /** Lowercase aliases for fuzzy matching against OCR text / pasted messages. */
  aliases: string[];
  /** True for app-only banks (e.g. Kuda) with no outbound USSD. */
  appOnly?: boolean;
}

/** Base fields shared by every evidence piece. */
export interface EvidenceBase {
  id: string;
  kind: EvidenceKind;
  addedAt: number;
}

/** Payment-alert screenshot, OCR'd on-device. */
export interface ScreenshotEvidence extends EvidenceBase {
  kind: "screenshot";
  ocrText: string;
  ocrConfidence: number; // tesseract confidence 0..1
}

/** Pasted SMS / WhatsApp text. */
export interface TextEvidence extends EvidenceBase {
  kind: "text";
  raw: string;
}

/** A URL the user was asked to click / pay through. */
export interface LinkEvidence extends EvidenceBase {
  kind: "link";
  url: string;
}

/** A phone number the user was given / asked to call. */
export interface PhoneEvidence extends EvidenceBase {
  kind: "phone";
  phone: string;
}

/** Guided bank-verification result: bank used + pasted confirmation SMS. */
export interface BankVerifyEvidence extends EvidenceBase {
  kind: "bank-verify";
  bank: BankCode;
  confirmationSms: string;
}

/**
 * The account balance the user read from their own bank app / USSD balance
 * check (NOT from the alert). Independent evidence: compared to the balance
 * shown in the alert.
 */
export interface BalanceEvidence extends EvidenceBase {
  kind: "balance";
  /** Naira, as entered by the user. */
  balance: number;
}

export type Evidence =
  | ScreenshotEvidence
  | TextEvidence
  | LinkEvidence
  | PhoneEvidence
  | BankVerifyEvidence
  | BalanceEvidence;

/** A canonical raw-text view of an evidence piece (used for cross-checking). */
export function rawOf(ev: Evidence): string {
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
      return ev.confirmationSms;
    case "balance":
      return `₦${ev.balance}`;
  }
}
