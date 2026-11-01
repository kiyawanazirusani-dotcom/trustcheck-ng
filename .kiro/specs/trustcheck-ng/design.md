# TrustCheck NG — Design

## 1. Architecture overview

```
┌──────────────────────────── Browser (client, offline-capable) ─────────────────────────────┐
│                                                                                              │
│  React UI (Next.js App Router, client components)                                            │
│   ├─ EvidenceInputPanel   (screenshot / text / link / phone / bank-verify)                    │
│   ├─ PatchStitcher        (visible patches → stitched verdict)                               │
│   ├─ VerdictPanel          (verdict + reasons + TTS + consent gate)                          │
│   └─ PrivacyNotice / OfflineIndicator                                                       │
│                                                                                              │
│  Client-only libraries                                                                      │
│   ├─ tesseract.js      (on-device OCR, WASM worker — cached by SW for offline)              │
│   ├─ rules engine      (pure TS, ../lib/rules — no DOM/network dependency)                  │
│   └─ SpeechSynthesis   (Web Speech API — English + Hausa, with availability probe)         │
│                                                                                              │
└───────────────────────────────────────────────────────────┬────────────────────────────────┘
                                                            │ HTTPS (consent-gated, online only)
                                                            ▼
┌──────────────────────────── Server (Next.js route handlers) ───────────────────────────────┐
│                                                                                              │
│  POST /api/explain   → reads GEMINI_API_KEY from env → calls Gemini → returns bilingual text │
│   (never returns the key; validates input; refuses if key absent)                           │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

The design separates three trust zones:
1. **Pure client core** — OCR + rules engine. Fully offline, no secrets, testable in
   Node without a browser.
2. **UI layer** — React components; calls the pure core; never ships secrets.
3. **Server route** — the *only* place the Gemini key lives; the only place text
   leaves the device, and only after consent.

### Why these choices
- **Next.js App Router** — one framework for client PWA UI and server route, with a
  clear client/server boundary for the API key.
- **tesseract.js** — on-device, offline OCR; WASM runs in a Web Worker. Cached by
  the service worker so it works offline after first load.
- **Pure rules engine** — kept out of React so it is trivially unit/property tested
  with `fast-check` in Node.
- **`@google/genai` server-side** — official SDK, key in `process.env`, never sent
  to the client.

## 2. Data model

### Evidence piece
```ts
type EvidenceKind = "screenshot" | "text" | "link" | "phone" | "bank-verify";

interface EvidenceBase {
  id: string;                 // uuid for the session
  kind: EvidenceKind;
  addedAt: number;             // epoch ms
  raw: string;                 // canonical raw input (OCR text / pasted text / url / phone / confirmation sms)
  finding?: Finding;           // per-piece finding from the rules engine
}

interface ScreenshotEvidence extends EvidenceBase {
  kind: "screenshot";
  ocrText: string;            // extracted text
  ocrConfidence: number;      // tesseract confidence 0..1
}

interface TextEvidence extends EvidenceBase {
  kind: "text";
  raw: string;                // the pasted SMS/WhatsApp text
}

interface LinkEvidence extends EvidenceBase {
  kind: "link";
  url: string;
}

interface PhoneEvidence extends EvidenceBase {
  kind: "phone";
  phone: string;
}

interface BankVerifyEvidence extends EvidenceBase {
  kind: "bank-verify";
  bank: BankCode;              // which bank/code was used
  confirmationSms: string;     // pasted back by user
}
```

### Bank catalog
```ts
interface BankCode {
  name: string;               // "GTBank"
  ussd: string;               // "*737#" (without tel:)
  tel: string;                // "tel:*737%23"  (%23 = #)
  aliases: string[];          // ["guaranty trust", "gtb"] for matching OCR/text
}
```

### Finding & verdict
```ts
type Severity = "info" | "warn" | "danger";

