# TrustCheck NG — Implementation Status

Status values: NOT STARTED, IN PROGRESS, IMPLEMENTED, TESTED, BLOCKED.

## Stage P0 — Foundation (audit, startup, type safety, security baseline)

Date: 2026-11-10. Status: **TESTED** (for the checks listed below only).

### Architecture (as found)
- Next.js 16.4.3 App Router, React 19, TypeScript strict, Tailwind 3, pnpm.
- `lib/rules.ts` pure rules engine; `lib/ocr.ts` tesseract.js; `lib/banks.ts` bank/USSD data;
  `lib/tts.ts`, `lib/online.ts`, `lib/gemini.client.ts` (client wrapper).
- `app/api/explain/route.ts` the only server route (Gemini, key from `process.env`, server-side).
- PWA: `public/manifest.webmanifest`, `public/sw.js`, registered by `ServiceWorkerRegister`.
- Kiro: steering (4 files), spec (requirements/design/tasks), 3 protective hooks.
- No auth, no database (by design; evidence is in-memory only).

### Commands run and actual results
| Command | Result |
|---|---|
| `pnpm lint` | pass, no output errors |
| `pnpm typecheck` (`tsc --noEmit`) | pass |
| `pnpm test:run` | 6 files, 96 tests, all pass |
| `pnpm build` | pass; routes `/`, `/_not-found`, `/api/explain` |
| `pnpm audit --prod` | no known vulnerabilities |
| `pnpm start -p 3111` + curl | `/` 200, `/sw.js` 200, `/manifest.webmanifest` 200, `POST /api/explain` 503 without key (expected) |

Not verified: real browser rendering, mobile layout, offline/PWA install, OCR in a browser,
live Gemini call (no key), Codespaces port forwarding.

### Defects found / repaired
- None blocking: lint, types, tests and build were green before any change.
- MEDIUM (fixed): `/api/explain` had no request-size cap and no model timeout.
  Added a 16,000-character body limit (HTTP 413) and a 20 s timeout (returns 502).
  The existing 4 route tests still pass; the new 413/timeout paths have **no dedicated tests yet**.

### Files changed
- Modified: `app/api/explain/route.ts`
- Created: `docs/IMPLEMENTATION_STATUS.md`

### Findings / remaining limitations (not addressed in P0)
- MEDIUM: no rate limiting on `/api/explain`; no security headers (CSP etc.) in `next.config.ts`.
- MEDIUM: AI prompt interpolates user-derived finding text (prompt-injection exposure); output is
  parsed but not schema-validated beyond `en`/`ha` strings.
- MEDIUM: verdict model is `clean | unverifiable | suspicious | scam` with percentage confidence.
  The spec requires VERIFIED / LIKELY FAKE / SUSPICIOUS / UNVERIFIED with risk levels and no invented
  percentages. Addressed in P1 (see below).
- LOW: `sw.js` caches cross-origin opaque responses (tesseract assets) cache-first; no cache versioning
  beyond the manual `CACHE` constant.
- Not implemented (skipped, not working): URL threat-intel adapters, phone intelligence/community reports,
  evidence graph, AI-image forensics, Hausa/English UI switching beyond the AI explanation.

