import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeVerdict, score } from "../lib/rules";
import type { Evidence } from "../lib/types";
import { BANKS, findBankByName } from "../lib/banks";

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0); // fixed for determinism

// --- arbitraries -----------------------------------------------------------
let counter = 0;
const nextId = () => `e${counter++}`;

const urlArb = fc.constantFrom(
  "https://gtbank.com",
  "http://example.com",
  "https://paypa1.com",
  "https://access-bank.com",
  "https://192.168.0.1/x",
  "not a url",
  "https://opay.com",
);
const ocrArb = fc.constantFrom(
  "GTBank N5,000.00 From: 08031234567",
  "Access Bank credit N3,000",
  "From: 08039988776",
  "Credit 2099-01-01 N500",
  "no info here",
  "GTBank N1,000 From: 08031234567 01 Nov 2026",
);
const textRawArb = fc.constantFrom(
  "GTBank: N5,000 credited",
  "URGENT: verify your account",
  "From: PROMO you won N10,000",
  "You sent N3,000",
  "hello how are you",
  "send your OTP now",
);
const phoneStrArb = fc.constantFrom("08031234567", "08111111111", "08039988776", "09021234567");
const bankArb = fc.constantFrom(...BANKS);
const smsArb = fc.constantFrom(
  "GTBank N5000 successful",
  "Access Bank transfer done",
  "random text",
  "FCMB credit",
  "OPay completed",
);

const linkEv = (url: string): Evidence => ({ id: nextId(), kind: "link", addedAt: 1, url });
const textEv = (raw: string): Evidence => ({ id: nextId(), kind: "text", addedAt: 1, raw });
const shotEv = (ocr: string): Evidence => ({ id: nextId(), kind: "screenshot", addedAt: 1, ocrText: ocr, ocrConfidence: 0.9 });
const phoneEv = (p: string): Evidence => ({ id: nextId(), kind: "phone", addedAt: 1, phone: p });
const verifyEv = (bankName: string, sms: string): Evidence => ({
  id: nextId(),
  kind: "bank-verify",
  addedAt: 1,
  bank: findBankByName(bankName)!,
  confirmationSms: sms,
});

// evidence excluding phone (used for monotonicity base sets)
const nonPhoneEvidenceArb: fc.Arbitrary<Evidence> = fc.oneof(
  urlArb.map(linkEv),
  textRawArb.map(textEv),
  ocrArb.map(shotEv),
  fc.tuple(bankArb, smsArb).map(([b, s]) => verifyEv(b.name, s)),
);
const evidenceArb: fc.Arbitrary<Evidence> = fc.oneof(
  nonPhoneEvidenceArb,
  phoneStrArb.map(phoneEv),
);

const RUNS = 250;

describe("rules engine — properties", () => {
  it("is deterministic (same input => same verdict)", () => {
    fc.assert(
      fc.property(fc.array(evidenceArb, { maxLength: 6 }), (evs) => {
        const a = computeVerdict(evs, NOW);
        const b = computeVerdict(structuredClone(evs), NOW);
        return JSON.stringify(a) === JSON.stringify(b);
      }),
      { numRuns: RUNS },
    );
  });

  it("always yields a valid level + risk, no percentage field, and unique evidence IDs", () => {
    fc.assert(
      fc.property(fc.array(evidenceArb, { maxLength: 8 }), (evs) => {
        const v = computeVerdict(evs, NOW);
        const levelOk = ["VERIFIED", "LIKELY_FAKE", "SUSPICIOUS", "UNVERIFIED"].includes(v.level);
        const riskOk = ["LOW", "MODERATE", "HIGH", "CRITICAL"].includes(v.risk);
        const noPct = !("confidence" in v) && !/\d\s?%/.test(v.explanation);
        const ids = [...v.findings.map((f) => f.evidenceId), ...v.checks.map((c) => c.evidenceId)];
        const idsOk = ids.every((i) => /^EV-\d{3,}$/.test(i ?? "")) && new Set(ids).size === ids.length;
        return levelOk && riskOk && noPct && idsOk;
      }),
      { numRuns: RUNS },
    );
  });

  it("adding a contradicting phone never decreases the internal flag weight", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.constantFrom("08031234567", "08039988776", "09021234567"),
          fc.constantFrom("08111111111", "07099988776", "09090000099"),
          fc.array(nonPhoneEvidenceArb, { maxLength: 4 }),
        ),
        ([present, added, rest]) => {
          const base = [...rest, shotEv(`From: ${present}`)];
          const c0 = score(computeVerdict(base, NOW).findings);
          const c1 = score(computeVerdict([...base, phoneEv(added)], NOW).findings);
          return c1 >= c0;
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("a fully consistent set with an independent bank confirmation is VERIFIED", () => {
    const consistent: Evidence[] = [
      shotEv("GTBank\nFrom: 08031234567\nCredit N5,000.00\n01 Nov 2026"),
      textEv("GTBank: N5,000 credited to your account"),
      phoneEv("08031234567"),
      linkEv("https://gtbank.com"),
      verifyEv("GTBank", "From: GTBank\nGTBank: N5,000 transfer successful"),
    ];
    const v = computeVerdict(consistent, NOW);
    expect(v.level).toBe("VERIFIED");
    expect(v.risk).toBe("LOW");
    // only non-flag (info) findings: the strongly confirmed bank SMS
    expect(v.findings.every((f) => f.id === "bank-verify-ok")).toBe(true);
    expect(v.checks.length).toBeGreaterThan(0);
  });

  it("never reports VERIFIED without an independent passed check, or alongside any flag", () => {
    fc.assert(
      fc.property(fc.array(evidenceArb, { maxLength: 8 }), (evs) => {
        const v = computeVerdict(evs, NOW);
        return (
          v.level !== "VERIFIED" ||
          (v.checks.some((c) => c.independent) && v.findings.every((f) => f.severity === "info") && v.risk === "LOW")
        );
      }),
      { numRuns: RUNS },
    );
  });
});
