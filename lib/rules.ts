// The rules engine — the Frankenstein "stitching" core.
// Pure: no DOM, no network, no global time (now is injected for determinism).
// It detects mismatches BETWEEN evidence pieces (the seams) plus single-piece
// red flags, then aggregates into a verdict.

import type {
  BankVerifyEvidence,
  Evidence,
  Finding,
  ScreenshotEvidence,
  Severity,
  TextEvidence,
  Verdict,
  VerdictLevel,
} from "./types";
import { findBankByText } from "./banks";

// ---------------------------------------------------------------------------
// Severity weights + legit offset
// ---------------------------------------------------------------------------
const WEIGHTS: Record<Severity, number> = { danger: 0.4, warn: 0.18, info: 0 };
const LEGIT_OFFSET_PER_OK = 0.15;
const DAY_MS = 24 * 60 * 60 * 1000;

export function score(findings: Finding[]): number {
  const points = findings.reduce((s, f) => s + WEIGHTS[f.severity], 0);
  const legit = findings.filter((f) => f.id === "bank-verify-ok").length * LEGIT_OFFSET_PER_OK;
  return Math.max(0, Math.min(1, points - legit));
}

function levelFromConfidence(c: number): VerdictLevel {
  if (c >= 0.7) return "scam";
  if (c >= 0.3) return "suspicious";
  return "clean";
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------
/** Canonical Nigerian phone => "234" + last 10 digits, or undefined. */
export function normalizePhone(input: string): string | undefined {
  const d = (input || "").replace(/\D/g, "");
  if (d.length < 10) return undefined;
  const national = d.replace(/^234/, "").slice(-10);
  return `234${national}`;
}

/** Parse one amount string (₦/N/NGN/$ prefix or decimal-with-commas) to a number. */
export function parseAmount(token: string): number | undefined {
  const n = parseFloat(token.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Extract currency-prefixed or thousands-separated decimal amounts from text. */
export function extractAmounts(text: string): number[] {
  const out = new Set<number>();
  const patterns = [
    /(?:NGN|₦|N|\$)\s?([\d,]+(?:\.\d{1,2})?)/gi, // N5,000 / ₦5,000.00 / NGN 5000
    /\b(\d{1,3}(?:,\d{3})+\.\d{2})\b/g, // 5,000.00
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const n = parseAmount(m[1]);
      if (n !== undefined) out.add(n);
    }
  }
  return [...out];
}

/** Extract Nigerian mobile numbers (0[7-9]… or +234[7-9]…) and canonicalize. */
export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:\+?234|0)[789]\d{9}/g;
  for (const m of text.matchAll(re)) {
    const n = normalizePhone(m[0]);
    if (n) out.add(n);
  }
  return [...out];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function toEpoch(y: number, mo: number, d: number): number {
  return Date.UTC(y, mo - 1, d);
}

/** Best-effort first-date parser. Returns epoch ms (UTC) or undefined. */
export function extractDateEpoch(text: string): number | undefined {
  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?![\d])/);
  if (m) return toEpoch(+m[1], +m[2], +m[3]);
  m = text.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase().slice(0, 3));
    if (mo >= 0) return toEpoch(+m[3], mo + 1, +m[1]);
  }
  m = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/);
  if (m) return toEpoch(+m[3], +m[2], +m[1]);
  return undefined;
}

// ---------------------------------------------------------------------------
// Link helpers
// ---------------------------------------------------------------------------
export function hostnameOf(url: string): string | undefined {
  try {
    const u = new URL(url.includes("://") ? url : `http://${url}`);
    return u.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** The registrable label, e.g. "gtbank" from "www.gtbank.com" / "x.co.ng". */
export function registrableLabel(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  const parts = h.split(".");
  if (parts.length < 2) return parts[0] ?? "";
  if (parts.length >= 3 && parts[parts.length - 2] === "co") return parts[parts.length - 3];
  return parts[parts.length - 2];
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost));
    }
    prev = cur;
  }
  return prev[n];
}

