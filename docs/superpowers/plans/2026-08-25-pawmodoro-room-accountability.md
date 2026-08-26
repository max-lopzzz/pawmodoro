# Pawmodoro Room Accountability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give shared-room participants lightweight social accountability: a personal, self-reported "skip streak" visible to everyone in the room when someone has skipped 2+ breaks in a row, and a one-click "Nudge" any participant can send any other participant to gently prompt them to take a break.

**Architecture:** Two additions riding entirely on mechanisms already wired up in `renderer/rooms.js` — Realtime presence (already broadcasts nickname/status per participant) gains one more field (`skipStreak`); Realtime broadcast (not yet used in this codebase, but already part of the vendored `@supabase/supabase-js` SDK) carries one-off nudge messages. No database schema changes.

**Tech Stack:** Vanilla JS (no bundler, no framework), Supabase Realtime (presence + a new use of broadcast), Web Audio API for the nudge tone (reusing the existing `AudioContext` pattern).

**Spec:** [docs/superpowers/specs/2026-08-25-pawmodoro-room-accountability-design.md](../specs/2026-08-25-pawmodoro-room-accountability-design.md)

## Global Constraints

- No bundler — every script loads via a plain `<script>` tag; no ES modules, no `import`/`require` in renderer code.
- Match existing code style exactly: `var` declarations, named `function` statements (no arrow functions).
- Skip-streak is **per-person, self-reported, client-side** — never room-wide. It's incremented only by the client whose own Skip Break click fired it; other participants' streaks are untouched by someone else's click.
- Skip-streak is **ephemeral**: reset to 0 on room entry, cleared on leave, never written to the database, never persisted across room sessions.
- **`deriveStatus()` in `renderer/rooms-logic.js` is not touched.** The overworking badge is an orthogonal display concern layered on top of the existing Focusing/Break/Idle/Away status, not a new status value.
- Nudges are **best-effort, no delivery guarantee, no retry, no history** — `RealtimeChannelSendResponse` (the resolved value of `channel.send()`) is a plain string (`'ok' | 'timed out' | 'error'`), not an object with an `.error` property. Do not copy the `.then(function (result) { if (result.error) ... })` pattern used elsewhere in this file for Postgrest calls — that pattern is wrong for `channel.send()` and would silently never fire (verified against `node_modules/@supabase/realtime-js/dist/module/RealtimeChannel.d.ts`). Fire-and-forget is correct here.
- This is a shared-rooms feature, so it inherits the existing purchase gate automatically — no monetization changes needed in this plan.
- The full test suite (`npm test`) must stay at its current count plus this plan's new tests, with zero regressions on existing tests.

---

### Task 1: Pure logic — `shouldFlagOverworking` and `canNudge`

**Files:**
- Modify: `renderer/rooms-logic.js`
- Modify: `tests/rooms-logic.test.js`

**Interfaces:**
- Produces: `shouldFlagOverworking(skipStreak)` → boolean. `canNudge(lastNudgeAt, now, cooldownMs)` → boolean. Both exported via the existing `module.exports` block. Task 2 consumes `shouldFlagOverworking`; Task 3 consumes `canNudge`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/rooms-logic.test.js` (extend the existing `require` destructure at the top of the file to also pull in `shouldFlagOverworking` and `canNudge`, and add these two new `describe` blocks anywhere after the existing ones):

```js
describe('shouldFlagOverworking', () => {
  test('returns false below the threshold', () => {
    expect(shouldFlagOverworking(0)).toBe(false)
    expect(shouldFlagOverworking(1)).toBe(false)
  })

  test('returns true at and above the threshold', () => {
    expect(shouldFlagOverworking(2)).toBe(true)
    expect(shouldFlagOverworking(5)).toBe(true)
  })
})

