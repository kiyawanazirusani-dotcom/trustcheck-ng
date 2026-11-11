import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeVerdict } from "../lib/rules";
import type { Evidence, VerdictLevel } from "../lib/types";
import { findBankByName } from "../lib/banks";
import { VERDICT_LABEL_EN, VERDICT_LABEL_HA } from "../lib/labels";

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);

let n = 0;
const id = () => `p${n++}`;
const shot = (ocr: string): Evidence => ({ id: id(), kind: "screenshot", addedAt: 1, ocrText: ocr, ocrConfidence: 0.99 });
const text = (raw: string): Evidence => ({ id: id(), kind: "text", addedAt: 1, raw });
const link = (url: string): Evidence => ({ id: id(), kind: "link", addedAt: 1, url });
const phone = (p: string): Evidence => ({ id: id(), kind: "phone", addedAt: 1, phone: p });
const balance = (b: number): Evidence => ({ id: id(), kind: "balance", addedAt: 1, balance: b });
const bankSms = (bank: string, sms: string): Evidence => ({
  id: id(),
  kind: "bank-verify",
  addedAt: 1,
  bank: findBankByName(bank)!,
  confirmationSms: sms,
});

const CLEAN_ALERT = "GTBank Credit Alert Amt: N5,000.00 Bal: NGN 120,500.00 From: GTBank";

describe("verdict names + Hausa labels", () => {
  it("exposes the four English names", () => {
    expect(VERDICT_LABEL_EN).toEqual({
      VERIFIED: "VERIFIED",
      LIKELY_FAKE: "LIKELY FAKE",
      SUSPICIOUS: "SUSPICIOUS",
      UNVERIFIED: "UNVERIFIED",
    });
  });
  it("uses the exact required Hausa wording", () => {
    expect(VERDICT_LABEL_HA.UNVERIFIED).toBe("Ba a samu sahihin tabbaci mai zaman kansa ba");
    expect(VERDICT_LABEL_HA.SUSPICIOUS).toBe("An gano alamomi masu nuna yiwuwar zamba");
    expect(VERDICT_LABEL_HA.LIKELY_FAKE).toBe("Akwai hujjoji masu ƙarfi da ke nuna cewa wannan na iya zama na bogi");
    expect(VERDICT_LABEL_HA.VERIFIED).toBe("An samu sahihin tabbaci daga wata majiya mai zaman kanta");
  });
});

describe("a screenshot alone can never be VERIFIED", () => {
  it.each([
    CLEAN_ALERT,
    "GTBank Credit Alert N5,000.00",
    "Credit N50,000 Acct 012***789 Bal N9,000 01 Nov 2026",
    "",
  ])("screenshot %j => UNVERIFIED, not LOW risk", (ocr) => {
    const v = computeVerdict([shot(ocr)], NOW);
    expect(v.level).not.toBe("VERIFIED");
    expect(v.level).toBe("UNVERIFIED");
    expect(v.risk).not.toBe("LOW");
    expect(v.checks.some((c) => c.independent)).toBe(false);
  });

  it("property: any set of screenshots (even several, even agreeing) is never VERIFIED", () => {
    const ocrArb = fc.constantFrom(CLEAN_ALERT, "GTBank N1,000 Bal N500", "Access Bank credit N3,000", "no info", "");
    fc.assert(
      fc.property(fc.array(ocrArb, { minLength: 1, maxLength: 5 }), (ocrs) => {
        const v = computeVerdict(ocrs.map(shot), NOW);
        return v.level !== "VERIFIED" && v.risk !== "LOW";
      }),
      { numRuns: 100 },
    );
  });

  it("a screenshot plus agreeing text/phone (all unverifiable claims) is still not VERIFIED", () => {
    const v = computeVerdict([shot(CLEAN_ALERT + " 08031234567"), text("GTBank credit N5,000"), phone("08031234567")], NOW);
    expect(v.level).toBe("UNVERIFIED");
  });
});

describe("HTTPS alone can never be VERIFIED", () => {
  it.each(["https://www.gtbank.com", "https://gtbank.com/online", "https://ibank.gtbank.com", "https://example.com", "https://www.zenithbank.com"])(
    "%s => UNVERIFIED, not LOW risk",
    (u) => {
      const v = computeVerdict([link(u)], NOW);
      expect(v.level).toBe("UNVERIFIED");
      expect(v.risk).not.toBe("LOW");
      expect(v.checks.some((c) => c.independent)).toBe(false);
    },
  );

  it("an official https link next to an alert is supporting only", () => {
    const v = computeVerdict([shot(CLEAN_ALERT), link("https://www.gtbank.com")], NOW);
    expect(v.checks.map((c) => c.id)).toContain("link-official");
    expect(v.level).toBe("UNVERIFIED");
  });

  it("a secure-looking link that impersonates a bank is LIKELY_FAKE, https does not help", () => {
    expect(computeVerdict([link("https://gtb-verify.xyz")], NOW).level).toBe("LIKELY_FAKE");
  });
});

