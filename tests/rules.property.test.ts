import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeVerdict } from "../lib/rules";
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

  it("always yields a valid level and confidence in [0,1] (2-decimal)", () => {
    fc.assert(
      fc.property(fc.array(evidenceArb, { maxLength: 8 }), (evs) => {
        const v = computeVerdict(evs, NOW);
        const levelOk = v.level === "clean" || v.level === "suspicious" || v.level === "scam";
        const confOk = v.confidence >= 0 && v.confidence <= 1;
        // robust 2-decimal check (avoids float artifacts like 0.58*100 === 57.999…)
        const rounded = Math.round(v.confidence * 100) / 100 === v.confidence;
        return levelOk && confOk && rounded;
      }),
      { numRuns: RUNS },
    );
  });

  it("adding a contradicting phone never decreases confidence", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.constantFrom("08031234567", "08039988776", "09021234567"),
          fc.constantFrom("08111111111", "07099988776", "09090000099"),
          fc.array(nonPhoneEvidenceArb, { maxLength: 4 }),
        ),
        ([present, added, rest]) => {
          const base = [...rest, shotEv(`From: ${present}`)];
          const c0 = computeVerdict(base, NOW).confidence;
          const c1 = computeVerdict([...base, phoneEv(added)], NOW).confidence;
          return c1 >= c0;
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("a fully consistent, legit-looking set stays clean", () => {
    const consistent: Evidence[] = [
      shotEv("GTBank\nFrom: 08031234567\nCredit N5,000.00\n01 Nov 2026"),
      textEv("GTBank: N5,000 credited to your account"),
      phoneEv("08031234567"),
      linkEv("https://gtbank.com"),
      verifyEv("GTBank", "GTBank: N5,000 transfer successful"),
    ];
    const v = computeVerdict(consistent, NOW);
    expect(v.level).toBe("clean");
    expect(v.confidence).toBe(0);
    // the only finding should be the legit bank-verify-ok
    expect(v.findings.every((f) => f.id === "bank-verify-ok")).toBe(true);
  });
});
