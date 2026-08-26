# Pawmodoro Paywall Content — Design

## Purpose

Content and copy specification for the RevenueCat-hosted paywall screen shown when a free user tries to create or join a second shared Focus Room. This complements the implementation spec in [2026-08-25-pawmodoro-revenuecat-monetization-design.md](2026-08-25-pawmodoro-revenuecat-monetization-design.md) — that document covers the code/SDK integration; this one covers what the paywall actually says and shows, for whoever builds it in the RevenueCat dashboard (AI paywall generator or manual template).

## Context

- Triggered by `ensureRoomAccess()` (`renderer/monetization.js`) via `presentPaywall({})`, only after a user's free first room has been used and they aren't yet entitled to `pawmodoro_pro`.
- Product: **Lifetime** — a single one-time purchase, not a subscription. No Monthly/Yearly packages exist in the offering.
- What's actually being unlocked: unlimited **Shared Focus Rooms** — synced Pomodoro timers, live participant status (Focusing / On Break / Idle / Away), a per-person "skip streak" badge that surfaces when someone's been skipping their breaks, and a "Nudge" button to gently check in on a co-working friend. This was built specifically to make the app more usable for people whose hyperfocus makes them skip breaks — the paywall copy should carry that spirit, not read as a generic "upgrade to premium" screen.

## Target reader

Someone who just tried to start a second room and got stopped. They already used the feature once for free, so they know what it does — the paywall doesn't need to explain rooms from scratch, it needs to make the "pay once, keep using it" decision feel easy and low-pressure.

## Content structure

**Headline** (one line, sets the tone — pick one or write a variant):
- "Keep working together."
- "One more thing, then it's yours for good."
- "Unlock unlimited Focus Rooms."

**Subheadline** (one sentence, states the deal plainly):
- "Pay once. No subscription, no recurring charges — just unlimited Shared Focus Rooms, forever."

**Feature list** (3–4 short bullets, each a benefit not a spec):
- Co-work with friends in synced, real-time Pomodoro sessions
- See who's Focusing, on a break, or away — no guessing
- Gentle accountability: get a nudge (or send one) when someone's skipping their breaks
- Create or join as many rooms as you want, whenever you want

**Pricing block:**
- Show the Lifetime package's actual price (pulled automatically from the offering — don't hardcode a number here).
- Directly under the price: "One-time payment" or "Pay once, use forever" — repeat this even though the subheadline already said it; people skim paywalls and the price is where their eye lands last before deciding.

**Call to action:**
- Single button, e.g. "Unlock Pawmodoro Pro" or "Get Lifetime Access" — avoid vague CTAs like "Continue" or "Subscribe" (it isn't a subscription, don't let the word slip in anywhere).

**Dismiss / close:**
- Must be easy to find and use without friction — per the app's design, declining the paywall should feel like a neutral, judgment-free "not right now," not a screen that fights you to stay. (This is a content/tone note for whoever designs the close affordance; the code side already treats dismissal as a clean, silent decline with no guilt-tripping re-prompt.)

**Fine print** (small text, bottom):
- "One-time purchase. No subscription. No recurring charges."

## Tone and voice

Warm, encouraging, a little playful — matches the app's existing cat-mascot personality (see `renderer/timer-logic.js`'s celebration GIFs and the overall visual identity). Not corporate, not urgent/scarcity-driven ("Limited time!", "Don't miss out!" — avoid this register entirely). A light cat pun in the headline or CTA is welcome but not required; never force one if it reads awkward.

Avoid:
- Subscription language ("subscribe," "billed monthly," "cancel anytime" — none of this applies and using it would be actively confusing).
- Guilt or pressure copy aimed at the free-trial-used state ("You've already used your free room!" as a scolding headline — keep it framed as an invitation, not a callout).
- Over-explaining the mechanics of skip-streaks/nudges in paywall copy — one bullet each is enough; the user already experienced the feature in their free room.

## Visual direction

- Reuse the app's existing warm/cozy palette and cat imagery if the paywall template supports custom images — a still or GIF of the mascot (e.g. a celebrating pose) reinforces brand continuity between the app and the paywall rather than feeling like a bolted-on commerce screen.
- Keep it to one screen, no multi-step flow — this is a single Lifetime product, there's nothing to compare or choose between.

## Out of scope

- Any subscription-tier messaging (no subscription product exists).
- Multiple package/pricing comparison (only one package exists).
- Restore-purchase messaging (not part of this flow — see the implementation spec's accepted limitations).
