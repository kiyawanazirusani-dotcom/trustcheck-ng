# Privacy & consent — TrustCheck NG

Privacy is a first-class requirement, not an afterthought.

## Data residency
- All evidence (screenshots, pasted text, links, phone numbers, bank-verification
  SMS) lives **only in memory** for the active session.
- There is no database, no server storage, and no analytics on user content.
- `localStorage` is **not** used for evidence by default. Any future opt-in
  persistence must be explicitly user-enabled and documented in the privacy notice.

## Network egress policy
- The **only** outbound request carrying user content is `POST /api/explain` to
  the Gemini server route.
- That request is **consent-gated**: the user must explicitly approve a per-request
  consent gate that previews exactly the text that will be sent. The user can
  always decline and still receive the full offline verdict.
- Screenshots are **not** uploaded. Only OCR-derived findings/summary text the
  user consents to is sent.

## Secrets
- `GEMINI_API_KEY` is a **server-side** environment variable only.
- It is never imported by client code, never bundled, and never committed.
- `.env` / `.env.*` are gitignored (except `.env.example`, which is a placeholder
  only). `.kiro` is **not** gitignored.

## Consent gate requirements
- Must state, in plain language, what will be sent and to whom ("Google Gemini").
- Must show the exact payload preview before sending.
- Must be a deliberate action (a separate confirm button), not a pre-checked box.
- Must be re-granted per explanation request; no sticky "remember consent".

## Offline behavior
- OCR and the rules engine run with no network.
- The Gemini affordance is **disabled** when offline and shows an offline notice.
- Online/offline status is shown to the user at all times.

## Reviewing changes
When adding any new network call or storage: confirm it is consent-gated (or
purely offline), update the privacy notice, and never widen egress without an
explicit spec change.