interface Finding {
  id: string;                 // rule id that fired, e.g. "phone-mismatch"
  severity: Severity;
  message: string;            // human-readable (English)
}

type VerdictLevel = "clean" | "suspicious" | "scam";

interface Verdict {
  level: VerdictLevel;
  confidence: number;         // 0..1
  findings: Finding[];         // aggregated across all pieces + cross-piece
  pieceFindings: Record<string, Finding[]>; // by evidence id
}
```

## 3. Rules engine (`lib/rules`)

A pure module with:
- `analyzePiece(ev): Finding[]` — single-piece red flags.
- `analyzeCross(evidence[]): Finding[]` — inconsistency checks across pieces.
- `computeVerdict(evidence[]): Verdict` — combines the above into level + confidence.

### Scoring model
Each finding contributes points by severity:
- `danger` = +0.4, `warn` = +0.18, `info` = 0.
- `confidence` = `clamp(sum, 0, 1)` but never below a small floor when any finding
  exists; rounded to 2 decimals.
- `level`: `confidence >= 0.7` → `scam`; `>= 0.3` → `suspicious`; else `clean`.

### Cross-piece ("stitching") rules (the Frankenstein core)
- **R-CROSS-PHONE** Phone in OCR text vs. entered phone mismatch → `danger`.
- **R-CROSS-BANK** Bank name detected in screenshot/text vs. bank chosen for
  verification mismatch → `danger`.
- **R-CROSS-AMOUNT** Amount in screenshot vs. amount mentioned in pasted text
  mismatch → `warn`.
- **R-CROSS-LINK-MERCHANT** Link domain does not match merchant/bank mentioned in
  text → `warn`.

### Single-piece rules
- **R-LINK-LOOKALIKE** Domain impersonation (Levenshtein-distance to a known
  brand with digits/substitutions, suspicious TLD) → `danger`.
- **R-LINK-HTTP** Non-https / IP-only URL → `warn`.
- **R-PHISH-KEYWORDS** Urgent phishing phrases ("urgent", "verify now", "account
  suspended", "click here", "otp", "send code") → `warn`.
- **R-SENDER-SPOOF** SMS sender looks like a mask (no "+" and not numeric, or
  contains "guarantor"/freeform mask) → `warn`.
- **R-DATE-STALE/FUTURE** Payment alert date older than 24h or in the future →
  `warn`.
- **R-AMOUNT-FORMAT** Unusual amount formatting / currency mismatch → `info`.
- **R-BANK-VERIFY-OK** Confirmation SMS contains the bank's name/expected token
  pattern → `info` (strengthens legitimacy, reduces danger).
- **R-BANK-VERIFY-MISMATCH** Verification SMS does not mention the chosen bank →
  `warn`.

All rules are data-driven (regex/normalize tables) so they are property-testable
and side-effect free.

## 4. OCR pipeline (client)

1. User selects an image (file input / drag-drop). It is held as an in-memory
   object URL; never uploaded.
2. `tesseract.recognize(file, "eng")` runs in a Web Worker.
3. Result text + confidence → `ScreenshotEvidence`.
4. The same text is fed into `analyzePiece` (date/amount/phone/bank extraction).

## 5. Guided bank verification flow

1. User opens the bank-verify form, picks a bank from the catalog.
2. UI shows the bank's USSD code and a "Dial now" button → `tel:<code>` (the `#`
   is percent-encoded as `%23`).
3. After the user returns, a text area lets them paste the confirmation SMS.
4. On submit → `BankVerifyEvidence`; rules engine checks it against the chosen
   bank and other pieces.

This deliberately avoids claiming SMS/USSD automation that a PWA cannot perform.

## 6. Gemini explanation (server route)

`POST /api/explain`:
- **Input** (sent from client only after consent): a compact JSON with the
  verdict level, confidence, and the finding messages (NOT raw screenshots or
  PII beyond what the user already opted to send). The consent gate lets the user
  preview exactly this payload before sending.