describe('canNudge', () => {
  test('returns true when no prior nudge has been sent', () => {
    expect(canNudge(null, Date.now(), 30000)).toBe(true)
    expect(canNudge(undefined, Date.now(), 30000)).toBe(true)
  })

  test('returns false within the cooldown window', () => {
    var now = Date.now()
    expect(canNudge(now - 10000, now, 30000)).toBe(false)
  })

  test('returns true once the cooldown window has elapsed', () => {
    var now = Date.now()
    expect(canNudge(now - 30000, now, 30000)).toBe(true)
    expect(canNudge(now - 40000, now, 30000)).toBe(true)
  })
})
```

The top of `tests/rooms-logic.test.js` currently reads:
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
Change it to:
```js
const {
  generateJoinCode,
  deriveStatus,
  computeSecondsLeft,
  computeAdvancePayload,
  shouldFlagOverworking,
  canNudge,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH
} = require('../renderer/rooms-logic')
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx jest tests/rooms-logic.test.js` (if it hangs in this sandboxed environment, use `npx jest --watchman=false --forceExit --runInBand tests/rooms-logic.test.js` instead — a known quirk of this worktree, unrelated to your changes)

Expected: FAIL — `shouldFlagOverworking is not a function` / `canNudge is not a function`.

- [ ] **Step 3: Implement**

In `renderer/rooms-logic.js`, add these two functions after `computeAdvancePayload` (before the `module.exports` block):

```js
function shouldFlagOverworking(skipStreak) {
  return skipStreak >= 2
}

function canNudge(lastNudgeAt, now, cooldownMs) {
  if (!lastNudgeAt) return true
  return (now - lastNudgeAt) >= cooldownMs
}
```

Update the `module.exports` block from:
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
to:
```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateJoinCode,
    deriveStatus,
    computeSecondsLeft,
    computeAdvancePayload,
    shouldFlagOverworking,
    canNudge,
    JOIN_CODE_ALPHABET,
    JOIN_CODE_LENGTH
  }
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx jest tests/rooms-logic.test.js` (or with the flags from Step 2 if it hangs)

Expected: PASS, all tests including the 6 new ones.

- [ ] **Step 5: Run the full suite**

Run: `npm test` (or `npx jest --watchman=false --forceExit --runInBand` if it hangs)

Expected: all suites pass, count increased by exactly 6 (this task's new tests) over the baseline, zero regressions.

- [ ] **Step 6: Commit**

```bash
git add renderer/rooms-logic.js tests/rooms-logic.test.js
git commit -m "feat: add pure overworking-detection and nudge-cooldown logic"
```

---

### Task 2: Personal skip-streak — tracking and the overworking badge

**Files:**
- Modify: `renderer/rooms.js`
- Modify: `renderer/app.js`
- Modify: `renderer/style.css`

**Interfaces:**
- Consumes: `shouldFlagOverworking(skipStreak)` from Task 1.
- Produces: `roomState.skipStreak` (a live, mutable field other code reads/writes); `trackPresence()`'s broadcast payload gains a `skipStreak` field, which Task 3 does not need but which `renderParticipants()` (modified further by Task 3) continues to read.

- [ ] **Step 1: Add `skipStreak` to `roomState`**

Current (`renderer/rooms.js`, the `roomState` declaration):
```js
var roomState = {
  roomId: null,
  joinCode: null,
  channel: null,
  nickname: '',
  isAway: false,
  lastStatus: null,
  timerRow: null,
  tickInterval: null,
  celebratedFor: null
}
```

Replace with:
```js
var roomState = {
  roomId: null,
  joinCode: null,
  channel: null,
  nickname: '',
  isAway: false,
  lastStatus: null,
  timerRow: null,
  tickInterval: null,
  celebratedFor: null,
  skipStreak: 0
}
```

- [ ] **Step 2: Broadcast `skipStreak` in presence**

Current (`renderer/rooms.js`):
```js
function trackPresence() {
  if (!roomState.channel) return
  roomState.channel.track({ nickname: roomState.nickname, status: currentStatus() })
}
```

Replace with:
```js
function trackPresence() {
  if (!roomState.channel) return
  roomState.channel.track({ nickname: roomState.nickname, status: currentStatus(), skipStreak: roomState.skipStreak })
}
```

- [ ] **Step 3: Reset the streak on a natural break completion**

Current (`renderer/rooms.js`):
```js
function onRoomSessionComplete() {
  roomState.celebratedFor = roomState.timerRow.started_at
  roomCelebrate(state.sessionType)
  roomAttemptAdvance()
}
```

Replace with:
```js
function onRoomSessionComplete() {
  roomState.celebratedFor = roomState.timerRow.started_at
  if (state.sessionType === 'short-break' || state.sessionType === 'long-break') {
    roomState.skipStreak = 0
    trackPresence()
  }
  roomCelebrate(state.sessionType)
  roomAttemptAdvance()
}
```

This fires on every client independently — `onRoomSessionComplete()` already runs whenever *this client's own* local countdown reaches zero (not just a single "race winner"; this was established by the break-enforcement branch this plan is built on), so this correctly resets each person's own streak only when their own break genuinely ran its course, not when someone else's did.

- [ ] **Step 4: Increment the streak on Skip Break**

Current (`renderer/app.js`):
```js
elBtnSkipBreak.addEventListener('click', function () {
  if (state.timerState === 'complete') return
  if (typeof roomIsActive === 'function' && roomIsActive()) {
    roomAttemptAdvance()
    return
  }
  advanceSession()
})
```

Replace with:
```js
elBtnSkipBreak.addEventListener('click', function () {
  if (state.timerState === 'complete') return
  if (typeof roomIsActive === 'function' && roomIsActive()) {
    roomState.skipStreak += 1
    trackPresence()
    roomAttemptAdvance()
    return
  }
  advanceSession()
})
```

`roomState` and `trackPresence` are called directly without a `typeof` guard here, matching the existing convention in this file (see `roomHandleStart()` being called directly on the line above, once `roomIsActive()` has already confirmed rooms.js is loaded and active) — the guard is only needed for the initial `roomIsActive` check.

- [ ] **Step 5: Reset the streak on leaving a room**

Current (`renderer/rooms.js`, the `elBtnRoomLeave` handler):
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
  roomState.celebratedFor = null
  elRoomParticipants.innerHTML = ''
  elRoomPanel.classList.remove('in-room')

  state.sessionType = 'work'
  state.secondsLeft = config.work * 60
  state.completedWork = 0
  state.timerState = 'idle'
  render()
})
```

