# Product context — TrustCheck NG

TrustCheck NG is a Progressive Web App that helps Nigerians spot payment scams by
stitching several evidence pieces into one verdict.

## What it is
A bilingual (English + Hausa) scam-checker PWA that works offline. The user feeds it
mismatched evidence — a payment-alert screenshot (OCR'd on-device), pasted
SMS/WhatsApp text, a link, a phone number, and guided bank verification via
SMS/USSD — and it returns a `clean` / `suspicious` / `scam` verdict with reasons.

## Who it's for
Nigerian individuals receiving "proof of payment" alerts and transfer
confirmations, often on low-end Android devices with unreliable data.

## Core promise
- **Private by default:** evidence lives only in memory for the session. Nothing is
  stored or sent anywhere without explicit consent.
- **Offline-first:** OCR and the verdict work with no network. The optional AI
  explanation is the only thing that needs the internet, and only after consent.
- **Honest about platform limits:** a PWA cannot read the SMS inbox or auto-run
  USSD, so bank verification is *guided* — the app opens the dialer with the bank's
  official USSD code and the user pastes the confirmation back.

## Source of truth
- Spec: `.kiro/specs/trustcheck-ng/` (requirements.md, design.md, tasks.md)
- Steering: `.kiro/steering/` (this file + concept, tech stack, privacy)