- **Server**: validate shape/size; require `process.env.GEMINI_API_KEY`; call
  `@google/genai` with a prompt requesting a concise explanation in English and
  Hausa. Return `{ en: string, ha: string }`.
- **Failure modes**: missing key → 503 with config message; offline client → the
  UI never calls the route; API error → 502 with a safe message (never leaks key).
- The route is a `force-dynamic` route handler; the key stays server-side.

The prompt is structured to ask for: (1) a short verdict restatement, (2) why,
(3) what to do next. Both languages requested in one call to reduce latency.

## 7. Text-to-speech

- On verdict explanation render, probe
  `speechSynthesis.getVoices()` for any `voice.lang` starting with `ha`.
- English TTS uses the default `en-*` voice; Hausa uses the `ha*` voice if found.
- If no Hausa voice: show Hausa text prominently with an
  "Hausa voice not available on this device" notice; keep English TTS button.
- "Speak" buttons are per-language; tapping again stops speech. State is reflected
  in the button.

## 8. PWA / offline

- `public/manifest.webmanifest` with name, icons, `display: standalone`,
  `start_url`, `theme_color`, `lang: en`.
- `public/sw.js` — a hand-rolled service worker: `install` precaches the app shell
  + OCR worker assets; `fetch` uses a cache-first strategy for same-origin GETs,
  falling back to network; non-GET/network-only requests bypass the cache. Kept
  deliberately simple to avoid build-tool coupling.
- Registered from a client component (`navigator.serviceWorker.register`) guarded
  by `production` to avoid caching dev builds.
- Offline indicator: `navigator.onLine` + online/offline events drive a banner.
  The Gemini button is disabled when offline.

## 9. Component tree

```
app/layout.tsx                 (root, metadata, manifest link)
app/page.tsx                   (main screen, client component)
components/
  EvidenceInputPanel.tsx       (tabbed add: screenshot/text/link/phone/bank-verify)
  ScreenshotCapture.tsx         (file input + OCR progress)
  TextPaste.tsx
  LinkInput.tsx
  PhoneInput.tsx
  BankVerify.tsx               (bank catalog + tel: dial + paste confirmation)
  PatchStitcher.tsx            (renders patches + stitched verdict visual)
  Patch.tsx                    (one evidence piece card)
  VerdictPanel.tsx             (level, confidence, findings list)
  ExplainPanel.tsx             (consent gate + Gemini explanation + TTS)
  TtsButton.tsx                (per-language speak/stop with availability)
  OfflineIndicator.tsx
  PrivacyNotice.tsx
lib/
  rules.ts                     (pure rules engine)
  banks.ts                     (bank catalog)
  ocr.ts                       (tesseract wrapper)
  tts.ts                       (voice availability + speak/stop)
  types.ts                     (shared types)
  gemini.client.ts             (fetch wrapper for /api/explain)
app/api/explain/route.ts       (server route, env key, never on client)
```

## 10. Privacy & state

- All evidence lives in React state (in memory) for the session only.
- No `localStorage` of evidence by default. (Future opt-in is allowed but out of
  scope; the privacy notice documents current behavior.)
- The only network egress is `/api/explain`, gated by an explicit consent preview.

## 11. Testing strategy

- **Unit + property tests (fast-check)** for `lib/rules`:
  - Determinism: same inputs → same verdict.
  - Verdict level ∈ {clean, suspicious, scam}; confidence ∈ [0,1].
  - Adding a contradicting piece never decreases confidence.
  - A fully consistent, legit-looking set stays at `clean`.
  - Every rule is independently unit tested with positive/negative cases.
- **Route test** for `/api/explain`: missing key → 503; well-formed → calls SDK
  (mocked) and returns `{en, ha}`.
- **TTS availability test**: pure helper for selecting voices is unit tested.
- Runner: Vitest. Property tests via `fast-check`.
