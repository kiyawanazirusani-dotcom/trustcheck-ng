# Tech stack & conventions — TrustCheck NG

## Stack
- **Framework:** Next.js (App Router) + React, TypeScript (`strict`).
- **Styling:** Tailwind CSS via PostCSS. Mobile-first. No component library.
- **OCR:** `tesseract.js` (WASM Web Worker, on-device, offline).
- **Rules engine:** Pure TypeScript in `lib/rules.ts` — no DOM, no network, fully
  testable in Node.
- **AI explanation:** `@google/genai` (Gemini) called **server-side only** from a
  route handler; key in `process.env.GEMINI_API_KEY`.
- **TTS:** Web Speech API `SpeechSynthesis` (English default voice; Hausa voice if
  present, else on-screen fallback).
- **PWA:** hand-rolled `public/manifest.webmanifest` + `public/sw.js` service
  worker (no build-tool plugin), registered production-only from a client
  component.
- **Tests:** Vitest + `fast-check` (property-based tests for the rules engine).

## Package manager
Prefer **pnpm** for installs and scripts. npm is an acceptable fallback.

## Conventions
- Keep `lib/` framework-agnostic and side-effect free where possible so it is
  testable in Node without a browser.
- Server-only code (route handlers, anything using `process.env.GEMINI_API_KEY`)
  must never be imported by client components.
- Client components use the `"use client"` directive.
- Never ship secrets to the client. The Gemini key is server-side only.
- Use EARS-style phrasing for requirements; tasks in `tasks.md` are checkboxes.

## Commands
- `pnpm dev` — dev server
- `pnpm build` — production build (must pass)
- `pnpm start` — serve production build
- `pnpm lint` — lint (must pass)
- `pnpm test:run` — run tests once (must pass)

## Hard rules
- Do NOT modify `LICENSE`.
- Do NOT add `.kiro` to `.gitignore` (specs, steering, and hooks are tracked).
- Do NOT commit `GEMINI_API_KEY` or any real secret.
