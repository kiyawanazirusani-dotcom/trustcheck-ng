# TrustCheck NG — Requirements

## 1. Overview

TrustCheck NG is a Progressive Web App (PWA) that helps Nigerians decide whether a
payment-related interaction is a scam. It is a "Frankenstein chimera": it stitches
together several mismatched pieces of evidence — an on-device OCR'd payment-alert
screenshot, pasted SMS/WhatsApp text, a link, a phone number, and old-school bank
verification via SMS/USSD codes — and combines them through a deterministic rules
engine plus an optional AI explanation layer (Gemini API). The verdict and each
contributing evidence piece are rendered as visible "stitched patches" that form
the final verdict.

The app works offline. On-device OCR and the rules engine run with no network.
The Gemini explanation requires the internet and explicit, per-request user
consent before any text leaves the device.

### Target users
Nigerian individuals receiving "proof of payment" alerts, transfer confirmations,
and bank-verification requests, who need a fast, private, offline-capable way to
spot scams. Verdict explanations are bilingual in English and Hausa with
text-to-speech.

## 2. Glossary

- **Evidence piece** — One input the user provides: a screenshot, pasted text, a
  link, a phone number, or a bank-verification result.
- **Patch** — The visual representation of one evidence piece in the stitched UI.
- **Verdict** — The combined scam assessment: `scam`, `suspicious`, or `clean`,
  with a confidence score and reasons.
- **Stitching** — Combining multiple evidence pieces and detecting *inconsistencies
  between them* (the Frankenstein core: mismatched evidence signals a scam).
- **Guided bank verification** — The app opens the phone dialer with the bank's
  official USSD code via a `tel:` link; the user runs it manually and pastes the
  confirmation SMS back as evidence.
- **Consent gate** — An explicit, per-request confirmation before any text is sent
  to the Gemini API.

## 3. Constraints

- **CON-1** The system MUST be a PWA installable on Android/iOS with offline support.
- **CON-2** The system MUST NOT read the user's SMS inbox or auto-dial/run USSD
  codes. Bank verification is *guided*: open the dialer via `tel:` and let the user
  paste the confirmation back.
- **CON-3** On-device OCR and the rules engine MUST run fully offline.
- **CON-4** The Gemini API explanation MUST require the internet AND explicit
  per-request user consent before any evidence text leaves the device.
- **CON-5** The Gemini API key MUST be stored in a server-side environment variable
  (`GEMINI_API_KEY`) and MUST NEVER be committed to the repository or shipped to the
  client.
- **CON-6** Nothing the user provides (screenshots, pasted text, links, phone
  numbers) MUST be persisted or transmitted without explicit consent. Local state
  lives only in memory for the session (optionally in `localStorage` opt-in).
- **CON-7** The LICENSE file MUST NOT be modified, and `.kiro` MUST NOT be added to
  `.gitignore`.

## 4. Requirements

### R1 — Evidence capture

**REQ-1.1** The system SHALL allow the user to upload a payment-alert screenshot
image and SHALL extract text from it on-device using OCR, with no network call.

**REQ-1.2** The system SHALL allow the user to paste free-form SMS or WhatsApp text
as an evidence piece.

**REQ-1.3** The system SHALL allow the user to enter a URL (link) as an evidence
piece.

**REQ-1.4** The system SHALL allow the user to enter a phone number as an evidence
piece.

**REQ-1.5** The system SHALL provide guided bank verification: WHEN the user selects
a bank, the system SHALL show that bank's official USSD code and SHALL provide a
`tel:` link that opens the dialer with that code; the system SHALL then allow the
user to paste the confirmation SMS back as a bank-verification evidence piece.

**REQ-1.6** The system SHALL NOT auto-dial USSD codes or read the SMS inbox; the
user performs the USSD interaction and pastes the result manually.

### R2 — Stitched patch UI

**REQ-2.1** The system SHALL render each accepted evidence piece as a visible
"patch" in a single stitched view, in the order the user added it.

**REQ-2.2** The system SHALL render the final verdict as a stitched composite that
visually aggregates the patches, so the user can see how each piece contributed.

**REQ-2.3** The system SHALL allow the user to remove an individual evidence piece;
WHEN a piece is removed, the system SHALL recompute the verdict from the remaining
pieces.

### R3 — Rules engine (offline, deterministic)

**REQ-3.1** The system SHALL compute a verdict from the accepted evidence pieces
using a deterministic rules engine that runs entirely on-device/offline.

**REQ-3.2** The verdict SHALL be one of `clean`, `suspicious`, or `scam`, with a
confidence score in the range [0, 1] and a list of human-readable reasons.

**REQ-3.3** The rules engine SHALL flag inconsistencies *between* evidence pieces,
including at least: phone-number mismatch between screenshot OCR and the entered
phone; bank-name mismatch across pieces; amount mismatch; and link/merchant
mismatch.

**REQ-3.4** The rules engine SHALL flag single-piece red flags, including at least:
lookalike/impersonation domains, urgent-phishing keywords in pasted text, spoofed
sender IDs, and stale or future-dated payment alerts.

**REQ-3.5** The rules engine SHALL be deterministic: identical inputs SHALL produce
identical outputs.

### R4 — Gemini explanation (online, consent-gated)

**REQ-4.1** The system SHALL offer an optional AI explanation of the verdict in both
English and Hausa.

**REQ-4.2** The system SHALL NOT send any text to the Gemini API until the user has
given explicit per-request consent via a consent gate that states exactly what
text will be sent.

**REQ-4.3** WHEN the device is offline, the system SHALL disable the Gemini
explanation affordance and SHALL show an offline notice.

**REQ-4.4** The system SHALL call the Gemini API exclusively from a server route
using a server-side environment variable for the API key; the key SHALL NOT be
exposed to the client.

**REQ-4.5** The system SHALL require `GEMINI_API_KEY` to be set server-side; IF the
key is absent, the system SHALL return a clear configuration error rather than
calling the API.

### R5 — Bilingual text-to-speech

**REQ-5.1** The system SHALL provide text-to-speech for the verdict explanation in
English and Hausa.

**REQ-5.2** The system SHALL test for an available Hausa (`ha`/`ha-NG`) speech
synthesis voice; IF none is available, the system SHALL fall back to showing the
Hausa explanation as on-screen text and SHALL indicate that TTS is unavailable.

### R6 — Offline PWA

**REQ-6.1** The system SHALL be installable (web app manifest + service worker) and
SHALL function offline for evidence capture, OCR, and verdict computation.

**REQ-6.2** The service worker SHALL cache the application shell and the OCR worker
assets so OCR works without a network.

**REQ-6.3** The system SHALL clearly indicate online/offline status to the user.

### R7 — Privacy

**REQ-7.1** The system SHALL NOT persist evidence to any server. Evidence lives in
memory only for the active session.

**REQ-7.2** The system SHALL NOT transmit any evidence to any third party other
than the consent-gated Gemini server route, and only after explicit consent.

**REQ-7.3** The system SHALL surface a privacy notice describing what is stored
locally and what is sent (with consent) on first use and in an accessible location.

## 5. Non-functional requirements

- **NFR-1 (Usability)** Mobile-first, large tap targets, works on low-end Android
  browsers.
- **NFR-2 (Performance)** OCR and verdict computation respond within a few seconds
  on a mid-range phone.
- **NFR-3 (Accessibility)** Buttons and patches have accessible names; verdict
  state conveyed beyond color (icon + label).
- **NFR-4 (Maintainability)** The rules engine is pure and unit/property tested.
- **NFR-5 (Security)** No secrets in client bundles; server route validates input.
