// Shared domain types for TrustCheck NG. Pure types, no runtime side effects,
// so they can be imported by both the (pure) rules engine and React components.

export type EvidenceKind =
  | "screenshot"
  | "text"
  | "link"
  | "phone"
  | "bank-verify";

export type Severity = "info" | "warn" | "danger";

/** A single scam-signal finding produced by a rule. */
export interface Finding {
  /** Rule id, e.g. "phone-mismatch", "link-lookalike". */
  id: string;
  severity: Severity;
  /** Human-readable reason, in English (the Gemini layer adds Hausa). */
  message: string;
  /** Evidence patches this finding relates to (cross-piece seams). The flag is
   *  shown on each of these patches. */
  evidenceIds?: string[];
}

/** A real check that passed (a positive signal). "Clean" requires at least one. */
export interface PassedCheck {
  id: string;
  message: string;
}

/**
 * "unverifiable" = neutral "Cannot verify": no red flags, but also nothing
 * checkable passed (e.g. a phone number on its own). Never shown as green.
 */
export type VerdictLevel = "clean" | "unverifiable" | "suspicious" | "scam";

/** The stitched verdict — the "monster" assembled from the evidence patches. */
export interface Verdict {
  level: VerdictLevel;
  /** 0..1 confidence that the interaction is a scam. */
  confidence: number;
  /** All findings, aggregated across pieces and cross-piece rules. */
  findings: Finding[];
  /** Findings grouped by the evidence id they relate to. */
  pieceFindings: Record<string, Finding[]>;
  /** Real checks that passed. Empty => the verdict can never be "clean". */
  checks: PassedCheck[];
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

export type Evidence =
  | ScreenshotEvidence
  | TextEvidence
  | LinkEvidence
  | PhoneEvidence
  | BankVerifyEvidence;

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
  }
}
