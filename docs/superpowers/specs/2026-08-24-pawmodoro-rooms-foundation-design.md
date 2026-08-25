# Pawmodoro Shared Rooms — Foundation (Sub-project A) — Design

## Purpose

The Pawmodoro spec's "shared study rooms" feature is too large for one implementation cycle. This is the first of two sub-projects: get rooms, presence, and participant identity working, without yet syncing the timer itself (that's sub-project B, "Timer sync + group celebration") and without any paywall gating (that's the separate RevenueCat monetization sub-project).

By the end of this sub-project: a user can create a room, get a shareable code, another user can join with that code, and both see a live participant list with each person's status (focusing / on break / idle / away) — but starting/pausing the timer stays purely local to each device.

## Constraints

- No existing Supabase project exists yet. You (the user) must create one and provide the project URL + anon key before the implementation's Supabase-dependent tasks can be verified end-to-end — I cannot create third-party accounts on your behalf. Non-Supabase-dependent tasks (schema SQL, file scaffolding) can proceed without it; live verification is deferred until credentials exist, the same pattern used for the iOS sub-project's Xcode dependency.
- No bundler exists in this project (plain `<script>` tags). Any new library must be usable that way.
- The existing `renderer/` → `www/`/`ios/App/App/public/` sync script (`scripts/sync-ios-www.js`) only copies files directly inside `renderer/`, not subdirectories — new files must stay top-level in `renderer/` to flow through it unmodified.
- Participant identity: Supabase anonymous auth (not nickname-only local IDs) — gives real `auth.uid()` values for RLS policies.
- Joining a room is by typed code only — no deep links (no OS URL-scheme registration on either platform).
- This sub-project's status set is `focusing` / `break` / `idle` / `away`, computed entirely from *local* timer state — no cross-client timer sync yet, so two participants both marked "focusing" are not necessarily on the same countdown.

## Architecture & Data Flow

- **`rooms` table** (Supabase Postgres) — the only table. No `room_participants` table: the live participant list comes entirely from Supabase Realtime **Presence**, not from database rows.
- **Auth:** on app start, check for an existing Supabase session (persisted via the client's default `localStorage`-backed session store); if none, call `signInAnonymously()` once. The same anonymous identity survives app restarts on that device.
- **Create room:** generate a 6-character code (uppercase letters + digits, excluding ambiguous characters `0`/`O`, `1`/`I`/`L`), insert a `rooms` row, retry on the rare unique-collision.
- **Join room:** look up `rooms` by the entered code; if found, subscribe to a Realtime Presence channel named after the room's `id`. If not found, surface an inline "Room not found" error.
- **Presence:** each client calls `channel.track({ nickname, status })` on join and re-calls it whenever local status changes. Supabase broadcasts join/leave/sync presence events to every subscriber automatically. Closing the app disconnects the channel, which Presence treats as leaving — no explicit cleanup code needed.
- **Status derivation** (local only, re-tracked on every change):
  - `focusing` — timer running, session type `work`
  - `break` — timer running, session type `short-break` or `long-break`
  - `idle` — timer paused or stopped
  - `away` — window blurred (Electron `blur` event on the main window) or app backgrounded (iOS, via Capacitor's `App` plugin `appStateChange` listener)

## Schema & RLS

```sql
create table rooms (
  id uuid primary key default gen_random_uuid(),
  join_code text unique not null,
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;

create policy "anyone can read rooms" on rooms
  for select using (true);

create policy "anyone can create rooms" on rooms
  for insert with check (true);
```

The anon key is meant to be public (protected by RLS, not secrecy — standard Supabase practice), so these policies are intentionally permissive: any signed-in-anonymous client can look up or create a room. No update/delete policy — rooms aren't editable or deletable in this sub-project (room cleanup/expiry is explicitly deferred). Realtime Presence itself needs no table or RLS policy — it's channel-based, not row-based.

## File Structure

- `renderer/supabase.js` (new, vendored) — the Supabase JS UMD bundle, copied from `node_modules/@supabase/supabase-js/dist/umd/supabase.js` (verified to exist at that path, ~212KB). Committed as a plain file so it flows through Electron's direct load *and* the existing iOS sync script unmodified — both already pick up every top-level file in `renderer/`.
- `renderer/supabase-config.js` (new) — `window.SUPABASE_URL = "..."` and `window.SUPABASE_ANON_KEY = "..."`. Safe to commit (anon key, not a secret) once real values exist; ships with placeholder values until then.
- `renderer/rooms.js` (new) — the whole feature: auth bootstrap, create/join/leave, presence tracking, status computation (timer-state + focus/blur), rendering the room panel. Reads the global `state` object from `app.js` directly, the same pattern `todo.js` already uses.
- `renderer/index.html` (modified) — new "Room" icon button mirroring `#btn-settings`, and a `.room-panel` block mirroring `.settings-panel`'s structure (header, body, close button).
- `renderer/style.css` (modified) — new `.room-panel` styles, reusing the existing `.settings-panel`/`.visible` sliding-panel pattern.
- `package.json` (modified) — add `@supabase/supabase-js` to `devDependencies` (used only for its shipped browser bundle and version pinning, never `require`d by Electron/Node code — same non-runtime-dependency situation the Capacitor packages were in, fixed the same way).

## Room Panel UI

- **Not in a room:** a nickname input (pre-filled from `localStorage` if set before, editable) plus either a "Create Room" button or a code-entry field with a "Join" button.
- **In a room:** the room code displayed prominently (for sharing verbally or by message — no deep link), the live participant list (nickname + status icon per person, updating in real time via Presence), and a "Leave Room" button.
- **Errors surfaced inline in the panel**, not as popups/alerts: "Room not found" for a bad code, "Couldn't connect" if Supabase is unreachable (network issue or misconfigured credentials) — both annotate the relevant input rather than blocking the whole panel.

## Out of Scope

Deferred to their own sub-projects or follow-up work:
- Actual timer state syncing across clients (sub-project B: "Timer sync + group celebration")
- Paywall/room limits, RevenueCat integration (separate monetization sub-project)
- Room deletion/expiry, stale-room cleanup
- Deep-link joining (shareable URL that auto-fills the code)
- The new cat/dog/rabbit cosmetic art assets (separate future sub-project, not yet designed)

## Testing

- Supabase-independent: file scaffolding, the `rooms` table SQL syntax, status-derivation logic (pure function of timer state + focus/blur, testable with Jest the same way `timer-logic.js` is) can all be verified without live credentials.
- Supabase-dependent (deferred until you provide project URL + anon key): actual room create/join round-trip, Presence join/leave/sync events across two simultaneous clients, RLS policy behavior.
- Manual Electron smoke check: two simultaneous `npm start` instances joining the same room should see each other in the presence list with correct statuses.
