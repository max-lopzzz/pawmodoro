# Pawmodoro RevenueCat Monetization — Design

## Purpose

Gate shared rooms behind a one-time purchase, using RevenueCat to power the transaction — the Shipaton Next Gen category's core requirement ("RevenueCat SDK integrated, powering at least one purchase"). Free users get one room (create or join) to try the feature; every subsequent room action requires the `pawmodoro_pro` entitlement.

## Constraints

- **Real accounts and credentials already exist** (unlike the Supabase rooms-foundation sub-project, which had to defer live verification against placeholders) — this sub-project's live purchase-flow testing happens for real, not deferred.
- RevenueCat platform: **Web** (the `@revenuecat/purchases-js` Web Billing SDK), used identically on both Electron and the Capacitor iOS build, since both are webviews hosting the same renderer code — not a native/framework-specific SDK, and not the separate `purchases-capacitor` package.
- Product: **one-time purchase only** ("Lifetime" package). No subscription code — Monthly/Yearly packages were removed from the RevenueCat offering during setup.
- Entitlement identifier: **`pawmodoro_pro`** (exact string, confirmed from the live RevenueCat dashboard).
- API key: `test_kZvwYQCGYEFNChQFCxuJmLtShuK` — a test-mode public key, meant for client-side embedding (same trust model as Stripe's publishable key or Supabase's anon key) — safe to commit.
- No bundler — every new script must work loaded via a plain `<script>` tag. `@revenuecat/purchases-js` ships a UMD build (`dist/Purchases.umd.js`) suitable for this; the separate `@revenuecat/purchases-ui-js` package ships raw Svelte source requiring a bundler and is **not used** — the core SDK's `presentPaywall()` method (confirmed present in the vendored UMD bundle) renders RevenueCat's dashboard-designed paywall and checkout without it.
- Free-trial tracking is a single `localStorage` flag (soft, per-device, resettable by clearing storage) — an accepted simplification, not real anti-abuse enforcement, consistent with this project's existing per-device simplifications (task-linked timer duration, nickname persistence).
- **Accepted limitation, explicitly not mitigated:** entitlement is tied to the anonymous Supabase user ID reused as RevenueCat's `appUserId`. Clearing browser/app storage creates a new anonymous ID, and a genuine past purchase would no longer show as entitled. No email collection or account linking (`identifyUser()`/`logIn()`) is being added to guard against this — out of scope for a demo-scale submission.
- No Customer Center — it's built for subscription self-service (cancel, billing history); irrelevant to a one-time purchase. No explicit "restore purchases" flow either — RevenueCat's web model ties entitlement to `appUserId` automatically, so `isEntitledTo()` reflects a past purchase on relaunch with the same ID, with nothing to restore.

## Architecture

Two new small pieces bolt onto the existing rooms flow without touching its core logic:

1. **`renderer/monetization.js`** (new) — owns the RevenueCat SDK: configuring it once (lazily, using the Supabase anonymous user's ID as `appUserId`), checking the free-trial flag, checking the entitlement, and presenting the paywall when gated. Exposes exactly two functions to `rooms.js`.
2. **`renderer/rooms.js`** (modified) — the two existing room-entry click handlers (`elBtnRoomCreate`, `elBtnRoomJoin`) each gain one gate check, right after the existing `ensureAnonSession()` call, before their existing create/join logic runs. `enterRoom()` marks the free trial used on the first successful entry.

Monetization concerns live in their own file rather than growing `rooms.js` further, which already carries panel-toggle, presence, and timer-sync responsibilities — a fourth unrelated concern would overload it, and the interface between the two files is narrow (one function to gate, one function to mark trial-used), so the split costs nothing.

## Gating Flow

```
elBtnRoomCreate / elBtnRoomJoin click handler:
  clearRoomError()
  ensureAnonSession()
    .then(session => ensureRoomAccess(session.user.id))
    .then(function (allowed) {
      if (!allowed) return
      // ...existing create/join logic, unchanged...
    })
    .catch(function () { showRoomError('Could not connect. Check your connection.') })
```

`ensureRoomAccess(userId)` (in `monetization.js`), returning `Promise<boolean>`:

1. Configure `Purchases` once per session, using `userId` as `appUserId` (guarded so repeat calls are no-ops).
2. If the free-trial flag is not yet set, resolve `true` immediately — first room is free.
3. Otherwise, call `purchases.isEntitledTo('pawmodoro_pro')`. If entitled, resolve `true`.
4. Otherwise, call `purchases.presentPaywall({})` — no offering needs to be passed explicitly; it defaults to the current offering configured in the dashboard. This renders RevenueCat's full paywall screen and checkout as a self-contained overlay. Note the SDK's actual contract (confirmed against the vendored `renderer/purchases.js`, v1.53.1): this promise *rejects* with a `UserCancelledError` when the user dismisses/backs out without purchasing — it does not resolve in that case. `ensureRoomAccess` swallows that rejection (`.catch(function () {})`) so it doesn't propagate past the paywall step, rather than treating dismissal as a success.
5. After the paywall promise settles (resolved on purchase, or its rejection swallowed on dismissal/cancellation), re-check `isEntitledTo('pawmodoro_pro')` and resolve with that result — covers both "purchased successfully" (true) and "dismissed without buying" (false).

`markFreeTrialUsed()` sets a `localStorage` flag (e.g. `room-free-trial-used`), called from `enterRoom()` on every successful room entry (idempotent after the first).

## File Structure

- `renderer/purchases.js` (new, vendored) — the RevenueCat JS SDK's UMD bundle, copied from `node_modules/@revenuecat/purchases-js/dist/Purchases.umd.js`, same treatment as `renderer/supabase.js`.
- `renderer/revenuecat-config.js` (new) — `window.REVENUECAT_API_KEY = 'test_kZvwYQCGYEFNChQFCxuJmLtShuK'`.
- `renderer/monetization.js` (new) — `ensureRoomAccess(userId)` and `markFreeTrialUsed()`, plus the internal free-trial-flag helpers and the lazy `Purchases.configure()` guard.
- `renderer/rooms.js` (modified) — the two click handlers gain the gate check; `enterRoom()` gains the `markFreeTrialUsed()` call.
- `renderer/index.html` (modified) — new script tags, ordered: `revenuecat-config.js` and `purchases.js` slot in alongside the existing `supabase-config.js`/`supabase.js` pair; `monetization.js` loads after `app.js`/`todo.js` and before `rooms.js` (which depends on it).
- `package.json` (modified) — `@revenuecat/purchases-js` added to `devDependencies` (vendored for its browser bundle only, never `require`d by Electron/Node code — same reasoning already applied to `@supabase/supabase-js` and the Capacitor packages).

## Out of Scope

- Subscription products/code (Monthly/Yearly packages removed from the offering during setup).
- Customer Center.
- Explicit restore-purchases UI (not needed given the `appUserId` continuity model).
- Email collection / account linking to mitigate the storage-clearing limitation (explicitly accepted above).
- Cosmetic skin packs (dog/rabbit variants) — separate future sub-project once those assets exist, and would need its own entitlement/product design.
- Any change to free/paid boundaries elsewhere in the app (solo Pomodoro, local tasks remain fully free, unaffected by this work).

## Testing

- `markFreeTrialUsed()`/the free-trial-flag read helper are simple enough for real unit tests, following the established `*-logic.js` pure-function pattern used elsewhere in this codebase (e.g. `rooms-logic.js`).
- The SDK configuration, entitlement checks, and paywall presentation are DOM/network-dependent, consistent with how `rooms.js`'s Supabase wiring is verified live rather than unit-tested.
- Live verification (not deferred, since real credentials exist): create a fresh room as a first-time user (free trial), leave, attempt a second room and confirm the paywall appears, complete a test-mode purchase, confirm the entitlement unlocks unlimited room creation/joining afterward, and confirm relaunching the app (same device, same persisted anonymous session) still shows as entitled without repurchasing.