Add `roomState.skipStreak = 0` right after `roomState.celebratedFor = null`:
```js
  roomState.celebratedFor = null
  roomState.skipStreak = 0
```

- [ ] **Step 6: Render the overworking badge**

Current (`renderer/rooms.js`):
```js
function renderParticipants() {
  if (!roomState.channel) return
  var presenceState = roomState.channel.presenceState()
  elRoomParticipants.innerHTML = ''
  Object.keys(presenceState).forEach(function (key) {
    var presences = presenceState[key]
    var presence = presences[presences.length - 1]
    var row = document.createElement('div')
    row.className = 'room-participant-row'
    var nameSpan = document.createElement('span')
    nameSpan.textContent = presence.nickname
    var statusSpan = document.createElement('span')
    statusSpan.textContent = STATUS_LABELS[presence.status] || presence.status
    row.appendChild(nameSpan)
    row.appendChild(statusSpan)
    elRoomParticipants.appendChild(row)
  })
}
```

Replace with:
```js
function renderParticipants() {
  if (!roomState.channel) return
  var presenceState = roomState.channel.presenceState()
  elRoomParticipants.innerHTML = ''
  Object.keys(presenceState).forEach(function (key) {
    var presences = presenceState[key]
    var presence = presences[presences.length - 1]
    var row = document.createElement('div')
    row.className = 'room-participant-row'
    var nameSpan = document.createElement('span')
    nameSpan.textContent = presence.nickname
    var statusSpan = document.createElement('span')
    statusSpan.textContent = STATUS_LABELS[presence.status] || presence.status
    row.appendChild(nameSpan)
    row.appendChild(statusSpan)
    if (shouldFlagOverworking(presence.skipStreak || 0)) {
      var badgeSpan = document.createElement('span')
      badgeSpan.className = 'room-overworking-badge'
      badgeSpan.textContent = 'Skipped ' + presence.skipStreak + ' breaks'
      row.appendChild(badgeSpan)
    }
    elRoomParticipants.appendChild(row)
  })
}
```

`presence.skipStreak || 0` guards against a stale/older presence entry from before this feature existed (or any malformed payload) not having the field at all.

- [ ] **Step 7: Style the badge**

Add to `renderer/style.css`, after the `.room-participant-row` rule block (and its `body.dark` override):
```css
.room-overworking-badge {
  font-size: 11px;
  color: var(--red);
  border: 1px solid var(--red);
  border-radius: 4px;
  padding: 2px 6px;
}
```