// Curated brand labels used for lookalike detection (len >= 4).
const BRAND_LABELS = [
  "gtbank", "access", "zenith", "firstbank", "sterling", "fcmb", "unionbank",
  "wema", "opay", "moniepoint", "palmpay", "fidelity", "kuda",
  "paystack", "flutterwave", "paypal", "jumia", "konga", "paga", "quickteller",
];

/** Returns the brand a label is impersonating (Levenshtein 1-2), or undefined. */
export function lookalikeBrand(label: string): string | undefined {
  if (!label) return undefined;
  for (const b of BRAND_LABELS) {
    if (b.length < 4) continue;
    if (Math.abs(label.length - b.length) > 2) continue;
    const d = levenshtein(label, b);
    if (d > 0 && d <= 2) return b;
  }
  return undefined;
}

// Official domains per Nigerian bank/fintech brand. A host that mentions the
// brand but is not one of these (or a subdomain of them) is an impersonation.
interface BrandInfo {
  name: string;
  /** Matched as substring of the hyphen-stripped label (len >= 5) ... */
  long: string[];
  /** ... or as a whole hyphen-delimited token (short, ambiguous names). */
  short: string[];
  official: string[];
}
const BRAND_DOMAINS: BrandInfo[] = [
  { name: "GTBank", long: ["gtbank", "guarantytrust"], short: ["gtb", "gtco"], official: ["gtbank.com", "gtbank.com.ng", "gtco.com", "gtbankplc.com"] },
  { name: "Access Bank", long: ["accessbank"], short: [], official: ["accessbankplc.com", "accessbank.com"] },
  { name: "Zenith Bank", long: ["zenithbank", "zenith"], short: [], official: ["zenithbank.com"] },
  { name: "UBA", long: ["unitedbankforafrica"], short: ["uba"], official: ["ubagroup.com", "uba.com"] },
  { name: "FirstBank", long: ["firstbank"], short: [], official: ["firstbanknigeria.com", "firstbankgroup.com", "firstbank.com.ng"] },
  { name: "Sterling Bank", long: ["sterlingbank"], short: [], official: ["sterling.ng", "sterlingbankng.com"] },
  { name: "FCMB", long: ["fcmb"], short: [], official: ["fcmb.com"] },
  { name: "Union Bank", long: ["unionbank"], short: [], official: ["unionbankng.com"] },
  { name: "Wema Bank", long: ["wemabank"], short: ["wema", "alat"], official: ["wemabank.com", "alat.ng"] },
  { name: "OPay", long: ["opay"], short: [], official: ["opayweb.com", "opay.com", "opay-nigeria.com"] },
  { name: "Moniepoint", long: ["moniepoint"], short: [], official: ["moniepoint.com"] },
  { name: "PalmPay", long: ["palmpay"], short: [], official: ["palmpay.com"] },
  { name: "Fidelity Bank", long: ["fidelitybank"], short: [], official: ["fidelitybank.ng", "fidelitybank.com"] },
  { name: "Kuda", long: ["kuda"], short: [], official: ["kuda.com"] },
  { name: "Paystack", long: ["paystack"], short: [], official: ["paystack.com", "paystack.co"] },
  { name: "Flutterwave", long: ["flutterwave"], short: [], official: ["flutterwave.com"] },
  { name: "PayPal", long: ["paypal"], short: [], official: ["paypal.com"] },
];

export function isOfficialDomain(host: string, official: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return official.some((d) => h === d || h.endsWith(`.${d}`));
}

/** Brand named inside a host that is NOT one of that brand's official domains. */
export function impersonatedBrand(host: string): string | undefined {
  const h = host.toLowerCase();
  const compact = h.replace(/[^a-z0-9.]/g, "");
  const tokens = h.split(/[.\-_]/);
  for (const b of BRAND_DOMAINS) {
    const hit = b.long.some((t) => compact.includes(t)) || b.short.some((t) => tokens.includes(t));
    if (hit && !isOfficialDomain(h, b.official)) return b.name;
  }
  return undefined;
}

