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

## Run locally
```
pnpm install
pnpm dev
pnpm test
```

## License
MIT