describe("no reports / no red flags never means safe", () => {
  it("evidence with zero findings is UNVERIFIED, never VERIFIED or LOW", () => {
    const v = computeVerdict([text("hello, how are you"), link("https://example.org"), phone("08031234567")], NOW);
    expect(v.findings).toEqual([]);
    expect(v.level).toBe("UNVERIFIED");
    expect(v.risk).not.toBe("LOW");
    expect(v.explanation).toMatch(/not.*(safe|same as safe)/i);
  });

  it("empty input is UNVERIFIED", () => {
    const v = computeVerdict([], NOW);
    expect(v.level).toBe("UNVERIFIED");
    expect(v.risk).not.toBe("LOW");
  });

  it("the report always states that absence of reports/flags is not safety", () => {
    const v = computeVerdict([phone("08031234567")], NOW);
    expect(v.report.limitations.join(" ")).toMatch(/no warning signs found is not proof/i);
    expect(v.report.limitations.join(" ")).toMatch(/no reports is not safe|with no reports is not safe/i);
  });

  it("property: a verdict with no findings and no independent check is never VERIFIED", () => {
    const evArb = fc.constantFrom(
      text("hello"),
      link("https://example.org"),
      link("https://www.gtbank.com"),
      phone("08031234567"),
      shot(CLEAN_ALERT),
    );
    fc.assert(
      fc.property(fc.array(evArb, { maxLength: 5 }), (evs) => {
        const v = computeVerdict(evs, NOW);
        return v.level === "UNVERIFIED" && v.risk !== "LOW";
      }),
      { numRuns: 100 },
    );
  });
});

describe("a failed or unavailable check never looks clean", () => {
  const alert = text("Credit alert: N5,000 received. Bal: N120,500");

  it("failed bank confirmation: amount contradicts the alert => not VERIFIED, high risk", () => {
    const v = computeVerdict([text("Credit alert: N50,000 received"), bankSms("GTBank", "From: GTBank\nGTBank: N5,000 transfer successful")], NOW);
    expect(v.level).toBe("LIKELY_FAKE");
    expect(v.risk === "HIGH" || v.risk === "CRITICAL").toBe(true);
    expect(v.checks.some((c) => c.independent)).toBe(false);
    expect(v.report.contradictions.length).toBeGreaterThan(0);
  });

  it("failed bank confirmation: wrong bank named => not VERIFIED", () => {
    const v = computeVerdict([alert, bankSms("GTBank", "Access Bank: N5,000 successful")], NOW);
    expect(v.level).not.toBe("VERIFIED");
    expect(v.risk).not.toBe("LOW");
  });

  it("unavailable/inconclusive bank confirmation (no sender line) => UNVERIFIED with missing info", () => {
    const v = computeVerdict([alert, bankSms("GTBank", "GTBank N5,000 successful")], NOW);
    expect(v.level).toBe("UNVERIFIED");
    expect(v.risk).not.toBe("LOW");
    expect(v.report.missingInformation.join(" ")).toMatch(/does not yet prove/i);
  });

  it("bank confirmation with nothing to compare against => UNVERIFIED", () => {
    const v = computeVerdict([bankSms("GTBank", "From: GTBank\nN5,000 successful")], NOW);
    expect(v.level).toBe("UNVERIFIED");
  });

  it("failed balance check: balance differs from the alert => not VERIFIED", () => {
    const v = computeVerdict([alert, balance(9_999)], NOW);
    expect(v.level).toBe("SUSPICIOUS");
    expect(v.risk).not.toBe("LOW");
    expect(v.findings.some((f) => f.id === "balance-mismatch")).toBe(true);
    expect(v.checks.some((c) => c.id === "balance-match")).toBe(false);
  });

  it("unavailable balance check: alert has no balance to compare => UNVERIFIED", () => {
    const v = computeVerdict([text("Credit alert: N5,000 received"), balance(120_500)], NOW);
    expect(v.level).toBe("UNVERIFIED");
    expect(v.report.missingInformation.join(" ")).toMatch(/shows no balance/i);
  });

  it("a passed independent check does not hide a contradiction", () => {
    const v = computeVerdict(
      [text("Credit alert: N5,000 received. Bal: N120,500. From 08031234567"), balance(120_500), phone("08111111111")],
      NOW,
    );
    expect(v.checks.map((c) => c.id)).toContain("balance-match");
    expect(v.level).toBe("SUSPICIOUS");
  });
});