const SUSPICIOUS_TLDS = new Set([
  "xyz", "top", "click", "link", "icu", "buzz", "gq", "tk", "ml", "cf", "ga", "work",
  "support", "live", "online", "site", "club", "info", "rest", "cyou", "vip", "monster",
]);

export function suspiciousTld(host: string): string | undefined {
  const tld = host.toLowerCase().split(".").pop() ?? "";
  return SUSPICIOUS_TLDS.has(tld) ? tld : undefined;
}

const PHISH_URL_WORDS = [
  "verify", "verification", "confirm", "secure", "login", "signin", "update",
  "validate", "unlock", "reactivate", "claim", "bonus", "alert", "support", "kyc", "bvn",
];

export function phishUrlWords(host: string): string[] {
  const tokens = host.toLowerCase().split(/[.\-_]/);
  return PHISH_URL_WORDS.filter((w) => tokens.some((t) => t.includes(w)));
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
const PHISH_PHRASES = [
  "urgent", "verify now", "verify your account", "account suspended", "account blocked",
  "account locked", "click here", "click the link", "tap the link", "send your otp",
  "share your otp", "send the code", "forward the code", "your otp", "activation code",
  "reset code", "congratulations you won", "you have won", "claim your prize", "claim now",
  "double your money", "guaranteed returns", "invest and earn", "bvn verification",
  "aml verification", "your account will be closed",
];

export function hasPhishing(text: string): boolean {
  const t = text.toLowerCase();
  return PHISH_PHRASES.some((p) => t.includes(p));
}

const URL_RE = /(?:https?:\/\/|www\.)[^\s]+/i;

/** Text that claims a credit and tells the user to click/open a link to confirm it. */
export function asksClickToConfirmCredit(text: string): boolean {
  const t = text.toLowerCase();
  const credit = /\b(credit(?:ed)?|received|deposit(?:ed)?|payment|transfer|refund)\b/.test(t);
  const click = /\b(click|tap|open|visit|follow|go to)\b/.test(t) || URL_RE.test(t);
  const confirm = /\b(confirm|verify|validate|claim|receive|accept|activate|view|check)\b/.test(t);
  return credit && click && confirm && (URL_RE.test(t) || /\b(link|here)\b/.test(t));
}

export function extractSender(text: string): string | undefined {
  const m = text.match(/(?:from|sender)\s*:\s*([^\n]+)/i);
  return m ? m[1].trim() : undefined;
}

const SUSPICIOUS_MASKS = [
  "alert", "notice", "verify", "promo", "win", "winner", "prize", "info",
  "bankalert", "trans", "credit", "debit", "notification", "bonus", "offer",
  "reward", "urgent", "gift", "lottery",
];

export function isSuspiciousSender(sender: string): boolean {
  const s = sender.toLowerCase();
  return SUSPICIOUS_MASKS.some((g) => s.includes(g));
}

function fmtAmounts(amounts: number[]): string {
  return amounts.map((n) => `₦${n.toLocaleString()}`).join(" / ") || "—";
}

// ---------------------------------------------------------------------------
// Single-piece rules
// ---------------------------------------------------------------------------
export function analyzePiece(ev: Evidence, now: number = Date.now()): Finding[] {
  const f: Finding[] = [];
  switch (ev.kind) {
    case "link": {
      const host = hostnameOf(ev.url);
      if (!host) {
        f.push({ id: "link-malformed", severity: "warn", message: "The link could not be parsed." });
        break;
      }
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        f.push({ id: "link-ip", severity: "warn", message: "The link points to a raw IP address instead of a domain — common in scams." });
      } else if (ev.url.startsWith("http://")) {
        f.push({ id: "link-http", severity: "warn", message: "The link is not secure (http instead of https)." });
      }
      const imp = impersonatedBrand(host);
      if (imp) {
        f.push({ id: "link-bank-impersonation", severity: "danger", message: `The link's domain "${host}" uses the name of ${imp} but is not an official ${imp} website.` });
      }
      const tld = suspiciousTld(host);
      if (tld) {
        f.push({ id: "link-odd-tld", severity: "warn", message: `The link ends in ".${tld}", an unusual domain type often used in scams.` });
      }
      const words = phishUrlWords(host);
      if (words.length > 0) {
        f.push({ id: "link-phish-words", severity: "warn", message: `The link's domain contains pressure words (${words.join(", ")}) typical of phishing.` });
      }
      const label = registrableLabel(host);
      const lk = lookalikeBrand(label);
      if (lk) {
        f.push({ id: "link-lookalike", severity: "danger", message: `The link's domain "${label}" looks like an impersonation of "${lk}".` });
      }
      break;
    }
    case "text": {
      if (hasPhishing(ev.raw)) {
        f.push({ id: "phish-keywords", severity: "warn", message: "The message uses urgency / phishing language." });
      }
      if (asksClickToConfirmCredit(ev.raw)) {
        f.push({ id: "text-click-confirm-credit", severity: "danger", message: "The message claims a credit and asks you to click a link to confirm it. Real banks never ask you to do that." });
      }
      const urlInText = ev.raw.match(URL_RE)?.[0];
      const textHost = urlInText ? hostnameOf(urlInText.replace(/[.,;)]+$/, "")) : undefined;
      const textImp = textHost ? impersonatedBrand(textHost) : undefined;
      if (textHost && textImp) {
        f.push({ id: "text-link-impersonation", severity: "danger", message: `The message contains a link (${textHost}) that imitates ${textImp}.` });
      }
      const sender = extractSender(ev.raw);
      if (sender && isSuspiciousSender(sender)) {
        f.push({ id: "sender-spoof", severity: "warn", message: `The sender "${sender}" looks like a spoofed mask.` });
      }
      const d = extractDateEpoch(ev.raw);
      if (d) {
        if (d > now + 60_000) f.push({ id: "date-future", severity: "warn", message: "The message is dated in the future." });
        else if (d < now - DAY_MS) f.push({ id: "date-stale", severity: "warn", message: "The message is more than 24 hours old — scammers reuse old alerts." });
      }
      break;
    }
    case "screenshot": {
      const d = extractDateEpoch(ev.ocrText);
      if (d) {
        if (d > now + 60_000) f.push({ id: "date-future", severity: "warn", message: "The payment alert is dated in the future." });
        else if (d < now - DAY_MS) f.push({ id: "date-stale", severity: "warn", message: "The payment alert is more than 24 hours old — scammers reuse old alerts." });
      }
      break;
    }
    case "bank-verify": {
      const mentioned = findBankByText(ev.confirmationSms);
      if (mentioned && mentioned.name === ev.bank.name) {
        f.push({ id: "bank-verify-ok", severity: "info", message: `Confirmation SMS mentions ${ev.bank.name}.` });
      } else if (mentioned && mentioned.name !== ev.bank.name) {
        f.push({ id: "bank-verify-mismatch", severity: "warn", message: `Confirmation SMS mentions ${mentioned.name}, not ${ev.bank.name}.` });
      } else {
        const okToken = /successful|debit|credit|completed|transaction|reference|debited|credited|approved/i.test(ev.confirmationSms);
        if (okToken) {
          f.push({ id: "bank-verify-ok", severity: "info", message: "Confirmation SMS looks like a real bank response (contains a transaction keyword)." });
        } else {
          f.push({ id: "bank-verify-mismatch", severity: "warn", message: `Confirmation SMS does not mention ${ev.bank.name}.` });
        }
      }
      break;
    }
    case "phone":
      break; // phones are evaluated in cross-piece rules
  }
  return f;
}

