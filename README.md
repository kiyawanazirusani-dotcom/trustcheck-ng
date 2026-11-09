# TrustCheck NG

A scam-protection PWA for Nigerians. Check a payment alert, message or link before you release goods or pay.

Built for the Kiroween 2026 hackathon (Frankenstein category).

## The idea
TrustCheck NG stitches mismatched evidence into one scam verdict:
- payment-alert screenshots (on-device OCR)
- pasted SMS / WhatsApp text
- links and phone numbers
- guided bank verification (dial the bank's official code, then paste the confirmation SMS)

An AI layer explains the verdict in Hausa and English. Nothing is sent anywhere without the user's consent.

## Status
In development. The specs, steering docs, agent hooks and tests are in place; the main UI is being built with Kiro.

## Built with Kiro
See the `/.kiro` folder: specs (requirements, design, tasks), steering docs, and agent hooks.

## Privacy
- Evidence lives only in memory for the session. Nothing is stored.
- OCR and the verdict run on-device and work offline.
- The only network call carrying user-derived content is the optional "Explain with AI" request. It is sent only after you confirm in a consent gate that previews the exact text, and goes through a server route to Google Gemini.

## Run locally
```
pnpm install
cp .env.example .env   # optional: add GEMINI_API_KEY for the AI explanation
pnpm dev
pnpm test:run
```
`GEMINI_API_KEY` is server-side only and must never be committed. Without it, everything works except the AI explanation (the route returns 503).

Hausa text-to-speech uses a Hausa voice if your device has one; otherwise the Hausa text is shown on screen.

## License
MIT