- [ ] **Step 8: Manual verification**

With two participants in a room, have one repeatedly click Skip Break during consecutive breaks (not letting any complete naturally). Confirm: after the 2nd skip, that participant's row in BOTH clients shows the "Skipped 2 breaks" badge (their own view included). Confirm the badge count increments on a 3rd skip. Then let one break complete naturally (don't click Skip Break) — confirm the badge disappears for that participant on both clients. Confirm the OTHER participant's badge is unaffected by the first participant's skips (per-person, not room-wide).

- [ ] **Step 9: Run the full test suite**

Run: `npm test` (or with the flags from Task 1 Step 2 if it hangs)

Expected: no change in count from Task 1's end state — this task adds no new automated tests (DOM/Realtime wiring, manually verified).

- [ ] **Step 10: Commit**

```bash
git add renderer/rooms.js renderer/app.js renderer/style.css
git commit -m "feat: track and display per-participant break-skip streak in rooms"
```

---

### Task 3: Nudge — presence key, broadcast, and toast

**Files:**
- Modify: `renderer/rooms.js`
- Modify: `renderer/app.js`
- Modify: `renderer/index.html`
- Modify: `renderer/style.css`

**Interfaces:**
- Consumes: `canNudge(lastNudgeAt, now, cooldownMs)` from Task 1. Modifies `renderParticipants()` again, on top of Task 2's version (adding the nudge button after Task 2's badge-rendering block, inside the same `forEach`).
- Produces: nothing consumed elsewhere — this is the final task.

- [ ] **Step 1: Store this client's own presence key, add the nudge cooldown constant and state**

Current (`renderer/rooms.js`, the `roomState` declaration — as left by Task 2):
```js
var roomState = {
  roomId: null,
  joinCode: null,
  channel: null,
  nickname: '',
  isAway: false,
  lastStatus: null,
  timerRow: null,
  tickInterval: null,
  celebratedFor: null,
  skipStreak: 0
}
```

Replace with:
```js
var NUDGE_COOLDOWN_MS = 30000

var roomState = {
  roomId: null,
  joinCode: null,
  channel: null,
  nickname: '',
  isAway: false,
  lastStatus: null,
  timerRow: null,
  tickInterval: null,
  celebratedFor: null,
  skipStreak: 0,
  myPresenceKey: null,
  lastNudgeAt: {}
}
```

- [ ] **Step 2: Store the presence key and add the broadcast listener in `subscribeToRoom()`**

