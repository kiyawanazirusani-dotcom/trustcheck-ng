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
  percentages. Planned for P1.
- LOW: `sw.js` caches cross-origin opaque responses (tesseract assets) cache-first; no cache versioning
  beyond the manual `CACHE` constant.
- Not implemented (skipped, not working): URL threat-intel adapters, phone intelligence/community reports,
  evidence graph, AI-image forensics, Hausa/English UI switching beyond the AI explanation.

### Next stage
P1 — verdict system (four states + risk levels) and evidence extraction. Awaiting go-ahead.
