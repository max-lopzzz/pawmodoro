# Pawmodoro Cosmetic Skins — Design

## Purpose

Let users pick a companion animal — Cat, Dog, or Rabbit — for the ambient and celebration GIFs shown throughout the app. Cat stays free (it's the existing default); Dog and Rabbit are included with the `pawmodoro_pro` entitlement users already purchase to unlock shared rooms, giving that one-time purchase more visible, everyday value beyond just the rooms feature.

## Constraints

- **Assets already exist**, uploaded directly to the repo at `assets/`: `Conejito Idle.GIF`, `Conejito trabajando.GIF`, `Conejito Descansando.GIF`, `Conejito Celebrando.GIF` (rabbit), and `Perrito Idle.GIF`, `Perrito Estudiando.GIF`, `Perrito Descansando.GIF`, `Perrito Celebrando.GIF` (dog) — filenames and their `.GIF` (uppercase) extension must be used exactly as committed; case matters on case-sensitive filesystems even though this developer's Mac won't complain.
- **No new RevenueCat product or entitlement.** Dog and Rabbit are gated behind the same `pawmodoro_pro` entitlement already used for shared rooms — no dashboard changes, no new SDK configuration.
- **No free trial for skins.** Unlike shared rooms (one free room, then paywall), Cat is unconditionally free forever and Dog/Rabbit unconditionally require the entitlement — there's no "try it once free" state to track for skins.
- Skin choice is a single per-device preference (`localStorage`, matching every other setting in this app) — not synced to a server, not per-room, applies identically whether the user is in the solo timer or a shared room.
- Follows this codebase's established conventions throughout: `var` declarations, named `function` statements, no bundler, dependency-injected/pure-where-possible logic in `*-logic.js` files with real unit tests, DOM/network wiring verified manually.

## Architecture

Three small additions, each slotting into an existing, already-established pattern rather than introducing a new one:

1. **`renderer/timer-logic.js`** (pure logic, already unit-tested) — `AMBIENT_GIFS` and `CELEBRATION_GIFS` become nested-by-skin instead of flat; `getAmbientGif()` and `pickCelebrationGif()` each gain a `skin` parameter.
2. **`renderer/monetization.js`** — a new, deliberately simpler sibling to the existing `ensureRoomAccess()`: `ensureSkinAccess(userId)`. Simpler because there's no free-trial branch to check — it always requires either an existing entitlement or a completed purchase.
3. **`renderer/app.js` + `renderer/index.html` + `renderer/style.css`** — a new "Companion" row in the Settings panel, three buttons (Cat/Dog/Rabbit) styled after the existing `.task-select-btn`/`.task-select-btn.selected` pattern already used elsewhere in this codebase for a very similar "pick one of several options, highlight the active one" UI. Dog/Rabbit show a lock affordance when not entitled.

## Data Flow

- `loadSkin()` / `saveSkin(skin)` in `renderer/app.js`, right alongside the existing `loadConfig()`/`saveConfig()` — `localStorage` key `selected-skin`, defaulting to `'cat'`.
- `state.skin` holds the current skin (initialized from `loadSkin()` at startup, alongside the existing `config`/`state` initialization).
- `render()` passes `state.skin` into `getAmbientGif(state.sessionType, state.timerState, state.skin)`; `showCelebration()` passes it into `pickCelebrationGif(state.skin)`. Both call sites already exist — the only change is the added argument.
- Settings panel gains three skin buttons. Clicking one:
  - **Cat**, or **Dog/Rabbit while already entitled**: apply immediately — `state.skin = <chosen>`, `saveSkin(<chosen>)`, re-render the button row's selected state. No async involved.
  - **Dog/Rabbit while not entitled**: `ensureAnonSession().then(function (session) { return ensureSkinAccess(session.user.id) }).then(function (allowed) { if (!allowed) return; /* apply as above */ })` — reusing `ensureAnonSession()` from `renderer/rooms.js` exactly as `renderer/rooms.js`'s own create/join handlers already do. If the user completes the purchase, the skin applies immediately after; if they dismiss the paywall, nothing changes and they stay on their current skin.
- `ensureSkinAccess(userId)` (in `renderer/monetization.js`): configure once (`ensureConfigured(userId)`, already exists and is memoized), then `isEntitledTo('pawmodoro_pro')` — if entitled, resolve `true`; otherwise `presentPaywall({}).catch(function () {})` then re-check `isEntitledTo(...)` and resolve with that — identical settle-then-recheck shape to `ensureRoomAccess()`, including the same deliberate rejection-swallow on `presentPaywall()` that was fixed and reviewed for the rooms feature.

## UI

A new "Companion" row in the Settings panel, below the existing Work/Short break/Long break/Sessions/Dark mode rows: three text buttons, one per skin ("🐱 Cat", "🐶 Dog", "🐰 Rabbit") — reusing the existing `.task-select-btn`-style selected/unselected visual treatment (an outlined button that fills with the accent color when active) rather than inventing new button chrome or adding image-preview plumbing. Dog and Rabbit show a lock glyph (🔒) appended to their label when the user isn't entitled; clicking a locked option is what triggers the paywall per the Data Flow above. The currently-active skin is always visually distinct, matching the highlight pattern already established for task-selection buttons elsewhere in this app.

## File Structure

- `renderer/timer-logic.js` (modified) — `AMBIENT_GIFS`/`CELEBRATION_GIFS` restructured by skin; `getAmbientGif()`/`pickCelebrationGif()` gain a `skin` parameter.
- `renderer/monetization.js` (modified) — new `ensureSkinAccess(userId)`.
- `renderer/app.js` (modified) — `loadSkin()`/`saveSkin()`; `state.skin`; `render()`/`showCelebration()` pass it through; new skin-button click handlers.
- `renderer/index.html` (modified) — new "Companion" row and three skin buttons in the Settings panel.
- `renderer/style.css` (modified) — styling for the new skin buttons and their locked/selected states.
- `tests/timer-logic.test.js` (modified) — extend existing `getAmbientGif`/`pickCelebrationGif` coverage to all three skins.

## Out of Scope

- Any change to RevenueCat's dashboard configuration, products, or entitlements — this reuses `pawmodoro_pro` exactly as already configured.
- Per-room or per-session skin choice — one skin per device, everywhere.
- Skins beyond Cat/Dog/Rabbit, or any way to add more later — YAGNI until there's a concrete reason.
- Any change to the shared-rooms gating flow (`ensureRoomAccess`, the free-trial flag) — skins get their own, separate, simpler gate function precisely so the two don't tangle.

## Testing

- `getAmbientGif`/`pickCelebrationGif`'s existing real unit tests extend to cover all three skins — this is genuinely pure logic, same as today.
- `ensureSkinAccess`, the Settings-panel wiring, and the paywall trigger are DOM/network-dependent and verified manually, consistent with how `ensureRoomAccess` and the rest of `rooms.js`/`app.js` are verified in this codebase.
- Live verification: as Cat (default), confirm the ambient/celebration GIFs are the existing cat ones, unchanged. Switch to Dog/Rabbit as an already-entitled user, confirm the correct GIFs show in every timer state (idle, work-running, work-paused, short-break, long-break, celebration). As a non-entitled user, confirm clicking Dog/Rabbit triggers the paywall, that completing a purchase applies the skin immediately, and that dismissing the paywall leaves the skin unchanged.