// ---------------------------------------------------------------------------
// Cross-piece ("stitching") rules — the Frankenstein seams
// ---------------------------------------------------------------------------
export function analyzeCross(evs: Evidence[]): Finding[] {
  const findings: Finding[] = [];
  const screenshot = evs.find((e): e is ScreenshotEvidence => e.kind === "screenshot");
  const phoneEv = evs.find((e): e is Evidence => e.kind === "phone");
  const textEvs = evs.filter((e): e is TextEvidence => e.kind === "text");
  const linkEv = evs.find((e): e is Evidence => e.kind === "link");
  const bankEv = evs.find((e): e is BankVerifyEvidence => e.kind === "bank-verify");

  const messageText = textEvs.map((t) => t.raw).join("\n");
  const ocrText = screenshot?.ocrText ?? "";
  const narrative = [ocrText, messageText].join("\n");

  // R-CROSS-PHONE: entered phone vs any phone in the alert/message
  if (phoneEv) {
    const phoneN = normalizePhone((phoneEv as { phone: string }).phone);
    const known = extractPhones(narrative);
    if (phoneN && known.length > 0 && !known.includes(phoneN)) {
      findings.push({
        id: "phone-mismatch",
        severity: "danger",
        message: `The phone number you entered does not match any number in the payment alert/message.`,
      });
    }
  }

  // R-CROSS-BANK: chosen bank vs bank mentioned in alert/message
  if (bankEv) {
    const detected = findBankByText(narrative);
    if (detected && detected.name !== bankEv.bank.name) {
      findings.push({
        id: "bank-mismatch",
        severity: "danger",
        message: `The message mentions ${detected.name}, but you verified with ${bankEv.bank.name}.`,
      });
    }
  }

  // R-CROSS-AMOUNT: screenshot amount vs message amount
  if (screenshot && textEvs.length > 0) {
    const sAmt = extractAmounts(ocrText);
    const tAmt = extractAmounts(messageText);
    if (sAmt.length > 0 && tAmt.length > 0) {
      const match = sAmt.some((a) => tAmt.some((b) => Math.abs(a - b) < 0.01));
      if (!match) {
        findings.push({
          id: "amount-mismatch",
          severity: "warn",
          message: `The amount in the screenshot (${fmtAmounts(sAmt)}) does not match the amount in the message (${fmtAmounts(tAmt)}).`,
        });
      }
    }
  }

  // R-CROSS-LINK-MERCHANT: link brand vs bank/merchant in the message
  if (linkEv && textEvs.length > 0) {
    const host = hostnameOf((linkEv as { url: string }).url);
    if (host) {
      const linkBank = findBankByText(registrableLabel(host));
      const textBank = findBankByText(messageText);
      if (linkBank && textBank && linkBank.name !== textBank.name) {
        findings.push({
          id: "link-merchant-mismatch",
          severity: "warn",
          message: `The link points to ${linkBank.name}, but the message talks about ${textBank.name}.`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------
/** Findings that on their own make the verdict "scam" (a link/text impersonating a bank). */
const CRITICAL_IDS = new Set([
  "link-bank-impersonation",
  "link-lookalike",
  "text-click-confirm-credit",
  "text-link-impersonation",
]);

/** Never let a verdict read "clean" while flags exist; critical flags force "scam". */
function applyFloors(all: Finding[], confidence: number, pieceFindings: Record<string, Finding[]>): Verdict {
  let c = confidence;
  if (all.some((f) => CRITICAL_IDS.has(f.id))) c = Math.max(c, 0.7);
  else if (all.some((f) => f.severity === "danger" || f.severity === "warn")) c = Math.max(c, 0.3);
  c = Math.round(c * 100) / 100;
  return { level: levelFromConfidence(c), confidence: c, findings: all, pieceFindings };
}

export function computeVerdict(evs: Evidence[], now: number = Date.now()): Verdict {
  const pieceFindings: Record<string, Finding[]> = {};
  const all: Finding[] = [];

  for (const ev of evs) {
    const pf = analyzePiece(ev, now);
    if (pf.length) pieceFindings[ev.id] = pf;
    all.push(...pf);
  }

  const cross = analyzeCross(evs);
  all.push(...cross);
  if (cross.length) pieceFindings["__cross__"] = cross;

  const confidence = Math.round(score(all) * 100) / 100;
  return applyFloors(all, confidence, pieceFindings);
}
