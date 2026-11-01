import { describe, it, expect } from "vitest";
import {
  analyzeCross,
  analyzePiece,
  computeVerdict,
  extractAmounts,
  extractDateEpoch,
  extractPhones,
  extractSender,
  hasPhishing,
  hostnameOf,
  isSuspiciousSender,
  levenshtein,
  lookalikeBrand,
  normalizePhone,
  parseAmount,
  registrableLabel,
  score,
} from "../lib/rules";
import type { Evidence } from "../lib/types";
import { findBankByName } from "../lib/banks";

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0); // 2026-11-01 (fixed for determinism)

let idc = 0;
const id = () => `e${idc++}`;
const ts = 1_000_000;
const link = (url: string): Evidence => ({ id: id(), kind: "link", addedAt: ts, url });
const text = (raw: string): Evidence => ({ id: id(), kind: "text", addedAt: ts, raw });
const phone = (p: string): Evidence => ({ id: id(), kind: "phone", addedAt: ts, phone: p });
const shot = (ocr: string, conf = 0.9): Evidence => ({ id: id(), kind: "screenshot", addedAt: ts, ocrText: ocr, ocrConfidence: conf });
const verify = (bankName: string, sms: string): Evidence => ({
  id: id(),
  kind: "bank-verify",
  addedAt: ts,
  bank: findBankByName(bankName)!,
  confirmationSms: sms,
});

describe("normalizePhone", () => {
  it("canonicalizes local, +234 and bare forms", () => {
    expect(normalizePhone("08031234567")).toBe("2348031234567");
    expect(normalizePhone("+2348031234567")).toBe("2348031234567");
    expect(normalizePhone("2348031234567")).toBe("2348031234567");
    expect(normalizePhone("0803 123 4567")).toBe("2348031234567");
  });
  it("rejects too-short input", () => {
    expect(normalizePhone("12345")).toBeUndefined();
  });
});

describe("extractAmounts / parseAmount", () => {
  it("parses currency-prefixed amounts", () => {
    expect(extractAmounts("Sent N5,000.00 to Mary")).toEqual([5000]);
    expect(extractAmounts("₦3,000 received")).toEqual([3000]);
    expect(extractAmounts("NGN 12000 debit")).toEqual([12000]);
  });
  it("parses thousands-separated decimals without currency", () => {
    expect(extractAmounts("Amount: 1,250.00")).toEqual([1250]);
  });
  it("ignores account-number-like bare integers", () => {
    expect(extractAmounts("acct 0123456789")).toEqual([]);
  });
  it("parseAmount handles commas and rejects 0", () => {
    expect(parseAmount("5,000")).toBe(5000);
    expect(parseAmount("0")).toBeUndefined();
  });
});

describe("extractPhones", () => {
  it("finds Nigerian mobile numbers", () => {
    expect(extractPhones("From: 08031234567")).toEqual(["2348031234567"]);
    expect(extractPhones("call +2348031234567 now")).toEqual(["2348031234567"]);
  });
  it("ignores non-mobile / account-like numbers", () => {
    expect(extractPhones("account 0123456789")).toEqual([]);
  });
});

describe("extractDateEpoch", () => {
  it("parses ISO, DD Mon YYYY, and DD/MM/YYYY", () => {
    expect(extractDateEpoch("2026-11-01 alert")).toBe(Date.UTC(2026, 10, 1));
    expect(extractDateEpoch("01 Nov 2026 alert")).toBe(Date.UTC(2026, 10, 1));
    expect(extractDateEpoch("01/11/2026 alert")).toBe(Date.UTC(2026, 10, 1));
  });
  it("returns undefined when no date", () => {
    expect(extractDateEpoch("no date here")).toBeUndefined();
  });
});

describe("link helpers", () => {
  it("hostnameOf parses with and without scheme", () => {
    expect(hostnameOf("https://gtbank.com/login")).toBe("gtbank.com");
    expect(hostnameOf("evil.com")).toBe("evil.com");
    expect(hostnameOf("not a url")).toBeUndefined();
  });
  it("registrableLabel extracts the brand label", () => {
    expect(registrableLabel("www.gtbank.com")).toBe("gtbank");
    expect(registrableLabel("access-bank.co.ng")).toBe("access-bank");
    expect(registrableLabel("gtbank.com")).toBe("gtbank");
  });
  it("levenshtein distance", () => {
    expect(levenshtein("gtbnk", "gtbank")).toBe(1);
    expect(levenshtein("paypa1", "paypal")).toBe(1);
    expect(levenshtein("abc", "abc")).toBe(0);
  });
  it("lookalikeBrand flags impersonations but not the real brand", () => {
    expect(lookalikeBrand("gtbnk")).toBe("gtbank");
    expect(lookalikeBrand("paypa1")).toBe("paypal");
    expect(lookalikeBrand("gtbank")).toBeUndefined();
    expect(lookalikeBrand("google")).toBeUndefined();
  });
});

describe("text helpers", () => {
  it("hasPhishing flags urgency/phishing phrases", () => {
    expect(hasPhishing("URGENT: verify your account now")).toBe(true);
    expect(hasPhishing("send your OTP to confirm")).toBe(true);
    expect(hasPhishing("Hello, how are you?")).toBe(false);
  });
  it("extractSender + isSuspiciousSender", () => {
    expect(extractSender("From: PROMO\nYou won")).toBe("PROMO");
    expect(isSuspiciousSender("PROMO")).toBe(true);
    expect(isSuspiciousSender("GTBank")).toBe(false);
  });
});

