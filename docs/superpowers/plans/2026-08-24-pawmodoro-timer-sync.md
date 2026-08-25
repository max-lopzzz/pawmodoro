# Pawmodoro Timer Sync + Group Celebration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared room's timer actually shared — anyone can start/pause/reset it and it propagates live to every participant, with synchronized group celebration when a work session completes.

**Architecture:** Extend the `rooms` table with timer-state columns (phase, remaining duration, start timestamp, running flag, completed-work counter). Every client derives its own countdown from timestamps rather than trusting a network-synced ticking integer, which avoids clock drift and means writes only happen on state *changes*. Phase advancement (when time's up) uses an optimistic-concurrency compare-and-swap so exactly one client's attempt wins the race, no custom database function needed. Local `state` becomes a mirror of the DB row while in a room, kept current via the same Realtime channel already used for presence (one more `postgres_changes` listener on it, no second channel).

**Tech Stack:** Same as the rooms foundation — `@supabase/supabase-js` v2, existing vanilla JS/Jest toolchain, no bundler.

**Spec:** `docs/superpowers/specs/2026-08-24-pawmodoro-timer-sync-design.md`

## Global Constraints

- Timer authority: anyone in the room can start/pause/reset — no host concept.
- While in a room, the existing timer UI becomes the shared timer — no dual displays.
- Per-room shared config and task-linked-timer selections stay per-device/local, matching the already-accepted rooms-foundation simplification — whoever's action lands determines duration for everyone that turn.
- Group celebration reuses the exact same overlay/GIF pool as solo — only timing is synchronized.
- `npm test` currently passes 74/74 after Task 1 lands (68 existing + 6 new for this plan's pure logic) — must keep passing.
- A real Supabase project is already wired up (unlike the rooms foundation, which had to defer live verification) — this plan's live round-trip testing can happen for real, not be deferred.
- Known, accepted simplification (documented here, not hidden): a paused room timer renders with the same ambient cat GIF as an idle one (no separate "paused" visual for room mode) — the DB only tracks `is_running`, not a three-way idle/paused/running state, and the button label ("Start" vs "Pause") is unaffected since it already only distinguishes running vs not-running.

---

### Task 1: Pure timer-sync logic

**Files:**
- Modify: `renderer/rooms-logic.js`
- Modify: `tests/rooms-logic.test.js`

**Interfaces:**
- Consumes: `getNextSession(currentType, completedWork, config)` from `renderer/timer-logic.js` — in Node/Jest via `require('./timer-logic')`, in the browser via the already-loaded global (script order already has `timer-logic.js` before `rooms-logic.js`).
- Produces: `computeSecondsLeft(row, now)` where `row` is `{ durationSeconds, startedAt, isRunning }` and `now` is a `Date.now()`-style millisecond timestamp, returning a number (can go negative once time is up — callers check `<= 0`). `computeAdvancePayload(row, config, workDurationSeconds)` where `row` is `{ phase, completedWork }`, returning `{ phase, durationSeconds, completedWork }`. Both added to `module.exports` alongside the existing exports. Task 2 calls both by these exact names and shapes.

- [ ] **Step 1: Write the failing tests**

Append to `tests/rooms-logic.test.js` (after the existing `const { ... } = require(...)` line, add the two new names to that destructure; then append the new `describe` blocks after the existing `deriveStatus` block):

Change the top import from:
```js
const {
  generateJoinCode,
  deriveStatus,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH
} = require('../renderer/rooms-logic')
```
to:
```js
const {
  generateJoinCode,
  deriveStatus,
  computeSecondsLeft,
  computeAdvancePayload,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH
} = require('../renderer/rooms-logic')
```

Append after the existing `deriveStatus` describe block (after its closing `})`):

```js
describe('computeSecondsLeft', () => {
  test('returns durationSeconds unchanged when not running', () => {
    expect(computeSecondsLeft({ durationSeconds: 100, startedAt: null, isRunning: false }, Date.now())).toBe(100)
  })

  test('counts down from durationSeconds based on elapsed time when running', () => {
    var now = Date.now()
    var startedAt = new Date(now - 10000).toISOString()
    expect(computeSecondsLeft({ durationSeconds: 100, startedAt: startedAt, isRunning: true }, now)).toBe(90)
  })

  test('can go negative once time is up (caller checks <= 0)', () => {
    var now = Date.now()
    var startedAt = new Date(now - 150000).toISOString()
    expect(computeSecondsLeft({ durationSeconds: 100, startedAt: startedAt, isRunning: true }, now)).toBe(-50)
  })
})

describe('computeAdvancePayload', () => {
  var config = { work: 25, shortBreak: 5, longBreak: 30, sessionsBeforeLongBreak: 4 }

  test('advances from work to short-break, incrementing completedWork', () => {
    var row = { phase: 'work', completedWork: 1 }
    var payload = computeAdvancePayload(row, config, 1500)
    expect(payload).toEqual({ phase: 'short-break', durationSeconds: 300, completedWork: 2 })
  })

  test('advances from work to long-break on the Nth session, incrementing completedWork', () => {
    var row = { phase: 'work', completedWork: 3 }
    var payload = computeAdvancePayload(row, config, 1500)
    expect(payload).toEqual({ phase: 'long-break', durationSeconds: 1800, completedWork: 4 })
  })

  test('advances from a break back to work, using the supplied work duration, completedWork unchanged', () => {
    var row = { phase: 'short-break', completedWork: 2 }
    var payload = computeAdvancePayload(row, config, 900)
    expect(payload).toEqual({ phase: 'work', durationSeconds: 900, completedWork: 2 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/rooms-logic.test.js`
Expected: FAIL — `computeSecondsLeft is not a function` (or similar; the exports don't exist yet).

- [ ] **Step 3: Write the implementation**

In `renderer/rooms-logic.js`, add this near the top of the file (right after the existing `JOIN_CODE_ALPHABET`/`JOIN_CODE_LENGTH` declarations, before `generateJoinCode`):

```js
var getNextSession = (typeof require !== 'undefined') ? require('./timer-logic').getNextSession : window.getNextSession
```

Add these two functions after the existing `deriveStatus` function (before the `module.exports` block):

```js
function computeSecondsLeft(row, now) {
  if (!row.isRunning) return row.durationSeconds
  var elapsedSeconds = Math.floor((now - new Date(row.startedAt).getTime()) / 1000)
  return row.durationSeconds - elapsedSeconds
}

function computeAdvancePayload(row, config, workDurationSeconds) {
  var nextCompletedWork = row.phase === 'work' ? row.completedWork + 1 : row.completedWork
  var next = getNextSession(row.phase, nextCompletedWork, config)
  return {
    phase: next.type,
    durationSeconds: next.type === 'work' ? workDurationSeconds : next.duration,
    completedWork: nextCompletedWork
  }
}
```

Update the `module.exports` block to:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateJoinCode,
    deriveStatus,
    computeSecondsLeft,
    computeAdvancePayload,
    JOIN_CODE_ALPHABET,
    JOIN_CODE_LENGTH
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/rooms-logic.test.js`
Expected: PASS, 15/15 (9 existing + 6 new).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 74/74 (68 existing + 6 new).

- [ ] **Step 6: Commit**

```bash
git add renderer/rooms-logic.js tests/rooms-logic.test.js
git commit -m "feat: add timer-sync pure logic (secondsLeft derivation, phase advance payload)"
```

---

### Task 2: Live timer sync — schema, sync wiring, and control hooks

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `renderer/rooms.js`
- Modify: `renderer/app.js`

**Interfaces:**
- Consumes: `computeSecondsLeft`, `computeAdvancePayload` (Task 1). The global `state`, `config`, `getWorkDuration()`, `loadTasks()`, `saveTasks()`, `playChime()`, `showCelebration()`, `render()` from `app.js`. `addMinutes()` from `todo-logic.js`. `renderTodoPanel()` (guarded, may not exist).
- Produces: `roomIsActive()`, `roomSecondsLeft()`, `roomHandleStart()`, `roomHandleReset()`, `onRoomSessionComplete()` — all global functions in `rooms.js`, called from the new hook points added to `app.js`'s `tick()`, `elBtnStart`/`elBtnReset` handlers, and `showCelebration()`'s dismiss logic.

- [ ] **Step 1: Add the schema columns and update policy**

In `supabase/schema.sql`, append after the existing `create policy "anyone can create rooms"` block (at the end of the file):

```sql

alter table rooms add column phase text not null default 'work';
alter table rooms add column duration_seconds integer not null default 1500;
alter table rooms add column started_at timestamptz;
alter table rooms add column is_running boolean not null default false;
alter table rooms add column completed_work integer not null default 0;

create policy "anyone can update rooms" on rooms
  for update using (true) with check (true);
```

- [ ] **Step 2: Run this against the live Supabase project**

This machine has a real Supabase project configured (`renderer/supabase-config.js` has real credentials, not placeholders). Paste the new SQL block from Step 1 (just the new statements, not the whole file) into the project's SQL Editor and run it. Confirm it succeeds — the `rooms` table should now show 5 new columns when you check the Table Editor.

- [ ] **Step 3: Extend `roomState` with the new fields**

In `renderer/rooms.js`, change:
```js
var roomState = {
  roomId: null,
  joinCode: null,
  channel: null,
  nickname: '',
  isAway: false,
  lastStatus: null
}
```
to:
```js
var roomState = {
  roomId: null,
  joinCode: null,
  channel: null,
  nickname: '',
  isAway: false,
  lastStatus: null,
  timerRow: null,
  tickInterval: null
}
```

- [ ] **Step 4: Add `applyRoomTimerRow`, `roomIsActive`, `roomSecondsLeft`**

Add this new section to `renderer/rooms.js`, after the `// ── Presence rendering ──────────────────────────` block and before `// ── Create / Join / Leave ───────────────────────`:

```js
// ── Timer sync ───────────────────────────────────

function applyRoomTimerRow(row) {
  roomState.timerRow = row
  state.sessionType = row.phase
  state.completedWork = row.completed_work
  state.timerState = row.is_running ? 'running' : 'idle'
  state.secondsLeft = computeSecondsLeft({
    durationSeconds: row.duration_seconds,
    startedAt: row.started_at,
    isRunning: row.is_running
  }, Date.now())
  render()
}

function roomIsActive() {
  return !!roomState.roomId
}

function roomSecondsLeft() {
  return computeSecondsLeft({
    durationSeconds: roomState.timerRow.duration_seconds,
    startedAt: roomState.timerRow.started_at,
    isRunning: roomState.timerRow.is_running
  }, Date.now())
}

function roomHandleStart() {
  var row = roomState.timerRow
  var updates
  if (row.is_running) {
    var elapsedSeconds = Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000)
    updates = { duration_seconds: row.duration_seconds - elapsedSeconds, started_at: null, is_running: false }
  } else {
    updates = { started_at: new Date().toISOString(), is_running: true }
  }
  supabaseClient.from('rooms').update(updates).eq('id', roomState.roomId).then(function () {})
}

function roomHandleReset() {
  var row = roomState.timerRow
  var duration = row.phase === 'work'
    ? getWorkDuration()
    : config[row.phase === 'short-break' ? 'shortBreak' : 'longBreak'] * 60
  supabaseClient.from('rooms')
    .update({ duration_seconds: duration, started_at: null, is_running: false })
    .eq('id', roomState.roomId)
    .then(function () {})
}

function roomAttemptAdvance() {
  var row = roomState.timerRow
  var workDuration = getWorkDuration()
  var payload = computeAdvancePayload(
    { phase: row.phase, completedWork: row.completed_work },
    config,
    workDuration
  )
  supabaseClient.from('rooms')
    .update({
      phase: payload.phase,
      duration_seconds: payload.durationSeconds,
      started_at: null,
      is_running: false,
      completed_work: payload.completedWork
    })
    .eq('id', roomState.roomId)
    .eq('phase', row.phase)
    .eq('started_at', row.started_at)
    .then(function () {})
}

function onRoomSessionComplete() {
  if (state.sessionType === 'work' && state.activeTaskId) {
    var tasks = loadTasks()
    tasks = addMinutes(tasks, state.activeTaskId, state.sessionWorkMinutes)
    saveTasks(tasks)
    if (typeof renderTodoPanel === 'function') renderTodoPanel()
  }
  playChime()
  showCelebration()
  roomAttemptAdvance()
}
```

- [ ] **Step 5: Wire the `postgres_changes` subscription**

In `renderer/rooms.js`, change `subscribeToRoom`:

```js
function subscribeToRoom(roomId) {
  var channel = supabaseClient.channel('room:' + roomId, {
    config: { presence: { key: roomId + ':' + Math.random().toString(36).slice(2) } }
  })

  channel.on('presence', { event: 'sync' }, renderParticipants)

  channel.subscribe(function (status) {
    if (status === 'SUBSCRIBED') {
      roomState.channel = channel
      trackPresence()
      renderParticipants()
    }
  })

  return channel
}
```

to:

```js
function subscribeToRoom(roomId) {
  var channel = supabaseClient.channel('room:' + roomId, {
    config: { presence: { key: roomId + ':' + Math.random().toString(36).slice(2) } }
  })

  channel.on('presence', { event: 'sync' }, renderParticipants)

  channel.on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'rooms',
    filter: 'id=eq.' + roomId
  }, function (payload) {
    applyRoomTimerRow(payload.new)
  })

  channel.subscribe(function (status) {
    if (status === 'SUBSCRIBED') {
      roomState.channel = channel
      trackPresence()
      renderParticipants()
    }
  })

  return channel
}
```

- [ ] **Step 6: Make `enterRoom` apply the initial row and start the room's tick loop**

Change:
```js
function enterRoom(roomId, joinCode) {
  roomState.roomId = roomId
  roomState.joinCode = joinCode
  roomState.nickname = getNickname()
  localStorage.setItem('room-nickname', roomState.nickname)
  subscribeToRoom(roomId)
  elRoomCodeValue.textContent = joinCode
  elRoomPanel.classList.add('in-room')
  clearRoomError()
}
```
to:
```js
function enterRoom(row) {
  roomState.roomId = row.id
  roomState.joinCode = row.join_code
  roomState.nickname = getNickname()
  localStorage.setItem('room-nickname', roomState.nickname)
  applyRoomTimerRow(row)
  subscribeToRoom(row.id)
  roomState.tickInterval = setInterval(tick, 1000)
  elRoomCodeValue.textContent = row.join_code
  elRoomPanel.classList.add('in-room')
  clearRoomError()
}
```

Update both call sites. In the `elBtnRoomCreate` handler, change `enterRoom(result.data.id, result.data.join_code)` to `enterRoom(result.data)`. In the `elBtnRoomJoin` handler, change `enterRoom(result.data.id, result.data.join_code)` to `enterRoom(result.data)`.

- [ ] **Step 7: Clear the tick interval and reset to solo idle on leave**

Change:
```js
elBtnRoomLeave.addEventListener('click', function () {
  if (roomState.channel) {
    supabaseClient.removeChannel(roomState.channel)
  }
  roomState.roomId = null
  roomState.joinCode = null
  roomState.channel = null
  roomState.lastStatus = null
  elRoomParticipants.innerHTML = ''
  elRoomPanel.classList.remove('in-room')
})
```
to:
```js
elBtnRoomLeave.addEventListener('click', function () {
  if (roomState.channel) {
    supabaseClient.removeChannel(roomState.channel)
  }
  if (roomState.tickInterval) {
    clearInterval(roomState.tickInterval)
  }
  roomState.roomId = null
  roomState.joinCode = null
  roomState.channel = null
  roomState.lastStatus = null
  roomState.timerRow = null
  roomState.tickInterval = null
  elRoomParticipants.innerHTML = ''
  elRoomPanel.classList.remove('in-room')

  state.sessionType = 'work'
  state.secondsLeft = config.work * 60
  state.completedWork = 0
  state.timerState = 'idle'
  render()
})
```

- [ ] **Step 8: Wire `tick()` to follow the room when active**

In `renderer/app.js`, change:
```js
function tick() {
  if (state.secondsLeft <= 0) {
    onSessionComplete()
    render()
    return
  }
  state.secondsLeft -= 1
  render()
}
```
to:
```js
function tick() {
  if (typeof roomIsActive === 'function' && roomIsActive()) {
    state.secondsLeft = roomSecondsLeft()
    if (state.secondsLeft <= 0 && state.timerState !== 'complete') {
      state.timerState = 'complete'
      onRoomSessionComplete()
    }
    render()
    return
  }
  if (state.secondsLeft <= 0) {
    onSessionComplete()
    render()
    return
  }
  state.secondsLeft -= 1
  render()
}
```

- [ ] **Step 9: Wire the Start/Reset handlers to delegate when in a room**

In `renderer/app.js`, change:
```js
elBtnStart.addEventListener('click', function () {
  if (state.timerState === 'complete') return
  if (state.timerState === 'running') {
    clearInterval(state.interval)
    state.interval = null
    state.timerState = 'paused'
  } else {
    if (state.sessionType === 'work' && state.timerState === 'idle') {
      state.sessionWorkMinutes = Math.round(state.secondsLeft / 60)
    }
    state.timerState = 'running'
    state.interval = setInterval(tick, 1000)
  }
  render()
})

elBtnReset.addEventListener('click', function () {
  clearInterval(state.interval)
  state.interval = null
  state.timerState = 'idle'
  state.secondsLeft = state.sessionType === 'work'
    ? getWorkDuration()
    : config[state.sessionType === 'short-break' ? 'shortBreak' : 'longBreak'] * 60
  render()
})
```
to:
```js
elBtnStart.addEventListener('click', function () {
  if (typeof roomIsActive === 'function' && roomIsActive()) {
    roomHandleStart()
    return
  }
  if (state.timerState === 'complete') return
  if (state.timerState === 'running') {
    clearInterval(state.interval)
    state.interval = null
    state.timerState = 'paused'
  } else {
    if (state.sessionType === 'work' && state.timerState === 'idle') {
      state.sessionWorkMinutes = Math.round(state.secondsLeft / 60)
    }
    state.timerState = 'running'
    state.interval = setInterval(tick, 1000)
  }
  render()
})

elBtnReset.addEventListener('click', function () {
  if (typeof roomIsActive === 'function' && roomIsActive()) {
    roomHandleReset()
    return
  }
  clearInterval(state.interval)
  state.interval = null
  state.timerState = 'idle'
  state.secondsLeft = state.sessionType === 'work'
    ? getWorkDuration()
    : config[state.sessionType === 'short-break' ? 'shortBreak' : 'longBreak'] * 60
  render()
})
```

- [ ] **Step 10: Wire celebration dismiss to re-render from synced state in a room**

In `renderer/app.js`, change:
```js
function showCelebration() {
  var gif = pickCelebrationGif()
  elCatCelebr.src = '../assets/' + gif
  elOverlay.classList.add('visible')

  var dismissed = false

  function hideCelebration() {
    if (dismissed) return
    dismissed = true
    clearTimeout(timeout)
    elOverlay.classList.remove('visible')
    advanceSession()
  }

  var timeout = setTimeout(hideCelebration, 3500)
  elOverlay.addEventListener('click', hideCelebration, { once: true })
}
```
to:
```js
function showCelebration() {
  var gif = pickCelebrationGif()
  elCatCelebr.src = '../assets/' + gif
  elOverlay.classList.add('visible')

  var dismissed = false

  function hideCelebration() {
    if (dismissed) return
    dismissed = true
    clearTimeout(timeout)
    elOverlay.classList.remove('visible')
    if (typeof roomIsActive === 'function' && roomIsActive()) {
      render()
    } else {
      advanceSession()
    }
  }

  var timeout = setTimeout(hideCelebration, 3500)
  elOverlay.addEventListener('click', hideCelebration, { once: true })
}
```

- [ ] **Step 11: Run the test suite**

Run: `npm test`
Expected: PASS, 74/74, unchanged (this task adds DOM/network wiring, not logic covered by tests — matches the established pattern where `app.js`/`todo.js`/`rooms.js`'s DOM wiring is verified manually, not unit-tested).

- [ ] **Step 12: Manual live round-trip verification**

Run `npm start` in two terminals (two Electron instances). In window 1, create a room; in window 2, join with that code. Then:
- Click Start in window 1 — confirm window 2's timer starts counting down within a couple seconds, without window 2 needing any interaction.
- Click Pause (same button) in window 2 — confirm window 1 also pauses at the same remaining time.
- Click Start again in window 1 to resume — confirm both continue from the same remaining time, not restarted.
- Click Reset in either window — confirm both return to the full phase duration, still paused/idle.
- Quit and relaunch window 2 (or open a third instance) and join the same room mid-countdown — confirm it immediately shows the correct in-progress remaining time, not a fresh timer.
- Let (or fast-forward via a short configured work duration in Settings, e.g. 1 minute, in both windows before starting) a work session run out — confirm both windows show a celebration overlay within a few seconds of each other, and after both dismiss (click or wait), both land on the same next phase (short-break or long-break) with the correct session-dot count.

Note any discrepancy in your report — this is genuinely live-tested, not deferred, since a real Supabase project exists.

- [ ] **Step 13: Commit**

```bash
git add supabase/schema.sql renderer/rooms.js renderer/app.js
git commit -m "feat: sync timer state and group celebration across room participants"
```
