// The rules engine — the Frankenstein "stitching" core.
// Pure: no DOM, no network, no global time (now is injected for determinism).
// It detects mismatches BETWEEN evidence pieces (the seams) plus single-piece
// red flags, then aggregates into a verdict.

import type {
  BalanceEvidence,
  BankVerifyEvidence,
  Contradiction,
  Evidence,
  Finding,
  PassedCheck,
  Report,
  RiskLevel,
  ScreenshotEvidence,
  Severity,
  TextEvidence,
  Verdict,
  VerdictLevel,
} from "./types";
import { rawOf } from "./types";
import { findBankByText } from "./banks";
import { KIND_LABEL } from "./labels";

// ---------------------------------------------------------------------------
// Severity weights + legit offset
// ---------------------------------------------------------------------------
const WEIGHTS: Record<Severity, number> = { danger: 0.4, warn: 0.18, info: 0 };
const LEGIT_OFFSET_PER_OK = 0.15;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Internal heuristic weight used only to rank how many/how serious the flags
 * are. It is NOT a probability and is never shown to users as a percentage.
 */
export function score(findings: Finding[]): number {
  const points = findings.reduce((s, f) => s + WEIGHTS[f.severity], 0);
  const legit = findings.filter((f) => f.id === "bank-verify-ok").length * LEGIT_OFFSET_PER_OK;
  return Math.max(0, Math.min(1, points - legit));
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

/** Account balances stated in text ("Bal: NGN 120,500.00", "Available Balance N9,000"). */
export function extractBalances(text: string): number[] {
  const out = new Set<number>();
  const re = /\bbal(?:ance)?\.?\s*[:\-]?\s*(?:NGN|₦|N)?\s*([\d,]+(?:\.\d{1,2})?)/gi;
  for (const m of text.matchAll(re)) {
    const n = parseAmount(m[1]);
    if (n !== undefined) out.add(n);
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

// URL shorteners hide the real destination.
const SHORTENER_HOSTS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "v.gd", "ow.ly", "buff.ly",
  "rebrand.ly", "cutt.ly", "shorturl.at", "tiny.cc", "rb.gy", "t.ly", "bl.ink",
  "s.id", "lnkd.in", "shorte.st", "adf.ly", "bitly.com", "tr.ee", "short.io",
];

export function isShortener(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return SHORTENER_HOSTS.some((s) => h === s || h.endsWith(`.${s}`));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** All URLs in free text: http(s)://…, www.…, and bare shortener links (bit.ly/x). */
export function extractUrls(text: string): string[] {
  const out = new Set<string>();
  const bare = new RegExp(`(?<![\\w@.-])(?:${SHORTENER_HOSTS.map(escapeRe).join("|")})/[^\\s]+`, "gi");
  for (const re of [/(?:https?:\/\/|www\.)[^\s]+/gi, bare]) {
    for (const m of text.matchAll(re)) out.add(m[0].replace(/[.,;:!?)"'\]]+$/, ""));
  }
  return [...out];
}

/** The brand whose OFFICIAL domain this host is, if any. */
export function officialBrandOf(host: string): string | undefined {
  return BRAND_DOMAINS.find((b) => isOfficialDomain(host, b.official))?.name;
}

/**
 * A (possibly masked) account number. Full numbers have head === tail === all
 * digits; masked ones ("012***789") keep only the visible head and tail.
 */
export interface AccountRef {
  head: string;
  tail: string;
}

/** Extract 10-digit account numbers and masked forms like 012***789. */
export function extractAccounts(text: string): AccountRef[] {
  const out: AccountRef[] = [];
  for (const m of text.matchAll(/(?<!\d)\d{10}(?!\d)/g)) out.push({ head: m[0], tail: m[0] });
  for (const m of text.matchAll(/(?<![\w*•])(\d{2,5})[*xX•#]{2,}(\d{2,5})(?![\w*•])/g)) {
    out.push({ head: m[1], tail: m[2] });
  }
  return out;
}

export function accountsCompatible(a: AccountRef, b: AccountRef): boolean {
  const headOk = a.head.startsWith(b.head) || b.head.startsWith(a.head);
  const tailOk = a.tail.endsWith(b.tail) || b.tail.endsWith(a.tail);
  return headOk && tailOk;
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
  return amounts.map((n) => `₦${n.toLocaleString("en-US")}`).join(" / ") || "—";
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}

/** Link rules, shared by link evidence and links found inside message/OCR text. */
function linkFindings(url: string, inMessage: boolean): Finding[] {
  const f: Finding[] = [];
  const host = hostnameOf(url);
  if (!host) {
    if (!inMessage) f.push({ id: "link-malformed", severity: "warn", message: "The link could not be parsed." });
    return f;
  }
  if (isShortener(host)) {
    f.push({ id: "link-shortener", severity: "warn", message: `The link (${host}) is a shortened link: the real destination is hidden. Treat it as suspicious and do not open it.` });
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    f.push({ id: "link-ip", severity: "warn", message: "The link points to a raw IP address instead of a domain — common in scams." });
  } else if (url.toLowerCase().startsWith("http://")) {
    f.push({ id: "link-http", severity: "warn", message: "The link is not secure (http instead of https)." });
  }
  const imp = impersonatedBrand(host);
  if (imp) {
    f.push(
      inMessage
        ? { id: "text-link-impersonation", severity: "danger", message: `The message contains a link (${host}) that imitates ${imp}.` }
        : { id: "link-bank-impersonation", severity: "danger", message: `The link's domain "${host}" uses the name of ${imp} but is not an official ${imp} website.` },
    );
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
  return f;
}

function dateFindings(raw: string, now: number, subject: string): Finding[] {
  const f: Finding[] = [];
  const d = extractDateEpoch(raw);
  if (d) {
    if (d > now + 60_000) f.push({ id: "date-future", severity: "warn", message: `The ${subject} is dated in the future.` });
    else if (d < now - DAY_MS) f.push({ id: "date-stale", severity: "warn", message: `The ${subject} is more than 24 hours old — scammers reuse old alerts.` });
  }
  return f;
}

/** Scam rules for any free text: pasted messages AND OCR text from screenshots. */
function messageFindings(raw: string, subject: string): Finding[] {
  const f: Finding[] = [];
  if (hasPhishing(raw)) {
    f.push({ id: "phish-keywords", severity: "warn", message: `The ${subject} uses urgency / phishing language.` });
  }
  if (asksClickToConfirmCredit(raw)) {
    f.push({ id: "text-click-confirm-credit", severity: "danger", message: `The ${subject} claims a credit and asks you to click a link to confirm it. Real banks never ask you to do that.` });
  }
  for (const url of extractUrls(raw)) f.push(...linkFindings(url, true));
  const sender = extractSender(raw);
  if (sender && isSuspiciousSender(sender)) {
    f.push({ id: "sender-spoof", severity: "warn", message: `The sender "${sender}" looks like a spoofed mask.` });
  }
  return f;
}

// ---------------------------------------------------------------------------
// Single-piece rules
// ---------------------------------------------------------------------------
export function analyzePiece(ev: Evidence, now: number = Date.now()): Finding[] {
  const f: Finding[] = [];
  switch (ev.kind) {
    case "link":
      f.push(...linkFindings(ev.url, false));
      break;
    case "text":
      f.push(...messageFindings(ev.raw, "message"));
      f.push(...dateFindings(ev.raw, now, "message"));
      break;
    case "screenshot":
      // OCR text goes through the same rules as pasted text (incl. links inside it).
      f.push(...messageFindings(ev.ocrText, "screenshot"));
      f.push(...dateFindings(ev.ocrText, now, "payment alert"));
      break;
    case "bank-verify": {
      // Only flags here. A *positive* result needs cross-checks (sender + amount
      // matching the alert), so it is decided in analyzeCross, not by name alone.
      const mentioned = findBankByText(ev.confirmationSms);
      if (mentioned && mentioned.name !== ev.bank.name) {
        f.push({ id: "bank-verify-mismatch", severity: "warn", message: `Confirmation SMS mentions ${mentioned.name}, not ${ev.bank.name}.` });
      } else if (!mentioned) {
        f.push({ id: "bank-verify-mismatch", severity: "warn", message: `Confirmation SMS does not mention ${ev.bank.name}.` });
      }
      f.push(...messageFindings(ev.confirmationSms, "confirmation SMS"));
      break;
    }
    case "phone":
    case "balance":
      break; // phones and balances are evaluated in cross-piece rules
  }
  return dedupe(f);
}

// ---------------------------------------------------------------------------
// Cross-piece comparison of amounts / account digits
// ---------------------------------------------------------------------------
interface Source {
  ev: Evidence;
  label: string;
  amounts: number[];
  accounts: AccountRef[];
}

function sourcesOf(evs: Evidence[]): Source[] {
  const out: Source[] = [];
  for (const ev of evs) {
    if (ev.kind !== "screenshot" && ev.kind !== "text" && ev.kind !== "bank-verify") continue;
    const raw = ev.kind === "screenshot" ? ev.ocrText : ev.kind === "text" ? ev.raw : ev.confirmationSms;
    const label = ev.kind === "screenshot" ? "the screenshot" : ev.kind === "text" ? "the message" : "the bank confirmation SMS";
    out.push({ ev, label, amounts: extractAmounts(raw), accounts: extractAccounts(raw) });
  }
  return out;
}

/** Compare every pair of different evidence kinds that both carry a value. */
function comparePairs<T>(
  srcs: Source[],
  get: (s: Source) => T[],
  same: (a: T, b: T) => boolean,
): { mismatches: [Source, Source][]; matches: number } {
  const mismatches: [Source, Source][] = [];
  let matches = 0;
  for (let i = 0; i < srcs.length; i++) {
    for (let j = i + 1; j < srcs.length; j++) {
      const a = srcs[i];
      const b = srcs[j];
      if (a.ev.kind === b.ev.kind) continue;
      const va = get(a);
      const vb = get(b);
      if (va.length === 0 || vb.length === 0) continue;
      if (va.some((x) => vb.some((y) => same(x, y)))) matches++;
      else mismatches.push([a, b]);
    }
  }
  return { mismatches, matches };
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.01;
const fmtAccount = (a: AccountRef) => (a.head === a.tail ? a.head : `${a.head}…${a.tail}`);

function seamFinding(
  id: string,
  title: string,
  mismatches: [Source, Source][],
  fmt: (s: Source) => string,
): Finding {
  const ids = new Set<string>();
  let involvesBank = false;
  const parts = mismatches.map(([a, b]) => {
    ids.add(a.ev.id);
    ids.add(b.ev.id);
    if (a.ev.kind === "bank-verify" || b.ev.kind === "bank-verify") involvesBank = true;
    return `${a.label} shows ${fmt(a)} but ${b.label} shows ${fmt(b)}`;
  });
  return {
    id,
    // A bank confirmation that contradicts the alert is the core scam signature.
    severity: involvesBank ? "danger" : "warn",
    message: `${title}: ${parts.join("; ")}.`,
    evidenceIds: [...ids],
  };
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

  // R-CROSS-AMOUNT / R-CROSS-ACCOUNT: alert/screenshot/message vs bank confirmation.
  const srcs = sourcesOf(evs);
  const amt = comparePairs(srcs, (s) => s.amounts, sameAmount);
  if (amt.mismatches.length > 0) {
    findings.push(seamFinding("amount-mismatch", "Amounts do not match", amt.mismatches, (s) => fmtAmounts(s.amounts)));
  }
  const acct = comparePairs(srcs, (s) => s.accounts, accountsCompatible);
  if (acct.mismatches.length > 0) {
    findings.push(seamFinding("account-mismatch", "Account digits do not match", acct.mismatches, (s) => s.accounts.map(fmtAccount).join(" / ")));
  }

  // R-BANK-CONFIRM: a bank confirmation SMS is only trusted when it passes
  // strong checks. Merely naming the bank proves nothing (anyone can type it).
  const alertAmounts = srcs.filter((s) => s.ev.kind !== "bank-verify").flatMap((s) => s.amounts);
  for (const b of evs.filter((e): e is BankVerifyEvidence => e.kind === "bank-verify")) {
    if (findBankByText(b.confirmationSms)?.name !== b.bank.name) continue; // piece rule already flags
    const sender = extractSender(b.confirmationSms);
    const senderOk = !!sender && findBankByText(sender)?.name === b.bank.name && !isSuspiciousSender(sender);
    const smsAmounts = extractAmounts(b.confirmationSms);
    const amountOk = smsAmounts.some((a) => alertAmounts.some((x) => sameAmount(a, x)));
    if (senderOk && amountOk) {
      findings.push({
        id: "bank-verify-ok",
        severity: "info",
        message: `Confirmation SMS verified: sender "${sender}" matches ${b.bank.name} and the amount matches the alert.`,
        evidenceIds: [b.id],
      });
    } else if (!findings.some((f) => f.evidenceIds?.includes(b.id) && f.severity === "danger")) {
      const missing = [!senderOk && `a "From: ${b.bank.name}"-style sender line`, !amountOk && "an amount that matches the alert"].filter(Boolean);
      findings.push({
        id: "bank-verify-unconfirmed",
        severity: "info",
        message: `Confirmation SMS mentions ${b.bank.name}, but that alone proves nothing. It is not counted as verified: it needs ${missing.join(" and ")}.`,
        evidenceIds: [b.id],
      });
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

  // R-BALANCE: the balance the user read in their own bank app vs the balance
  // printed in the alert. A mismatch is a contradiction (a failed check).
  const balEvs = evs.filter((e): e is BalanceEvidence => e.kind === "balance");
  if (balEvs.length > 0) {
    const alertSrcs = evs.filter((e) => e.kind === "screenshot" || e.kind === "text");
    const alertBalances = alertSrcs.flatMap((e) => extractBalances(rawOf(e)));
    if (alertBalances.length > 0 && !balEvs.some((b) => alertBalances.some((a) => sameAmount(a, b.balance)))) {
      findings.push({
        id: "balance-mismatch",
        severity: "danger",
        message: `Balance does not match: your bank shows ${fmtAmounts(balEvs.map((b) => b.balance))} but the alert shows ${fmtAmounts(alertBalances)}.`,
        evidenceIds: [...balEvs.map((b) => b.id), ...alertSrcs.filter((e) => extractBalances(rawOf(e)).length > 0).map((e) => e.id)],
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------
/** Findings that on their own make the verdict LIKELY_FAKE (a link/text impersonating a bank). */
const CRITICAL_IDS = new Set([
  "link-bank-impersonation",
  "link-lookalike",
  "text-click-confirm-credit",
  "text-link-impersonation",
]);

/** Seam findings that are critical only when a bank confirmation contradicts the alert. */
const CRITICAL_WHEN_DANGER = new Set(["amount-mismatch", "account-mismatch"]);

const isCritical = (f: Finding) =>
  CRITICAL_IDS.has(f.id) || (CRITICAL_WHEN_DANGER.has(f.id) && f.severity === "danger");

/** Findings that are contradictions between pieces / failed independent checks. */
const CONTRADICTION_IDS = new Set([
  "phone-mismatch",
  "bank-mismatch",
  "bank-verify-mismatch",
  "amount-mismatch",
  "account-mismatch",
  "balance-mismatch",
  "link-merchant-mismatch",
]);

/**
 * Real checks that passed. Only INDEPENDENT checks (a matching bank
 * confirmation, or a user-entered balance equal to the alert balance) can make
 * a verdict VERIFIED. Everything else (https official link, matching phone,
 * matching amount...) is supporting only: such details are easy to fake.
 */
export function collectChecks(evs: Evidence[], findings: Finding[]): PassedCheck[] {
  const checks: PassedCheck[] = [];

  for (const f of findings) {
    if (f.id === "bank-verify-ok") checks.push({ id: f.id, message: f.message, independent: true });
  }

  // User-entered balance equals the balance printed in the alert.
  const balEvs = evs.filter((e): e is BalanceEvidence => e.kind === "balance");
  if (balEvs.length > 0) {
    const alertBalances = evs
      .filter((e) => e.kind === "screenshot" || e.kind === "text")
      .flatMap((e) => extractBalances(rawOf(e)));
    const hit = balEvs.find((b) => alertBalances.some((a) => sameAmount(a, b.balance)));
    if (hit) {
      checks.push({
        id: "balance-match",
        message: `The balance you checked yourself (${fmtAmounts([hit.balance])}) equals the balance in the alert.`,
        independent: true,
      });
    }
  }

  // Official bank website over https (standalone link or inside any text).
  // Supporting only: scam sites also use https, and this proves nothing about the payment.
  const urls = new Set<string>();
  for (const ev of evs) {
    if (ev.kind === "link") urls.add(ev.url);
    else if (ev.kind !== "balance") for (const u of extractUrls(rawOf(ev))) urls.add(u);
  }
  const seenHosts = new Set<string>();
  for (const u of urls) {
    const host = hostnameOf(u);
    const brand = host ? officialBrandOf(host) : undefined;
    if (host && brand && u.toLowerCase().startsWith("https://") && !seenHosts.has(host)) {
      seenHosts.add(host);
      checks.push({ id: "link-official", message: `The link ${host} is an official ${brand} website (https). This does not prove the payment is real.`, independent: false });
    }
  }

  // Entered phone number appears in the alert/message.
  const phoneEv = evs.find((e) => e.kind === "phone");
  if (phoneEv) {
    const n = normalizePhone(rawOf(phoneEv));
    const known = extractPhones(evs.filter((e) => e.kind !== "phone").map(rawOf).join("\n"));
    if (n && known.includes(n)) checks.push({ id: "phone-match", message: "The phone number you entered matches the one in the alert/message.", independent: false });
  }

  const srcs = sourcesOf(evs);
  if (comparePairs(srcs, (s) => s.amounts, sameAmount).matches > 0) {
    checks.push({ id: "amount-match", message: "The amount matches across your evidence.", independent: false });
  }
  if (comparePairs(srcs, (s) => s.accounts, accountsCompatible).matches > 0) {
    checks.push({ id: "account-match", message: "The account digits match across your evidence.", independent: false });
  }
  return checks;
}

const plural = (n: number, one: string, many: string = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function riskFor(level: VerdictLevel, internal: number, criticalCount: number): RiskLevel {
  switch (level) {
    case "VERIFIED":
      return "LOW";
    case "UNVERIFIED":
      return "MODERATE"; // unknown is never LOW
    case "SUSPICIOUS":
      return internal >= 0.4 ? "HIGH" : "MODERATE";
    case "LIKELY_FAKE":
      return internal >= 0.8 || criticalCount >= 2 ? "CRITICAL" : "HIGH";
  }
}

function buildExplanation(
  evs: Evidence[],
  level: VerdictLevel,
  flags: Finding[],
  contradictions: Contradiction[],
  independent: PassedCheck[],
): string {
  if (evs.length === 0) return "No evidence has been added yet, so nothing could be checked.";
  const kinds = [...new Set(evs.map((e) => KIND_LABEL[e.kind].toLowerCase()))].join(", ");
  const parts = [`We examined ${plural(evs.length, "piece")} of evidence (${kinds}).`];
  if (flags.length > 0) {
    const strongest = flags.find((f) => f.severity === "danger") ?? flags[0];
    parts.push(
      `We found ${plural(flags.length, "warning sign")}` +
        (contradictions.length > 0 ? `, including ${plural(contradictions.length, "contradiction")} between your pieces of evidence` : "") +
        `. The most serious: ${strongest.message}`,
    );
  } else {
    parts.push("We found no warning signs. That alone does not mean it is safe.");
  }
  if (independent.length > 0) {
    parts.push(`An independent check passed: ${independent.map((c) => c.message).join(" ")}`);
  } else {
    parts.push(
      "No independent check passed (a matching bank confirmation, or your own balance equal to the alert balance), so nothing here confirms the payment is real.",
    );
  }
  switch (level) {
    case "VERIFIED":
      parts.push("Because an independent source agrees and nothing contradicts it, the result is VERIFIED.");
      break;
    case "LIKELY_FAKE":
      parts.push("Because of the strong warning signs, the result is LIKELY FAKE.");
      break;
    case "SUSPICIOUS":
      parts.push(
        independent.length > 0
          ? "Even though one check passed, the warning signs remain, so the result is SUSPICIOUS."
          : "Because of the warning signs, the result is SUSPICIOUS. It is not conclusive.",
      );
      break;
    case "UNVERIFIED":
      parts.push("Because nothing independent confirms it, the result is UNVERIFIED. This is not the same as safe.");
      break;
  }
  return parts.join(" ");
}

function buildReport(
  evs: Evidence[],
  level: VerdictLevel,
  all: Finding[],
  checks: PassedCheck[],
  now: number,
): Report {
  const has = (k: Evidence["kind"]) => evs.some((e) => e.kind === k);
  const hasLink = has("link") || evs.some((e) => e.kind !== "balance" && extractUrls(rawOf(e)).length > 0);

  const methods: string[] = [];
  if (evs.length > 0) {
    if (has("screenshot") || has("text") || has("bank-verify")) {
      methods.push("Pattern checks on message and screenshot text (urgency language, spoofed senders, claims that ask you to click to confirm a credit, old or future dates).");
    }
    if (hasLink) methods.push("Link analysis (shortened links, look-alike or impersonating bank domains, unusual endings, http vs https).");
    if (evs.length > 1) methods.push("Cross-checking amounts, account digits, phone numbers and bank names between your pieces of evidence.");
    if (has("bank-verify")) methods.push("Bank confirmation check (expected sender line and an amount matching the alert).");
    if (has("balance")) methods.push("Balance comparison (the balance you checked yourself vs the balance in the alert).");
    methods.push("All checks ran on your device. Nothing was sent anywhere.");
  }

  const flags = all.filter((f) => f.severity !== "info");
  const contradictions: Contradiction[] = flags
    .filter((f) => CONTRADICTION_IDS.has(f.id) || (f.evidenceIds?.length ?? 0) >= 2)
    .map((f) => ({ evidenceId: f.evidenceId!, message: f.message }));

  const missing: string[] = [];
  if (evs.length === 0) missing.push("No evidence has been added yet.");
  else {
    if (!has("screenshot") && !has("text")) missing.push("A payment alert (screenshot or pasted message) to compare the other pieces against.");
    const bankOk = checks.some((c) => c.id === "bank-verify-ok");
    if (!bankOk) {
      missing.push(
        has("bank-verify")
          ? "The bank confirmation does not yet prove the payment: it needs a sender line naming your bank and an amount that matches the alert."
          : "A confirmation SMS from your own bank (use Bank verify).",
      );
    }
    if (!checks.some((c) => c.id === "balance-match")) {
      const alertHasBalance = evs.some((e) => (e.kind === "screenshot" || e.kind === "text") && extractBalances(rawOf(e)).length > 0);
      if (!has("balance")) missing.push("The balance you see in your own bank app or by USSD, to compare with the alert balance.");
      else if (!alertHasBalance) missing.push("The alert shows no balance, so the balance you entered could not be compared.");
    }
  }

  const limitations = [
    "No warning signs found is not proof that a payment is real. Scammers can build fake alerts that pass these checks.",
    "TrustCheck does not look up phone numbers, links or accounts in any scam-report database. A link or number with no reports is not safe.",
    "A secure (https) link only means the connection is encrypted. Scam websites use https too.",
    "Screenshots can be edited, and text read from a screenshot (OCR) can contain mistakes.",
    "A web app cannot read your SMS inbox or run USSD codes, so bank checks rely on what you paste or enter yourself.",
  ];

  const actions: string[] = [];
  switch (level) {
    case "VERIFIED":
      actions.push("An independent source agrees with the alert. Still confirm the money in your bank app before releasing goods or services.");
      break;
    case "UNVERIFIED":
      actions.push("Do not release goods or services yet.");
      actions.push("Check your balance in your own bank app or by USSD, then add it here or use Bank verify.");
      break;
    case "SUSPICIOUS":
      actions.push("Do not click any link and do not release goods or services until the money shows in your own bank app.");
      actions.push("Confirm with your bank using Bank verify, or check your balance yourself.");
      break;
    case "LIKELY_FAKE":
      actions.push("Do not release goods or services, click any link, or call the number given.");
      actions.push("Report it to your bank and block the sender.");
      break;
  }
  actions.push("Never share your PIN, OTP or BVN with anyone.");

  return {
    generatedAt: now,
    generatedAtIso: new Date(now).toISOString(),
    evidenceExamined: evs.map((e) => ({ id: e.id, kind: e.kind, label: KIND_LABEL[e.kind] })),
    methods,
    contradictions,
    missingInformation: missing,
    limitations,
    recommendedActions: actions,
  };
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
  // Seams (non-info) are listed under __cross__; every cross finding is also
  // attached to the patches it names so the flag shows on each of them.
  const seams = cross.filter((f) => f.severity !== "info");
  if (seams.length) pieceFindings["__cross__"] = seams;
  for (const f of cross) {
    for (const eid of f.evidenceIds ?? []) (pieceFindings[eid] ??= []).push(f);
  }

  const checks = collectChecks(evs, all);

  // Every finding and passed check gets a unique, stable evidence ID. Findings
  // are shared by reference between `all` and `pieceFindings`, so they carry it everywhere.
  let n = 0;
  const nextId = () => `EV-${String(++n).padStart(3, "0")}`;
  for (const f of all) f.evidenceId = nextId();
  for (const c of checks) c.evidenceId = nextId();

  // Heuristic internal weight (never shown as a number).
  const flags = all.filter((f) => f.severity !== "info");
  const criticals = all.filter(isCritical);
  let internal = score(all);
  if (criticals.length > 0) internal = Math.max(internal, 0.7);
  else if (flags.length > 0) internal = Math.max(internal, 0.3);

  const independent = checks.filter((c) => c.independent);
  let level: VerdictLevel;
  if (internal >= 0.7) level = "LIKELY_FAKE";
  else if (internal >= 0.3) level = "SUSPICIOUS";
  // VERIFIED only when no flag exists AND an independent check passed.
  // "No warning signs", an https link, a screenshot, etc. are never enough.
  else level = flags.length === 0 && independent.length > 0 ? "VERIFIED" : "UNVERIFIED";

  const risk = riskFor(level, internal, criticals.length);
  const report = buildReport(evs, level, all, checks, now);
  const explanation = buildExplanation(evs, level, flags, report.contradictions, independent);

  return { level, risk, explanation, findings: all, pieceFindings, checks, report };
}
