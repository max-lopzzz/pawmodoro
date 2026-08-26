# Pawmodoro Room Accountability — Design

## Purpose

Add lightweight social accountability to shared rooms, at the user's therapist's suggestion for making the app more neurodivergent-friendly. The core problem: hyperfocus causes silently skipping breaks (now visible/deliberate rather than accidental, thanks to the break-enforcement work — see Dependency below), and there's currently no social signal when someone is repeatedly choosing to skip. This gives a body-doubling partner in a shared room two things: visibility into who's been skipping breaks, and a way to gently nudge them.

## Dependency

This design builds directly on the not-yet-merged break-enforcement branch (`worktree-pawmodoro-break-enforcement`, PR #4): specifically the "Skip Break" button (`elBtnSkipBreak`) and the fact that `onRoomSessionComplete()` now fires independently on every room participant's own client when their local countdown reaches zero (not just a single "race winner"), which the fix in that PR established. This branch should be built on top of `worktree-pawmodoro-break-enforcement`, not on `main` directly, and should not merge before PR #4 does.

## Constraints

- **Gated the same way as shared rooms themselves** — this is an enhancement to the existing (paywalled) rooms feature, not a separate free-tier addition. No new monetization work needed; it inherits the existing gate.
- **No database schema changes.** Everything rides on mechanisms already wired up: Supabase Realtime presence (already broadcasts nickname/status per participant) and Realtime broadcast (a mechanism this codebase hasn't used yet, but is part of the already-vendored `@supabase/supabase-js` SDK — no new dependency).
- **Skip-streak is tracked per-person, client-side, self-reported** — not room-wide. The room's shared timer means Skip Break advances the phase for everyone, but only the person who actually clicked it should have their own streak incremented; everyone else's is untouched by someone else's skip. This directly identifies who is the one habitually skipping, which is the actual goal (surfacing *your own* pattern to people working alongside you), not a vaguer room-wide signal.
- **Ephemeral, not persisted.** Skip-streak resets to 0 on room entry and isn't remembered across room sessions or outside of rooms — it's not a permanent record, just an in-the-moment signal for the people currently working with you. Nudges are one-off broadcast messages with no delivery guarantee and no history.
- **No changes to `deriveStatus()`** or the existing Focusing/Break/Idle/Away status model — the overworking signal is an orthogonal badge layered on top of the existing status display, not a replacement state.

## Architecture

Two additions to `renderer/rooms.js`, both built entirely on mechanisms already in place:

1. **Personal skip-streak.** `roomState.skipStreak` (starts at 0, reset on `enterRoom()`): incremented when *this* client's own Skip Break click fires; reset to 0 when *this* client's own break completes naturally (hooked into `onRoomSessionComplete()`, which per the break-enforcement fix already fires independently per-client). Broadcast as an added field on the same presence payload every participant already sends via `trackPresence()`.
2. **Nudge.** A one-off Supabase Realtime `broadcast` message (not `postgres_changes`, not presence — ephemeral, no DB write) sent on the room's existing channel. Any participant can nudge any other specific participant; the target's client filters for messages addressed to it and shows a toast.

## Data Flow

**Skip-streak:**
- `elBtnSkipBreak`'s room-mode branch (in `renderer/app.js`) increments `roomState.skipStreak` before calling `roomAttemptAdvance()` as before.
- `onRoomSessionComplete()` (in `renderer/rooms.js`) gains one check: if the phase that just completed (`state.sessionType` at the time it fires) was a break, reset `roomState.skipStreak = 0`.
- Both paths call `trackPresence()` explicitly afterward, since a streak change alone doesn't otherwise trigger a presence update (today, `updateRoomStatus()` only re-tracks presence when the derived Focusing/Break/Idle/Away status itself changes).
- `trackPresence()`'s payload gains one field: `skipStreak: roomState.skipStreak`.
- `renderParticipants()` reads `presence.skipStreak` for each participant and shows a badge reading "Skipped N breaks" (using the actual `skipStreak` count) next to their row when it's `>= 2`, in addition to — not instead of — their existing status label.

**Presence key:**
- `subscribeToRoom()` currently generates a random presence key inline (`roomId + ':' + Math.random().toString(36).slice(2)`) and discards it. This needs to be stored on `roomState` (e.g. `roomState.myPresenceKey`) so the client can later identify its own row (to hide the nudge button on it) and address nudges to specific other participants.

**Nudge:**
- Sending: a new small button on every participant row *except the current user's own row* (compared via `roomState.myPresenceKey`). Clicking it calls `roomState.channel.send({ type: 'broadcast', event: 'nudge', payload: { targetKey: <their presence key>, from: roomState.nickname } })`.
- Receiving: a new listener alongside the existing `presence`/`postgres_changes` listeners already registered in `subscribeToRoom()`: `channel.on('broadcast', { event: 'nudge' }, function (payload) { ... })`. It checks `payload.targetKey === roomState.myPresenceKey`; if it matches, shows a toast for a few seconds and plays a short tone (reusing the existing `AudioContext`-based approach from `playChime()`, but a distinct note/pattern so it's not confused with the phase-complete chime).
- A lightweight per-target cooldown (30 seconds) prevents nudge-spam: a local `roomState.lastNudgeAt` map keyed by target presence key, checked before sending.

## UI

- **Overworking badge**: a small, visually distinct pill next to a participant's row in the room panel reading "Skipped N breaks" (N = their broadcast `skipStreak`), shown only when it's `>= 2`.
- **Nudge button**: a small icon button on every row except your own. Always available (not gated behind the badge), but visually emphasized on rows currently showing the overworking badge — discoverable at the moment it matters most, without hard-restricting it to only that moment.
- **Receiving a nudge**: a brief auto-dismissing toast (a few seconds) — something like "Alex nudged you — take a break?" — plus a short distinct tone.

## File Structure

- `renderer/rooms-logic.js` (modified) — two new pure functions: `shouldFlagOverworking(skipStreak)` and `canNudge(lastNudgeAt, now, cooldownMs)`.
- `renderer/rooms.js` (modified) — `roomState` gains `skipStreak`, `myPresenceKey`, `lastNudgeAt`; `subscribeToRoom()` stores the presence key and adds the broadcast listener; `trackPresence()`'s payload gains `skipStreak`; `onRoomSessionComplete()` resets the streak on natural break completion; `renderParticipants()` renders the overworking badge and nudge buttons; a new nudge-send handler.
- `renderer/app.js` (modified) — `elBtnSkipBreak`'s room-mode branch increments `roomState.skipStreak` before calling `roomAttemptAdvance()`.
- `renderer/index.html` / `renderer/style.css` (modified) — toast markup/styling, badge styling, nudge button styling.

## Out of Scope

- Any change to the solo (non-room) timer — skip-streak and nudging only exist inside an active room.
- Persisting skip-streak or nudge history across room sessions, or to the database at all.
- Rate-limiting or moderation beyond the simple per-target nudge cooldown.
- Any change to `deriveStatus()` or the existing four-state status model.
- Push notifications outside the app (nudges only work while the app is open and the room channel is connected).

## Testing

- `shouldFlagOverworking(skipStreak)` and `canNudge(lastNudgeAt, now, cooldownMs)` get real unit tests in `tests/rooms-logic.test.js`, following the established pure-function pattern.
- Everything else (presence broadcasting, the broadcast channel listener, DOM rendering, toast/sound) is DOM/network wiring, verified manually — consistent with how the rest of `rooms.js` is tested today. Live verification (two real clients in one room): one client repeatedly clicks Skip Break and confirms their own badge appears at 2 skips and disappears after their next real break; the other client sends a nudge and confirms the first client sees the toast; confirm a client can't nudge the same target again within 30 seconds.