describe("analyzePiece", () => {
  it("flags lookalike links as danger", () => {
    const f = analyzePiece(link("https://paypa1.com"), NOW);
    expect(f.some((x) => x.id === "link-lookalike" && x.severity === "danger")).toBe(true);
  });
  it("flags http and IP links as warn", () => {
    expect(analyzePiece(link("http://example.com"), NOW).some((x) => x.id === "link-http")).toBe(true);
    expect(analyzePiece(link("http://192.168.0.1/x"), NOW).some((x) => x.id === "link-ip")).toBe(true);
  });
  it("does not flag a real https bank domain", () => {
    const f = analyzePiece(link("https://gtbank.com"), NOW);
    expect(f).toEqual([]);
  });
  it("flags phishing keywords and spoofed sender in text", () => {
    const f = analyzePiece(text("From: ALERT\nURGENT: verify your account"), NOW);
    expect(f.some((x) => x.id === "phish-keywords")).toBe(true);
    expect(f.some((x) => x.id === "sender-spoof")).toBe(true);
  });
  it("flags future and stale alert dates", () => {
    expect(analyzePiece(shot("Credit 2099-01-01 N500"), NOW).some((x) => x.id === "date-future")).toBe(true);
    expect(analyzePiece(shot("Credit 2020-01-01 N500"), NOW).some((x) => x.id === "date-stale")).toBe(true);
  });
  it("bank-verify ok vs mismatch", () => {
    expect(analyzePiece(verify("GTBank", "GTBank: N5,000 successful"), NOW)[0].id).toBe("bank-verify-ok");
    expect(analyzePiece(verify("GTBank", "Access Bank: transfer done"), NOW)[0].id).toBe("bank-verify-mismatch");
    expect(analyzePiece(verify("GTBank", "random text"), NOW)[0].id).toBe("bank-verify-mismatch");
  });
});

describe("analyzeCross", () => {
  it("phone mismatch between screenshot and entered phone => danger", () => {
    const evs = [shot("From: 08031234567"), phone("08111111111")];
    expect(analyzeCross(evs).some((x) => x.id === "phone-mismatch" && x.severity === "danger")).toBe(true);
  });
  it("matching phone => no mismatch", () => {
    const evs = [shot("From: 08031234567"), phone("08031234567")];
    expect(analyzeCross(evs).some((x) => x.id === "phone-mismatch")).toBe(false);
  });
  it("bank mismatch between message and chosen bank => danger", () => {
    const evs = [shot("GTBank credit alert"), verify("Access Bank", "access ok")];
    expect(analyzeCross(evs).some((x) => x.id === "bank-mismatch")).toBe(true);
  });
  it("amount mismatch between screenshot and message => warn", () => {
    const evs = [shot("Credit N5,000.00"), text("You sent N3,000")];
    expect(analyzeCross(evs).some((x) => x.id === "amount-mismatch")).toBe(true);
  });
  it("matching amounts => no mismatch", () => {
    const evs = [shot("Credit N5,000"), text("You sent N5,000")];
    expect(analyzeCross(evs).some((x) => x.id === "amount-mismatch")).toBe(false);
  });
  it("link merchant mismatch => warn", () => {
    const evs = [text("GTBank transfer of N5,000"), link("https://access-bank.com")];
    expect(analyzeCross(evs).some((x) => x.id === "link-merchant-mismatch")).toBe(true);
  });
});

describe("score + computeVerdict", () => {
  it("empty evidence => clean, confidence 0", () => {
    const v = computeVerdict([], NOW);
    expect(v.level).toBe("clean");
    expect(v.confidence).toBe(0);
  });
  it("one danger => suspicious", () => {
    const v = computeVerdict([link("https://paypa1.com")], NOW);
    expect(v.confidence).toBe(0.4);
    expect(v.level).toBe("suspicious");
  });
  it("two dangers => scam", () => {
    const v = computeVerdict([link("https://paypa1.com"), shot("From: 08031234567"), phone("08111111111")], NOW);
    expect(v.confidence).toBe(0.8);
    expect(v.level).toBe("scam");
  });
  it("two warns => suspicious, one warn => clean", () => {
    expect(score([{ id: "w", severity: "warn", message: "x" }, { id: "w2", severity: "warn", message: "y" }])).toBeCloseTo(0.36, 5);
    expect(score([{ id: "w", severity: "warn", message: "x" }])).toBeCloseTo(0.18, 5);
  });
  it("bank-verify-ok offsets danger", () => {
    // danger 0.4 + ok info(-0.15) => 0.25 => clean
    const evs = [link("https://paypa1.com"), verify("GTBank", "GTBank N5000 successful")];
    const v = computeVerdict(evs, NOW);
    expect(v.confidence).toBe(0.25);
    expect(v.level).toBe("clean");
  });
  it("pieceFindings grouped by id, cross under __cross__", () => {
    const v = computeVerdict([shot("From: 08031234567"), phone("08111111111")], NOW);
    expect(v.pieceFindings["__cross__"]).toBeDefined();
  });
});
