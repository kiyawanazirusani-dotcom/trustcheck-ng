# The Frankenstein concept — TrustCheck NG

This steering file is the "concept origin" doc referenced throughout the project.

## Why "Frankenstein"
TrustCheck NG is a Kiroween "Frankenstein category" entry: a **chimera** built from
mismatched body parts stitched into one living thing. Each evidence piece is a
stolen limb from a different source:

- A **payment-alert screenshot** (OCR'd on-device) — the face.
- **Pasted SMS/WhatsApp text** — the voice.
- A **link** — the hand reaching out.
- A **phone number** — the call sign.
- **Bank verification via SMS/USSD** — the old-school spine.

The core insight is that **a scam is revealed by the stitches, not the parts**: a
screenshot that claims payment from Bank A while the entered phone belongs to Bank
B; a link whose domain impersonates a brand while the text names a different
merchant; an amount in the screenshot that doesn't match the amount in the
message. The Frankenstein monster is "wrong" because its parts don't belong
together — and so is a scam.

## The stitched UI
Every accepted evidence piece renders as a visible **patch** (a card with a
ragged, stitched border) in the order it was added. The final verdict is the
**stitched composite** — the monster assembled from those patches — with the
seams (inconsistencies) called out as the reason it's a scam.

## Honesty about the platform
A PWA cannot read the SMS inbox or run USSD codes. Instead of faking that
capability, we implement **guided bank verification**: the app opens the phone
dialer with the bank's official USSD code via a `tel:` link, the user runs it
themselves, and pastes the confirmation SMS back as evidence. The seams stay
visible and the user stays in control.

## Privacy (nothing stored or sent without consent)
- Evidence lives **only in memory** for the active session. No server storage, no
  database, no analytics on user content.
- The **only** network egress is the optional Gemini explanation, and it is gated
  by an **explicit, per-request consent** that previews exactly what text will be
  sent. The user can decline and still get the full offline verdict.
- The Gemini API key lives **server-side only** in `GEMINI_API_KEY` and is never
  shipped to the client or committed.
- On-device OCR means the screenshot never leaves the device unless the user
  opts to send a derived finding to Gemini.

This file plus `tech-stack.md` and `privacy-and-consent.md` define the rules we
follow when building and reviewing this project.