### Next stage
(P0's "next stage" was P1; see below.)

---

## Stage P1 — Verdict system (four verdicts + risk levels + evidence report)

Date: 2026-11-11. Status: **TESTED** (rules engine, API route validation, build). UI **not** verified in a browser.

### What changed
- Verdicts are now `VERIFIED | LIKELY_FAKE | SUSPICIOUS | UNVERIFIED` (shown as "LIKELY FAKE" etc.)
  with a risk level `LOW | MODERATE | HIGH | CRITICAL`. Old mapping: Cannot verify -> UNVERIFIED,
  Suspicious -> SUSPICIOUS, Likely scam -> LIKELY_FAKE, Clean -> VERIFIED **only** when an independent check passed.
- All percentage confidence is removed from `Verdict`, the UI, the `/api/explain` payload and the Gemini prompt.
  The old numeric score survives only as an internal, unexposed ranking weight (`score()`).
- `Verdict` now carries a plain-language `explanation` and a structured `report`: evidence examined,
  methods used, contradictions, missing information, limitations, recommended actions, timestamp
  (`generatedAt` is the injected `now`, so the engine stays pure/deterministic).
- Every finding and passed check gets a unique, stable evidence ID (`EV-001`, ...) shown in the verdict
  panel, in the report and on the patches.
- Hausa labels (exact wording from the brief) are in `lib/labels.ts` and shown under the verdict.
- New evidence kind `balance` ("My balance" tab, `components/BalanceInput.tsx`): the balance the user reads in
  their own bank app. Equal to the alert's balance -> independent check `balance-match`;
  different -> `balance-mismatch` (danger, contradiction).

### Rules for VERIFIED (enforced in `computeVerdict`)
VERIFIED requires **both** (a) at least one *independent* check passed - `bank-verify-ok` (confirmation SMS with
expected sender and amount equal to the alert) or `balance-match` - and (b) zero non-info findings.
Supporting checks (official https link, matching phone, matching amount/account) are marked
`independent: false` and cannot produce VERIFIED. No findings + no independent check = UNVERIFIED (risk MODERATE, never LOW).
Risk: VERIFIED=LOW, UNVERIFIED=MODERATE, SUSPICIOUS=MODERATE (HIGH if a danger-level flag),
LIKELY_FAKE=HIGH (CRITICAL with >=2 critical flags or heavy flag weight).

### Commands run and actual results
| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm test:run` | 7 files, 134 tests, all pass (new: `tests/verdict.test.ts`, 37 tests) |
| `pnpm build` | pass; routes `/`, `/_not-found`, `/api/explain` |

### Tests proving the required guarantees (`tests/verdict.test.ts`)
- A screenshot alone (several OCR texts, plus a property test over arrays of screenshots) is never VERIFIED, never LOW risk.
- HTTPS alone (official bank domains and others) is never VERIFIED; an https scam lookalike is still LIKELY_FAKE.
- No findings / no reports never means safe: zero-finding evidence and empty input are UNVERIFIED, risk not LOW;
  limitations text says so; property test over zero-flag evidence sets.
- Failed or unavailable checks never look clean: contradicting bank amount, wrong bank, sender line missing,
  nothing to compare, balance mismatch, alert without balance - none are VERIFIED or LOW; a passed
  independent check does not hide a contradiction or a scam link.
- Exact Hausa strings, unique `EV-nnn` IDs, report fields + timestamp, no `%` in explanations, no `confidence` field.
- `/api/explain` rejects the old level names and a missing/invalid `riskLevel`.

### Files changed
- Modified: `lib/types.ts`, `lib/rules.ts`, `lib/gemini.client.ts`, `app/api/explain/route.ts`,
  `components/VerdictPanel.tsx`, `components/Patch.tsx`, `components/EvidenceInputPanel.tsx`,
  `tests/rules.test.ts`, `tests/rules.property.test.ts`, `tests/explain.route.test.ts`, this file.
- Created: `lib/labels.ts`, `components/BalanceInput.tsx`, `tests/verdict.test.ts`.
- Existing rules tests were updated to the new names: the three that expected "clean" for an https official link,
  a matching phone, or a lone alert now expect UNVERIFIED (intentional behaviour change); the bank-confirmation case now expects VERIFIED.

### Limitations / not done
- UI not checked in a real browser (no screenshots, no mobile layout, no a11y audit).
- The API payload changed shape (`riskLevel` replaces `confidence`); the consent preview shows the new payload.
  The AI-generated Hausa text itself is unreviewed by a native speaker; the four fixed Hausa labels are as supplied.
- Report text (explanation, methods, limitations, actions) is English only; only the four verdict statements are in Hausa.
  Risk level names are English only.
- Balance extraction is regex-based ("Bal:", "Balance") and depends on OCR quality; if the alert's balance is not read, the
  balance check is reported as missing information, not as passed.
- `.kiro/specs/trustcheck-ng/*` still describe the old clean/suspicious/scam + confidence model (not updated in P1).
- No threat-intel / phone-report lookups exist, so "no reports" can never be used as a positive signal (and is not).
- Other P0 findings (rate limiting, security headers, prompt-injection hardening, sw.js cache) untouched.

### Next stage
Stopped after P1 as requested. Awaiting go-ahead for P2.