Current (`renderer/rooms.js`):
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
      clearRoomError()
    } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      showRoomError('Room connection lost — leave and rejoin.')
    }
  })

  return channel
}
```

Replace with:
```js
function subscribeToRoom(roomId) {
  var presenceKey = roomId + ':' + Math.random().toString(36).slice(2)
  roomState.myPresenceKey = presenceKey
  var channel = supabaseClient.channel('room:' + roomId, {
    config: { presence: { key: presenceKey } }
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

  channel.on('broadcast', { event: 'nudge' }, function (message) {
    if (message.payload.targetKey === roomState.myPresenceKey) {
      showNudgeToast(message.payload.from)
    }
  })

  channel.subscribe(function (status) {
    if (status === 'SUBSCRIBED') {
      roomState.channel = channel
      trackPresence()
      renderParticipants()
      clearRoomError()
    } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      showRoomError('Room connection lost — leave and rejoin.')
    }
  })

  return channel
}
```

The `channel.on('broadcast', { event: 'nudge' }, callback)` signature and the `{ type, event, payload }` shape of `message` are confirmed against `node_modules/@supabase/realtime-js/dist/module/RealtimeChannel.d.ts` (the `payload` property carries exactly what was passed to `channel.send({..., payload: {...}})` on the sending end).

- [ ] **Step 3: Add `sendNudge` and `showNudgeToast`**

Add to `renderer/rooms.js`, after `onRoomSessionComplete()` and before the `// ── Create / Join / Leave ───` comment:

```js
// ── Nudge ────────────────────────────────────────

function sendNudge(targetKey) {
  var now = Date.now()
  if (!canNudge(roomState.lastNudgeAt[targetKey], now, NUDGE_COOLDOWN_MS)) return
  roomState.lastNudgeAt[targetKey] = now
  roomState.channel.send({
    type: 'broadcast',
    event: 'nudge',
    payload: { targetKey: targetKey, from: roomState.nickname }
  })
}

var nudgeToastTimeout = null

function showNudgeToast(fromNickname) {
  elNudgeToast.textContent = fromNickname + ' nudged you — take a break?'
  elNudgeToast.classList.add('visible')
  clearTimeout(nudgeToastTimeout)
  nudgeToastTimeout = setTimeout(function () {
    elNudgeToast.classList.remove('visible')
  }, 4000)
  playNudgeTone()
}
```

`roomState.channel.send(...)` is intentionally fire-and-forget with no `.then()` — see the Global Constraints note on why the `.then(result => result.error)` pattern used for Postgrest calls elsewhere in this file does not apply here.

- [ ] **Step 4: Add the `elNudgeToast` DOM ref**

Current (`renderer/rooms.js`, the DOM refs block):
```js
var elInputNickname    = document.getElementById('input-nickname')
var elBtnRoomCreate    = document.getElementById('btn-room-create')
var elInputJoinCode    = document.getElementById('input-join-code')
var elBtnRoomJoin      = document.getElementById('btn-room-join')
var elRoomError        = document.getElementById('room-error')
var elRoomCodeValue    = document.getElementById('room-code-value')
var elRoomParticipants = document.getElementById('room-participants')
var elBtnRoomLeave     = document.getElementById('btn-room-leave')
```

Replace with:
```js
var elInputNickname    = document.getElementById('input-nickname')
var elBtnRoomCreate    = document.getElementById('btn-room-create')
var elInputJoinCode    = document.getElementById('input-join-code')
var elBtnRoomJoin      = document.getElementById('btn-room-join')
var elRoomError        = document.getElementById('room-error')
var elRoomCodeValue    = document.getElementById('room-code-value')
var elRoomParticipants = document.getElementById('room-participants')
var elBtnRoomLeave     = document.getElementById('btn-room-leave')
var elNudgeToast       = document.getElementById('nudge-toast')
```

- [ ] **Step 5: Add the nudge button to `renderParticipants()`**

Current (`renderer/rooms.js`, as left by Task 2):
```js
function renderParticipants() {
  if (!roomState.channel) return
  var presenceState = roomState.channel.presenceState()
  elRoomParticipants.innerHTML = ''
  Object.keys(presenceState).forEach(function (key) {
    var presences = presenceState[key]
    var presence = presences[presences.length - 1]
    var row = document.createElement('div')
    row.className = 'room-participant-row'
    var nameSpan = document.createElement('span')
    nameSpan.textContent = presence.nickname
    var statusSpan = document.createElement('span')
    statusSpan.textContent = STATUS_LABELS[presence.status] || presence.status
    row.appendChild(nameSpan)
    row.appendChild(statusSpan)
    if (shouldFlagOverworking(presence.skipStreak || 0)) {
      var badgeSpan = document.createElement('span')
      badgeSpan.className = 'room-overworking-badge'
      badgeSpan.textContent = 'Skipped ' + presence.skipStreak + ' breaks'
      row.appendChild(badgeSpan)
    }
    elRoomParticipants.appendChild(row)
  })
}
```

Replace with:
```js
function renderParticipants() {
  if (!roomState.channel) return
  var presenceState = roomState.channel.presenceState()
  elRoomParticipants.innerHTML = ''
  Object.keys(presenceState).forEach(function (key) {
    var presences = presenceState[key]
    var presence = presences[presences.length - 1]
    var row = document.createElement('div')
    row.className = 'room-participant-row'
    var nameSpan = document.createElement('span')
    nameSpan.textContent = presence.nickname
    var statusSpan = document.createElement('span')
    statusSpan.textContent = STATUS_LABELS[presence.status] || presence.status
    row.appendChild(nameSpan)
    row.appendChild(statusSpan)
    var overworking = shouldFlagOverworking(presence.skipStreak || 0)
    if (overworking) {
      var badgeSpan = document.createElement('span')
      badgeSpan.className = 'room-overworking-badge'
      badgeSpan.textContent = 'Skipped ' + presence.skipStreak + ' breaks'
      row.appendChild(badgeSpan)
    }
    if (key !== roomState.myPresenceKey) {
      var nudgeBtn = document.createElement('button')
      nudgeBtn.className = overworking ? 'btn-nudge btn-nudge-emphasized' : 'btn-nudge'
      nudgeBtn.textContent = 'Nudge'
      nudgeBtn.addEventListener('click', function () {
        sendNudge(key)
      })
      row.appendChild(nudgeBtn)
    }
    elRoomParticipants.appendChild(row)
  })
}
```

`key` is the `forEach` callback's own parameter, freshly bound on each call — the `nudgeBtn` click handler closing over it is safe (this is not the classic `var` in a `for`-loop closure bug, since `Array.prototype.forEach` invokes a new function call per element with its own parameter binding).

- [ ] **Step 6: Add `playNudgeTone` to `renderer/app.js`**

Add after `playChime()` in `renderer/app.js`:

```js
function playNudgeTone() {
  try {
    var ctx = getAudioCtx()
    var osc = ctx.createOscillator()
    var gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 520
    osc.type = 'sine'
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch (e) {
    // AudioContext unavailable — silently skip
  }
}
```

A single short tone, deliberately distinct from `playChime()`'s two-note pattern so a nudge doesn't get confused with a phase-complete chime.

- [ ] **Step 7: Reset nudge-related state on leaving a room**

Current (`renderer/rooms.js`, the `elBtnRoomLeave` handler, as left by Task 2):
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
  roomState.celebratedFor = null
  roomState.skipStreak = 0
  elRoomParticipants.innerHTML = ''
  elRoomPanel.classList.remove('in-room')

  state.sessionType = 'work'
  state.secondsLeft = config.work * 60
  state.completedWork = 0
  state.timerState = 'idle'
  render()
})
```

Add `roomState.myPresenceKey = null` and `roomState.lastNudgeAt = {}` right after `roomState.skipStreak = 0`:
```js
  roomState.skipStreak = 0
  roomState.myPresenceKey = null
  roomState.lastNudgeAt = {}
