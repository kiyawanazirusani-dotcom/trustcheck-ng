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
  it("bank-verify: piece rule only flags mismatches; naming the bank is no longer trust", () => {
    expect(analyzePiece(verify("GTBank", "GTBank: N5,000 successful"), NOW)).toEqual([]);
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
  it("empty evidence => cannot verify, confidence 0", () => {
    const v = computeVerdict([], NOW);
    expect(v.level).toBe("unverifiable");
    expect(v.confidence).toBe(0);
  });
  it("one danger => suspicious", () => {
    const v = computeVerdict([shot("From: 08031234567"), phone("08111111111")], NOW);
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
  it("a strongly confirmed bank SMS offsets danger", () => {
    // danger 0.4 + confirmed bank SMS (-0.15) => 0.25 raw, floored to 0.3
    const evs = [
      shot("From: 08031234567\nCredit N5,000"),
      phone("08111111111"),
      verify("GTBank", "From: GTBank\nGTBank N5,000 successful"),
    ];
    const v = computeVerdict(evs, NOW);
    expect(v.findings.some((f) => f.id === "bank-verify-ok")).toBe(true);
    expect(v.confidence).toBe(0.3); // a danger flag is never "clean"
    expect(v.level).toBe("suspicious");
  });
  it("a bank-impersonating link is scam even with a good bank-verify", () => {
    const v = computeVerdict([link("https://paypa1.com"), verify("GTBank", "GTBank N5000 successful")], NOW);
    expect(v.level).toBe("scam");
  });
  it("pieceFindings grouped by id, cross under __cross__", () => {
    const v = computeVerdict([shot("From: 08031234567"), phone("08111111111")], NOW);
    expect(v.pieceFindings["__cross__"]).toBeDefined();
  });
});

describe("bank-impersonation scam (gtb-verify.xyz)", () => {
  const scamText = "Your account has been credited with N50,000. Click http://gtb-verify.xyz to confirm.";
  const scamLink = "http://gtb-verify.xyz";

  it("flags the text as click-to-confirm-credit and impersonating link", () => {
    const f = analyzePiece(text(scamText), NOW).map((x) => x.id);
    expect(f).toContain("text-click-confirm-credit");
    expect(f).toContain("text-link-impersonation");
  });

  it("flags the link as non-official bank domain, odd TLD and phishing word", () => {
    const f = analyzePiece(link(scamLink), NOW).map((x) => x.id);
    expect(f).toContain("link-bank-impersonation");
    expect(f).toContain("link-odd-tld");
    expect(f).toContain("link-phish-words");
    expect(f).toContain("link-http");
  });

  it("verdict is scam for both pieces together, and for each alone", () => {
    const both = computeVerdict([text(scamText), link(scamLink)], NOW);
    expect(both.level).toBe("scam");
    expect(both.confidence).toBeGreaterThanOrEqual(0.7);
    expect(computeVerdict([text(scamText)], NOW).level).toBe("scam");
    expect(computeVerdict([link(scamLink)], NOW).level).toBe("scam");
  });

  it("a lone warn flag is never reported as clean", () => {
    expect(computeVerdict([link("http://example.com")], NOW).level).toBe("suspicious");
  });
});

describe("normal real alert", () => {
  const real = "GTBank: Acct 012***789 Credit Amt: NGN 50,000.00 Desc: Transfer from ADE OKAFOR Bal: NGN 120,500.00";
  it("raises no flags, but a lone alert has nothing checkable => cannot verify (not green)", () => {
    expect(analyzePiece(text(real), NOW)).toEqual([]);
    const v = computeVerdict([text(real)], NOW);
    expect(v.findings).toHaveLength(0);
    expect(v.level).toBe("unverifiable");
  });
  it("official bank domains are not flagged; with an https official link a real check passed => clean", () => {
    for (const u of ["https://gtbank.com", "https://www.gtbank.com/online", "https://ibank.gtbank.com", "https://www.zenithbank.com"]) {
      expect(analyzePiece(link(u), NOW)).toEqual([]);
    }
    const v = computeVerdict([text(real), link("https://www.gtbank.com")], NOW);
    expect(v.level).toBe("clean");
    expect(v.checks.map((c) => c.id)).toContain("link-official");
  });
});

describe("1. screenshot (OCR) text goes through the same scam rules", () => {
  const scamOcr = "Your account has been credited with N50,000. Click http://gtb-verify.xyz to confirm.";
  it("flags OCR text and the links inside it", () => {
    const ids = analyzePiece(shot(scamOcr), NOW).map((x) => x.id);
    expect(ids).toContain("text-click-confirm-credit");
    expect(ids).toContain("text-link-impersonation");
    expect(ids).toContain("link-odd-tld");
    expect(ids).toContain("link-http");
  });
  it("flags phishing language and spoofed sender in OCR text", () => {
    const ids = analyzePiece(shot("From: PROMO\nURGENT: verify your account"), NOW).map((x) => x.id);
    expect(ids).toContain("phish-keywords");
    expect(ids).toContain("sender-spoof");
  });
  it("shows the flags on the screenshot patch and makes the verdict a scam", () => {
    const s = shot(scamOcr);
    const v = computeVerdict([s], NOW);
    expect(v.level).toBe("scam");
    expect(v.pieceFindings[s.id].some((f) => f.id === "text-link-impersonation")).toBe(true);
  });
  it("a genuine alert in a screenshot raises no new flags", () => {
    expect(analyzePiece(shot("GTBank Credit Alert N5,000.00 Bal N9,000.00"), NOW)).toEqual([]);
  });
});

describe("2. shortened links", () => {
  it.each(["https://bit.ly/3abc", "http://tinyurl.com/x", "https://t.co/abc", "bit.ly/abc", "https://is.gd/q"])(
    "warns that the destination is hidden: %s",
    (u) => {
      const f = analyzePiece(link(u), NOW).find((x) => x.id === "link-shortener");
      expect(f?.severity).toBe("warn");
      expect(f?.message).toMatch(/destination is hidden/i);
      expect(computeVerdict([link(u)], NOW).level).toBe("suspicious");
    },
  );
  it("also warns about shortened links inside pasted text and OCR text", () => {
    expect(analyzePiece(text("Claim your refund: bit.ly/abc123 now"), NOW).some((x) => x.id === "link-shortener")).toBe(true);
    expect(analyzePiece(shot("Open https://tinyurl.com/zz to confirm"), NOW).some((x) => x.id === "link-shortener")).toBe(true);
  });
  it("does not flag look-alike non-shortener hosts", () => {
    expect(analyzePiece(link("https://orbit.ly.example.com"), NOW).some((x) => x.id === "link-shortener")).toBe(false);
  });
});

describe("3. cannot verify vs clean", () => {
  it("a phone number alone is 'unverifiable', not clean", () => {
    const v = computeVerdict([phone("08031234567")], NOW);
    expect(v.level).toBe("unverifiable");
    expect(v.checks).toEqual([]);
  });
  it("a plain link with no checkable signals is 'unverifiable'", () => {
    expect(computeVerdict([link("https://example.com")], NOW).level).toBe("unverifiable");
  });
  it("clean needs a real passed check (matching phone + alert)", () => {
    const v = computeVerdict([shot("GTBank\nFrom: 08031234567\nCredit N5,000"), phone("08031234567")], NOW);
    expect(v.level).toBe("clean");
    expect(v.checks.map((c) => c.id)).toContain("phone-match");
  });
  it("flags still win over 'unverifiable'", () => {
    expect(computeVerdict([link("http://example.com")], NOW).level).toBe("suspicious");
  });
});

describe("4. weak 'mentions the bank' is no longer a trust signal", () => {
  const alert = text("Credit alert: N5,000 received");
  it("naming the bank alone is not verified and not green", () => {
    const evs = [alert, verify("GTBank", "GTBank: N5,000 transfer successful")];
    const v = computeVerdict(evs, NOW);
    expect(v.findings.some((f) => f.id === "bank-verify-ok")).toBe(false);
    expect(v.findings.some((f) => f.id === "bank-verify-unconfirmed")).toBe(true);
    expect(v.checks.map((c) => c.id)).not.toContain("bank-verify-ok");
  });
  it("a bank SMS alone (no alert amount to compare) is not verified => cannot verify", () => {
    const v = computeVerdict([verify("GTBank", "From: GTBank\nN5,000 successful")], NOW);
    expect(v.findings.some((f) => f.id === "bank-verify-ok")).toBe(false);
    expect(v.level).toBe("unverifiable");
  });
  it("sender format OK but amount missing from the alert side => not verified", () => {
    const v = computeVerdict([text("hello"), verify("GTBank", "From: GTBank\nN5,000 successful")], NOW);
    expect(v.findings.some((f) => f.id === "bank-verify-ok")).toBe(false);
  });
  it("amount matches but sender line is missing => not verified", () => {
    const v = computeVerdict([alert, verify("GTBank", "GTBank N5,000 successful")], NOW);
    expect(v.findings.some((f) => f.id === "bank-verify-ok")).toBe(false);
  });
  it("amount matches but sender is a different bank / spoofed mask => not verified", () => {
    for (const s of ["From: Access Bank", "From: PROMO", "From: 08031234567"]) {
      const v = computeVerdict([alert, verify("GTBank", `${s}\nGTBank N5,000 successful`)], NOW);
      expect(v.findings.some((f) => f.id === "bank-verify-ok")).toBe(false);
    }
  });
  it("expected sender + matching alert amount => verified, a real check, and clean", () => {
    const v = computeVerdict([alert, verify("GTBank", "From: GTBank\nGTBank: N5,000 transfer successful")], NOW);
    expect(v.findings.some((f) => f.id === "bank-verify-ok")).toBe(true);
    expect(v.checks.map((c) => c.id)).toContain("bank-verify-ok");
    expect(v.level).toBe("clean");
  });
});

describe("5. cross-checking amounts and account digits", () => {
  const alertShot = () => shot("GTBank Credit Alert\nAmt: N50,000.00\nFrom: GTBank");
  const bankSms = () => verify("GTBank", "From: GTBank\nGTBank: N5,000 transfer successful");

  it("N50,000 alert vs N5,000 bank SMS => red 'Amounts do not match' on BOTH patches, verdict raised", () => {
    const s = alertShot();
    const b = bankSms();
    const v = computeVerdict([s, b], NOW);
    const f = v.findings.find((x) => x.id === "amount-mismatch");
    expect(f?.severity).toBe("danger");
    expect(f?.message).toMatch(/^Amounts do not match/);
    expect(f?.message).toContain("₦50,000");
    expect(f?.message).toContain("₦5,000");
    expect(v.pieceFindings[s.id].some((x) => x.id === "amount-mismatch")).toBe(true);
    expect(v.pieceFindings[b.id].some((x) => x.id === "amount-mismatch")).toBe(true);
    expect(v.level).toBe("scam");
    expect(v.findings.some((x) => x.id === "bank-verify-ok")).toBe(false);
  });
  it("same mismatch works for pasted text vs bank SMS", () => {
    const t = text("You have received N50,000");
    const b = bankSms();
    const v = computeVerdict([t, b], NOW);
    expect(v.pieceFindings[t.id].some((x) => x.id === "amount-mismatch")).toBe(true);
    expect(v.pieceFindings[b.id].some((x) => x.id === "amount-mismatch")).toBe(true);
    expect(v.level).toBe("scam");
  });
  it("matching amounts => no mismatch and an amount-match check", () => {
    const v = computeVerdict([shot("Credit N5,000 GTBank"), bankSms()], NOW);
    expect(v.findings.some((x) => x.id === "amount-mismatch")).toBe(false);
    expect(v.checks.map((c) => c.id)).toContain("amount-match");
  });
  it("screenshot vs text mismatch still flags (warn) on both patches", () => {
    const s = shot("Credit N5,000.00");
    const t = text("You sent N3,000");
    const v = computeVerdict([s, t], NOW);
    expect(v.pieceFindings[s.id].some((x) => x.id === "amount-mismatch")).toBe(true);
    expect(v.pieceFindings[t.id].some((x) => x.id === "amount-mismatch")).toBe(true);
  });
  it("account digits that differ => red 'Account digits do not match' on both patches", () => {
    const s = shot("GTBank Credit N5,000 Acct 0123456789");
    const b = verify("GTBank", "From: GTBank\nGTBank N5,000 successful Acct 0987654321");
    const v = computeVerdict([s, b], NOW);
    const f = v.findings.find((x) => x.id === "account-mismatch");
    expect(f?.severity).toBe("danger");
    expect(f?.message).toMatch(/^Account digits do not match/);
    expect(v.pieceFindings[s.id].some((x) => x.id === "account-mismatch")).toBe(true);
    expect(v.pieceFindings[b.id].some((x) => x.id === "account-mismatch")).toBe(true);
    expect(v.level).toBe("scam");
  });
  it("masked account digits are compared on the visible digits", () => {
    const ok = computeVerdict([shot("Credit N5,000 Acct 012***789"), verify("GTBank", "From: GTBank\nN5,000 GTBank Acct 0123456789")], NOW);
    expect(ok.findings.some((x) => x.id === "account-mismatch")).toBe(false);
    expect(ok.checks.map((c) => c.id)).toContain("account-match");
    const bad = computeVerdict([shot("Credit N5,000 Acct 012***789"), verify("GTBank", "From: GTBank\nN5,000 GTBank Acct 0123456780")], NOW);
    expect(bad.findings.some((x) => x.id === "account-mismatch")).toBe(true);
  });
  it("no account digits on one side => no account flag", () => {
    const v = computeVerdict([shot("Credit N5,000 Acct 0123456789"), bankSms()], NOW);
    expect(v.findings.some((x) => x.id === "account-mismatch")).toBe(false);
  });
});
