# TrustCheck NG — Tasks

Implementation order. Each task is independently verifiable. Do NOT touch
`LICENSE`; do NOT add `.kiro` to `.gitignore`.

## T1 — Scaffold Next.js + TypeScript + Tailwind + tooling
- [x] 1.1 Create `package.json` with Next.js (App Router), React, TypeScript.
- [x] 1.2 Add Tailwind CSS (PostCSS pipeline) and base globals.
- [x] 1.3 Add `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`.
- [x] 1.4 Add Vitest + `fast-check` as dev deps; add `vitest.config.ts`.
- [x] 1.5 Add `.env.example` with `GEMINI_API_KEY=` placeholder (never a real key).
- [x] 1.6 Add npm scripts: `dev`, `build`, `start`, `lint`, `test`, `test:run`.
- [x] 1.7 Verify `pnpm build` and `pnpm test:run` pass with a trivial smoke test.

## T2 — Shared types and bank catalog
- [x] 2.1 Create `lib/types.ts` with all shared types (Evidence kinds, Finding,
  Verdict, BankCode).
- [x] 2.2 Create `lib/banks.ts` with a catalog of common Nigerian banks + USSD
  codes (GTBank, Access, Zenith, UBA, FirstBank, Kuda, OPay, Sterling, FCMB,
  Union) with `tel:`-encoded codes and aliases.
- [x] 2.3 Unit test bank alias matching.

## T3 — Rules engine (pure)
- [x] 3.1 Create `lib/rules.ts` with normalize helpers (phone, amount, domain).
- [x] 3.2 Implement `analyzePiece` (single-piece rules: lookalike link, http,
  phishing keywords, sender spoof, date stale/future, amount format,
  bank-verify ok/mismatch).
- [x] 3.3 Implement `analyzeCross` (cross-piece: phone mismatch, bank mismatch,
  amount mismatch, link/merchant mismatch).
- [x] 3.4 Implement `computeVerdict` (aggregate findings → level + confidence,
  applying legitimacy offsets).
- [x] 3.5 Export only pure functions; no DOM/network imports.

## T4 — Property-based tests for rules
- [x] 4.1 Add `tests/rules.property.test.ts` with fast-check arbitraries for
  evidence sets.
- [x] 4.2 Property: determinism (same input → same verdict).
- [x] 4.3 Property: verdict level ∈ {clean,suspicious,scam}, confidence ∈ [0,1].
- [x] 4.4 Property: adding a contradicting piece never decreases confidence.
- [x] 4.5 Property: a fully consistent legit set stays `clean`.
- [x] 4.6 Add unit tests for each rule (positive + negative).
- [x] 4.7 `pnpm test:run` passes.

## T5 — OCR module (client)
- [x] 5.1 Create `lib/ocr.ts` wrapping tesseract.js (`recognize(file, "eng")`).
- [x] 5.2 Return `{ text, confidence }`; handle errors (empty/unsupported).
- [x] 5.3 Lazy-load tesseract only on client.

## T6 — TTS module
- [x] 6.1 Create `lib/tts.ts` with `getVoices()`, `hasHausaVoice()`,
  `hasEnglishVoice()`, `speak(text, lang)`, `stop()`.
- [x] 6.2 Handle async voice loading (`voiceschanged` event).
- [x] 6.3 Unit test the voice-selection helper (pure part) with mocked voices.

## T7 — PWA: manifest, service worker, offline indicator
- [x] 7.1 Create `public/manifest.webmanifest` (name, icons, display standalone,
  start_url, theme_color, lang).
- [x] 7.2 Create `public/sw.js` (install precache app shell + OCR assets;
  cache-first for same-origin GET; network fallback; skip non-GET).
- [x] 7.3 Create `public/icon-*.png` placeholder icons (192/512).
- [x] 7.4 Add manifest + theme meta to `app/layout.tsx`; register SW in a client
  component (production only).
- [x] 7.5 Create `components/OfflineIndicator.tsx` (navigator.onLine + events).

## T8 — Evidence input UI
- [ ] 8.1 Create `components/EvidenceInputPanel.tsx` (tabbed add).
- [ ] 8.2 `components/ScreenshotCapture.tsx` (file/drag-drop, OCR progress).
- [ ] 8.3 `components/TextPaste.tsx`.
- [ ] 8.4 `components/LinkInput.tsx`.
- [ ] 8.5 `components/PhoneInput.tsx`.
- [ ] 8.6 `components/BankVerify.tsx` (catalog + `tel:` dial + paste SMS).
- [ ] 8.7 Wire all inputs to add evidence to app state.

## T9 — Stitched patch UI + verdict
- [ ] 9.1 Create `components/Patch.tsx` (one evidence card with finding badges).
- [ ] 9.2 Create `components/PatchStitcher.tsx` (renders patches in order +
  stitched composite visual).
- [ ] 9.3 Create `components/VerdictPanel.tsx` (level icon+label, confidence,
  findings list, remove-piece).
- [ ] 9.4 Recompute verdict via `computeVerdict` on every evidence change.
- [ ] 9.5 Mobile-first Tailwind styling, accessible labels, color+icon verdict.

## T10 — Gemini server route + consent-gated explain UI
- [ ] 10.1 Create `app/api/explain/route.ts` (validate input; require
  `GEMINI_API_KEY`; call `@google/genai`; return `{en, ha}`; 503 if no key).
- [ ] 10.2 Create `lib/gemini.client.ts` (fetch wrapper, typed).
- [ ] 10.3 Create `components/ExplainPanel.tsx` with consent gate (preview exact
  payload), disabled when offline, English + Hausa rendering.
- [ ] 10.4 Wire `components/TtsButton.tsx` (per-language speak/stop, Hausa
  fallback notice).
- [ ] 10.5 Route test: missing key → 503; success path with mocked SDK.

## T11 — Privacy notice + final wiring
- [ ] 11.1 Create `components/PrivacyNotice.tsx`; show on first use + accessible.
- [ ] 11.2 Wire `app/page.tsx` (state, verdict, explain, offline, privacy).
- [ ] 11.3 Add top-level README content describing the app + how to run.
- [ ] 11.4 Verify `pnpm lint`, `pnpm build`, `pnpm test:run` all pass.

## T12 — Final verification
- [ ] 12.1 Confirm no secrets in client bundle (grep for key usage).
- [ ] 12.2 Confirm `.kiro` not in `.gitignore`; LICENSE unchanged.
- [ ] 12.3 Confirm PWA manifest valid; SW registered in production build.
- [ ] 12.4 End-to-end dry run of the task list against requirements.