```

- [ ] **Step 8: Add the toast markup**

Current (`renderer/index.html`):
```html
  <div class="overlay-celebration" id="overlay-celebration">
    <img class="cat-celebration" id="cat-celebration" alt="celebration cat" src="">
  </div>
```

Replace with:
```html
  <div class="overlay-celebration" id="overlay-celebration">
    <img class="cat-celebration" id="cat-celebration" alt="celebration cat" src="">
  </div>

  <div class="nudge-toast" id="nudge-toast"></div>
```

- [ ] **Step 9: Style the toast and nudge buttons**

Add to `renderer/style.css`, after the `.room-overworking-badge` rule added in Task 2:
```css
.btn-nudge {
  font-size: 12px;
  padding: 4px 10px;
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 4px;
  cursor: pointer;
}

.btn-nudge-emphasized {
  background: var(--accent);
  color: #ffffff;
}

.nudge-toast {
  position: fixed;
  bottom: 70px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: #ffffff;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 200;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

.nudge-toast.visible {
  opacity: 1;
}
```

- [ ] **Step 10: Manual verification**

With two participants in a room: confirm each sees a "Nudge" button on the OTHER's row, but not on their own. Click it — confirm the target sees a toast ("<name> nudged you — take a break?") within a couple seconds, along with the distinct tone, and that it auto-dismisses after ~4 seconds. Click Nudge again immediately — confirm nothing happens (cooldown). Wait 30+ seconds and nudge again — confirm it works. Have one participant skip 2 breaks — confirm their nudge button (as seen by the other participant) becomes visually emphasized while the badge is showing, and reverts to normal once they take a real break.

- [ ] **Step 11: Run the full test suite**

Run: `npm test` (or with the flags from Task 1 Step 2 if it hangs)

Expected: no change in count from Task 2's end state — this task adds no new automated tests (DOM/Realtime/broadcast wiring, manually verified).

- [ ] **Step 12: Commit**

```bash
git add renderer/rooms.js renderer/app.js renderer/index.html renderer/style.css
git commit -m "feat: add per-participant nudge with cooldown and toast"
```
