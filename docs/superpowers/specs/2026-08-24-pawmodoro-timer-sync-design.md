# Pawmodoro Timer Sync + Group Celebration — Design

## Purpose

The shared-rooms foundation (create/join by code, live presence with locally-derived status) is merged and working. This sub-project is the harder half of "shared study rooms": making the timer itself shared — start/pause/reset propagate live to every participant, and the celebration moment when a work session completes happens in sync across everyone in the room. This is the demo video's centerpiece beat.

No paywall/monetization gating is touched here (separate sub-project), and no new art (the cat/dog/rabbit asset swap is separate and deferred).

## Constraints

- Timer authority: **anyone in the room** can start/pause/reset — no host concept, no handoff logic.
- While in a room, the existing timer UI **becomes** the shared timer (no dual timer displays). Leaving a room resets the local timer to a fresh solo idle state (phase `work`, `completedWork` 0, using local config) — the same "clean slate" pattern the existing Save Settings handler already uses.
- Per-room shared config (work/break durations) is explicitly out of scope: each client uses its own local settings when determining a phase's full duration. Whoever starts a fresh phase sets that duration for everyone in the room for that phase. Same for task-linked timer selections — per-device, not synced.
- Group celebration reuses the exact same overlay/GIF pool as solo celebration — only the *timing* is synchronized, not the visual. Real visual distinction is deferred to a future art sub-project.
- No Supabase project existed when the rooms foundation was built, but one now does (already wired into `renderer/supabase-config.js`) — this sub-project's Supabase-dependent pieces can be verified live, not deferred like before.

## Data Model

Extend the existing `rooms` table:

```sql
alter table rooms add column phase text not null default 'work';
alter table rooms add column duration_seconds integer not null default 1500;
alter table rooms add column started_at timestamptz;
alter table rooms add column is_running boolean not null default false;
alter table rooms add column completed_work integer not null default 0;

create policy "anyone can update rooms" on rooms
  for update using (true) with check (true);
```

`duration_seconds` means "seconds remaining in the current phase as of `started_at`" — when paused/idle it's simply the frozen remaining count. Every client derives `secondsLeft` locally:

```
secondsLeft = is_running ? duration_seconds - (now - started_at) : duration_seconds
```

Nobody trusts a ticking integer over the network — everyone derives from timestamps. This avoids clock drift and means writes happen only on state *changes* (start/pause/reset/phase-advance), not every second. `completed_work` mirrors the existing local `state.completedWork` and drives the same `getNextSession()` pure function already in `renderer/timer-logic.js` — reused as-is, not duplicated.

The existing permissive `select`/`insert` policies from the rooms foundation stay unchanged; this adds the `update` policy needed for timer actions.

## Actions

All actions match existing solo semantics exactly — they're now written to the row instead of mutating local `state` directly:

- **Start (from idle)**: `duration_seconds` = full phase length (using whichever participant clicked — their local task-linked remaining time if any, exactly like solo `getWorkDuration()`), `started_at = now()`, `is_running = true`.
- **Start (resuming from paused)**: same, but `duration_seconds` keeps its already-frozen remaining value.
- **Pause**: `duration_seconds = duration_seconds - (now - started_at)` (freeze remaining time), `started_at = null`, `is_running = false`.
- **Reset**: resets `duration_seconds` back to the *current phase's* full length, `started_at = null`, `is_running = false`. Does **not** change `phase` or `completed_work` — matches the existing solo Reset handler exactly (confirmed by reading it: it only resets the countdown, never the phase or completed-work counter).
- **Phase advance (time's up)**: a compare-and-swap update — `UPDATE rooms SET phase=<next>, duration_seconds=<next duration>, started_at=null, is_running=false, completed_work=completed_work+1 (if phase was work) WHERE id=<room> AND phase=<what I last saw> AND started_at=<what I last saw>`. Whichever client's tick notices "time's up" first wins the race; every other client's identical attempt matches zero rows and is a silent no-op. No custom Postgres function needed — plain PostgREST `.update().eq(...).eq(...)` implements this.

## Integration with `app.js`

The existing `tick()` / `onSessionComplete()` / `showCelebration()` architecture stays almost entirely intact. Four small, guarded hook points, following the exact `if (typeof X === 'function')` pattern already used for `updateRoomStatus()`:

- **`elBtnStart` click handler**: if in a room, delegate to `roomHandleStart()` (writes the DB action) and `return` early instead of mutating local `state`. Unchanged when not in a room.
- **`elBtnReset` click handler**: same pattern, delegates to `roomHandleReset()`.
- **`tick()`**: when in a room, instead of `state.secondsLeft -= 1`, recompute `state.secondsLeft` from the room's synced `started_at`/`duration_seconds` (wall-clock-derived, no drift) — same `setInterval(tick, 1000)` loop, different math. When it detects `secondsLeft <= 0`, it triggers celebration locally *and* asks rooms.js to attempt the phase-advance compare-and-swap, guarded so only one attempt fires (not one per tick while waiting for the DB to confirm).
- **Celebration dismiss**: when in a room, instead of calling local `advanceSession()` (which computes the next phase itself), it re-renders from whatever the *synced* row currently says — the compare-and-swap advance should already have landed within the celebration's ~3.5s window, so every client converges on the same next phase.

The single source of truth while in a room is always the DB row; local `state` becomes a mirror of it, updated whenever a `postgres_changes` event arrives or whenever a client's own action succeeds.

## Celebration Timing

Since every client computes `secondsLeft` from the *same* `started_at`, they all cross zero within milliseconds of each other independently — no separate "celebrate now" broadcast message is needed. The synchronized celebration the base spec asks for falls out of the sync mechanism for free, not from any extra coordination code.

## Join/Leave Lifecycle

- **Joining** (including mid-session): fetch the current row once, apply it to local `state` immediately (so a latecomer sees the correct in-progress countdown, not a fresh timer), then subscribe for live updates.
- **Subscribing**: the existing Realtime channel (already created for presence in the rooms foundation) gets one additional `.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'id=eq.<roomId>' }, callback)` listener — no second channel needed, Supabase multiplexes presence and postgres_changes events on the same channel.
- **Leaving**: unsubscribe, and reset local `state` to a fresh solo idle timer (phase `work`, `completedWork` 0, local config) — same pattern as the existing Save Settings handler.

## File Structure

- `renderer/rooms-logic.js` (extended) — two new pure, testable functions: `computeSecondsLeft({ durationSeconds, startedAt, isRunning }, now)` and `computeAdvancePayload(row, config)` (reuses `getNextSession()` from `timer-logic.js` to build the phase-advance write payload). Matches this file's existing pure-logic role from the rooms foundation.
- `renderer/rooms.js` (extended) — the DB actions (`roomHandleStart`, `roomHandleReset`, `attemptPhaseAdvance`), applying incoming row updates to local `state`, and fetch-on-join.
- `renderer/app.js` (modified) — the four guarded hook points described above.
- `supabase/schema.sql` (modified) — the five new columns plus the `update` RLS policy.

## Out of Scope

- Per-room shared config and task-linked-timer sync (see Constraints).
- Visually distinct group celebration (see Constraints) — deferred to the future art sub-project.
- Host/authority model — already decided against.
- Room deletion/expiry, deep links, more than one room per user, paywall gating — all already out of scope from the rooms foundation and still untouched here.
- Reconnection/offline handling beyond what the Supabase client already does automatically.

## Testing

- `computeSecondsLeft` and `computeAdvancePayload` are pure functions, fully unit-testable with fixed timestamps and fixture rows/configs — no live Supabase project needed.
- Live verification (the actual point of this sub-project): two real `npm start` instances in the same room, confirming start/pause/reset propagate to both within a couple seconds, a latecomer joining mid-session sees the correct in-progress countdown, and both clients' celebration overlays appear within the same few seconds of each other when a work session completes, converging on the same next phase afterward.