describe("VERIFIED requires an independent check", () => {
  it("matching bank confirmation => VERIFIED / LOW", () => {
    const v = computeVerdict([text("Credit alert: N5,000 received"), bankSms("GTBank", "From: GTBank\nGTBank: N5,000 transfer successful")], NOW);
    expect(v.level).toBe("VERIFIED");
    expect(v.risk).toBe("LOW");
  });

  it("user-entered balance equal to the alert balance => VERIFIED / LOW", () => {
    const v = computeVerdict([text("Credit alert: N5,000 received. Bal: NGN 120,500.00"), balance(120_500)], NOW);
    expect(v.level).toBe("VERIFIED");
    expect(v.risk).toBe("LOW");
    expect(v.checks.find((c) => c.id === "balance-match")?.independent).toBe(true);
  });

  it("balance entered as a screenshot alert works too", () => {
    const v = computeVerdict([shot(CLEAN_ALERT), balance(120_500)], NOW);
    expect(v.level).toBe("VERIFIED");
  });

  it("an independent check cannot override a scam link", () => {
    const v = computeVerdict([text("Credit N5,000. Bal: N120,500"), balance(120_500), link("http://gtb-verify.xyz")], NOW);
    expect(v.level).toBe("LIKELY_FAKE");
  });
});

describe("evidence IDs and report", () => {
  const evs = [
    text("Credit alert: N50,000 received. Click http://gtb-verify.xyz to confirm. Bal: N9,000"),
    bankSms("GTBank", "From: GTBank\nGTBank: N5,000 transfer successful"),
    balance(9_000),
  ];

  it("every finding and check has a unique EV-nnn ID, shared with piece findings", () => {
    const v = computeVerdict(evs, NOW);
    const ids = [...v.findings.map((f) => f.evidenceId), ...v.checks.map((c) => c.evidenceId)];
    expect(ids.length).toBeGreaterThan(0);
    for (const i of ids) expect(i).toMatch(/^EV-\d{3}$/);
    expect(new Set(ids).size).toBe(ids.length);
    for (const list of Object.values(v.pieceFindings)) {
      for (const f of list) expect(f.evidenceId).toBeDefined();
    }
  });

  it("IDs are stable for the same input", () => {
    const a = computeVerdict(evs, NOW);
    const b = computeVerdict(structuredClone(evs), NOW);
    expect(a.findings.map((f) => [f.id, f.evidenceId])).toEqual(b.findings.map((f) => [f.id, f.evidenceId]));
  });

  it("report has examined evidence, methods, contradictions, missing info, limitations, actions and a timestamp", () => {
    const v = computeVerdict(evs, NOW);
    const r = v.report;
    expect(r.generatedAt).toBe(NOW);
    expect(r.generatedAtIso).toBe(new Date(NOW).toISOString());
    expect(r.evidenceExamined).toHaveLength(3);
    expect(r.methods.length).toBeGreaterThan(0);
    expect(r.contradictions.length).toBeGreaterThan(0);
    for (const c of r.contradictions) expect(c.evidenceId).toMatch(/^EV-\d{3}$/);
    expect(r.limitations.length).toBeGreaterThan(0);
    expect(r.recommendedActions.length).toBeGreaterThan(0);
    expect(Array.isArray(r.missingInformation)).toBe(true);
  });

  it("missing information is listed when nothing independent was provided", () => {
    const r = computeVerdict([text("Credit alert: N5,000")], NOW).report;
    expect(r.missingInformation.join(" ")).toMatch(/confirmation SMS/i);
    expect(r.missingInformation.join(" ")).toMatch(/balance/i);
  });

  it("explanation is plain language with no percentage numbers", () => {
    for (const e of [[], evs, [shot(CLEAN_ALERT), balance(120_500)]] as Evidence[][]) {
      const v = computeVerdict(e, NOW);
      expect(v.explanation.length).toBeGreaterThan(10);
      expect(v.explanation).not.toMatch(/\d\s?%/);
      expect("confidence" in v).toBe(false);
    }
  });
});

describe("risk levels", () => {
  it("maps verdicts onto the four risk levels sensibly", () => {
    const seen = new Map<VerdictLevel, string>();
    seen.set("UNVERIFIED", computeVerdict([phone("08031234567")], NOW).risk);
    seen.set("SUSPICIOUS", computeVerdict([link("http://example.com")], NOW).risk);
    seen.set("LIKELY_FAKE", computeVerdict([link("http://gtb-verify.xyz"), link("https://paypa1.com")], NOW).risk);
    seen.set("VERIFIED", computeVerdict([shot(CLEAN_ALERT), balance(120_500)], NOW).risk);
    expect(seen.get("VERIFIED")).toBe("LOW");
    expect(seen.get("UNVERIFIED")).toBe("MODERATE");
    expect(seen.get("SUSPICIOUS")).toBe("MODERATE");
    expect(seen.get("LIKELY_FAKE")).toBe("CRITICAL");
  });
  it("a danger-level suspicion is HIGH", () => {
    expect(computeVerdict([shot("From: 08031234567"), phone("08111111111")], NOW).risk).toBe("HIGH");
  });
});
