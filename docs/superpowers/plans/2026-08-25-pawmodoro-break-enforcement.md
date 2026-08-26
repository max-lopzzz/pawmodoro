# Pawmodoro Break Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-start the next timer phase (work↔break) instead of leaving it idle waiting for a manual click, in both solo and shared-room modes, and add a one-click "Skip Break" control — so hyperfocus can't silently skip a break by inaction, and a finished break can't silently run long by inaction either.

**Architecture:** Two symmetric auto-start changes (solo: `advanceSession()` in `renderer/app.js`; rooms: `roomAttemptAdvance()`'s update payload in `renderer/rooms.js`) replace "advance to idle" with "advance and immediately start." A new "Skip Break" button, visible only during break phases, reuses these same advance functions to jump straight into an auto-started work session on demand.

**Tech Stack:** Vanilla JS (no bundler, no framework), Electron + Capacitor shared renderer, Supabase Realtime for room sync (already in place, untouched).

**Spec:** none — this is a bounded change to existing timer flow, approved via in-chat design during brainstorming on 2026-08-25 (no separate spec doc was written; this plan document is the record of the design).

## Global Constraints

- No bundler — every script loads via a plain `<script>` tag; no ES modules, no `import`/`require` in renderer code.
- Match existing code style exactly: `var` declarations, named `function` statements (no arrow functions), the `typeof roomIsActive === 'function' && roomIsActive()` cross-file guard pattern already used for every mode-branching control (`elBtnStart`, `elBtnReset`).
- No changes needed to any pure-logic file (`timer-logic.js`, `rooms-logic.js`) or their tests — this is DOM/state-wiring only, consistent with how the rest of `app.js`/`rooms.js` is verified (manually, not unit tested).
- Preserve existing behavior of Reset (`elBtnReset`/`roomHandleReset`) exactly as-is — resetting always returns to idle at full duration for the current phase; auto-start only governs *automatic* phase advances, not manual resets.
- The full test suite (`npm test`) must stay at its current count (74/74) with zero regressions — this plan adds no new automated tests.

---

### Task 1: Solo auto-start on phase advance

**Files:**
- Modify: `renderer/app.js:233-239`

**Interfaces:**
- Consumes: `getNextSession(currentType, completedWork, config)` from `renderer/timer-logic.js` (unchanged), `getWorkDuration()` (unchanged, same file).
- Produces: `advanceSession()` now leaves `state.timerState === 'running'` with an active `state.interval`, instead of `'idle'` with no interval. Task 3 depends on this — it calls `advanceSession()` directly from the new Skip Break handler and relies on it auto-starting.

- [ ] **Step 1: Rewrite `advanceSession()`**

Current (`renderer/app.js:233-239`):
```js
function advanceSession() {
  var next = getNextSession(state.sessionType, state.completedWork, config)
  state.sessionType = next.type
  state.secondsLeft = next.type === 'work' ? getWorkDuration() : next.duration
  state.timerState = 'idle'
  render()
}
```

Replace with:
```js
function advanceSession() {
  clearInterval(state.interval)
  state.interval = null
  var next = getNextSession(state.sessionType, state.completedWork, config)
  state.sessionType = next.type
  state.secondsLeft = next.type === 'work' ? getWorkDuration() : next.duration
  if (state.sessionType === 'work') {
    state.sessionWorkMinutes = Math.round(state.secondsLeft / 60)
  }
  state.timerState = 'running'
  state.interval = setInterval(tick, 1000)
  render()
}
```

The `clearInterval`/`state.interval = null` at the top is defensive: `advanceSession()` is currently only ever called right after `onSessionComplete()` has already cleared the interval, so this is a no-op today — but Task 3 will call `advanceSession()` directly from a running break (Skip Break), where an interval IS still active, and this prevents two intervals ticking at once (this codebase has hit that exact double-interval bug class before).

The `sessionWorkMinutes` capture (`Math.round(state.secondsLeft / 60)`) is copied from `elBtnStart`'s existing idle→running transition (`renderer/app.js:275-277`) — it must happen here too now that starting a work session can happen automatically, not just via manual click. Leave the existing capture in `elBtnStart` untouched; it still covers the cases where a work session starts from a genuinely idle state (first launch, after Settings Save).

- [ ] **Step 2: Manual verification**

Run the app (`npm start`), lower "Work (min)" to 1 in Settings to test quickly, start a work session, let it complete. Confirm: celebration/chime play as before, then the break countdown starts immediately (timer counting down, Start button reads "Pause") with no idle screen in between. Let the break complete too — confirm the next work session starts immediately the same way.

- [ ] **Step 3: Commit**

```bash
git add renderer/app.js
git commit -m "feat: auto-start next timer phase instead of leaving it idle"
```

---

### Task 2: Room auto-start on phase advance

**Files:**
- Modify: `renderer/rooms.js:205-227`

**Interfaces:**
- Consumes: `computeAdvancePayload(row, config, workDurationSeconds)` from `renderer/rooms-logic.js` (unchanged).
- Produces: `roomAttemptAdvance()` now writes `is_running: true, started_at: <now>` to the room's Supabase row on every advance (natural completion or, after Task 3, an explicit skip), instead of leaving it idle. Every participant's client picks this up via the existing `applyRoomTimerRow()` Realtime subscription, unchanged.

- [ ] **Step 1: Update `roomAttemptAdvance()`'s payload**

Current (`renderer/rooms.js:205-227`):
```js
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
    .then(function (result) {
      if (result.error) showRoomError('Could not update the timer. Try again.')
    })
}
```

Replace with:
```js
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
      started_at: new Date().toISOString(),
      is_running: true,
      completed_work: payload.completedWork
    })
    .eq('id', roomState.roomId)
    .eq('phase', row.phase)
    .eq('started_at', row.started_at)
    .then(function (result) {
      if (result.error) showRoomError('Could not update the timer. Try again.')
    })
}
```

Only the `started_at`/`is_running` values in the update payload change (from `null`/`false` to `new Date().toISOString()`/`true`). The `.eq('phase', row.phase).eq('started_at', row.started_at)` optimistic-concurrency guard is untouched — it still prevents two participants' clients from double-advancing the same completed phase in a race.

- [ ] **Step 2: Manual verification**

With two browser/app instances joined to the same room, let a work session complete in the room. Confirm: celebration/chime play on both clients, then the break countdown starts immediately on BOTH clients without either needing to click Start. Let the break complete too — confirm the next work session starts immediately for both.

- [ ] **Step 3: Commit**

```bash
git add renderer/rooms.js
git commit -m "feat: auto-start next timer phase for all room participants"
```

---

### Task 3: Skip Break button

**Files:**
- Modify: `renderer/index.html:30-33`
- Modify: `renderer/style.css` (add new rule block after `.btn-reset:hover`, `renderer/style.css:257-260`)
- Modify: `renderer/app.js` (DOM ref block `renderer/app.js:86-87`, `render()` `renderer/app.js:119-162`, new click handler placed right after the `elBtnReset` handler, wherever it now falls — Task 1 adds 6 lines above it, so search by the `// ── Settings ───` comment that follows it rather than by line number)

**Interfaces:**
- Consumes: `advanceSession()` (Task 1), `roomAttemptAdvance()` (Task 2), `roomIsActive()` (existing, `renderer/rooms.js:162-164`).
- Produces: nothing new consumed elsewhere — this is the final task.

- [ ] **Step 1: Add the button markup**

Current (`renderer/index.html:30-33`):
```html
        <div class="controls">
          <button class="btn-start" id="btn-start">Start</button>
          <button class="btn-reset" id="btn-reset">Reset</button>
        </div>
```

Replace with:
```html
        <div class="controls">
          <button class="btn-start" id="btn-start">Start</button>
          <button class="btn-reset" id="btn-reset">Reset</button>
          <button class="btn-skip-break" id="btn-skip-break">Skip Break</button>
        </div>
```

- [ ] **Step 2: Style the button**

Add after `.btn-reset:hover` (`renderer/style.css:257-260`):
```css
.btn-skip-break {
  padding: 10px 20px;
  background: transparent;
  color: var(--black);
  border: 2px solid var(--black);
  font-family: 'MorningBreeze', sans-serif;
  font-size: 18px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}

.btn-skip-break:hover {
  background: var(--black);
  color: var(--white);
}
```

This mirrors `.btn-reset`'s outlined style exactly, but in the neutral `--black`/`--white` pair instead of `--red` — skipping a break isn't a destructive action the way resetting progress is, so it shouldn't carry the same warning color.

- [ ] **Step 3: Add the DOM ref**

Current (`renderer/app.js:86-87`):
```js
var elBtnStart     = document.getElementById('btn-start')
var elBtnReset     = document.getElementById('btn-reset')
```

Replace with:
```js
var elBtnStart     = document.getElementById('btn-start')
var elBtnReset     = document.getElementById('btn-reset')
var elBtnSkipBreak = document.getElementById('btn-skip-break')
```

- [ ] **Step 4: Show/hide the button in `render()`**

In `render()` (`renderer/app.js:119-162`), add this block right after the "Start/Pause button label" line (`renderer/app.js:135`, `elBtnStart.textContent = state.timerState === 'running' ? 'Pause' : 'Start'`):

```js
  // Skip Break button — visible only during a break phase
  elBtnSkipBreak.style.display =
    (state.sessionType === 'short-break' || state.sessionType === 'long-break')
      ? 'inline-block' : 'none'
```

- [ ] **Step 5: Wire the click handler**

By this step, Task 1 has already added 6 lines inside `advanceSession()` (above this point in the file), so the `elBtnReset` handler's exact line numbers have shifted from what they were in the plan's Task 1 excerpt — find it by content: it's the block starting `elBtnReset.addEventListener('click', function () {`, immediately followed by the `// ── Settings ───` comment. Add the new handler right after `elBtnReset`'s closing `})`, right before that comment:

```js
elBtnSkipBreak.addEventListener('click', function () {
  if (typeof roomIsActive === 'function' && roomIsActive()) {
    roomAttemptAdvance()
    return
  }
  advanceSession()
})
```

- [ ] **Step 6: Manual verification**

Run the app. During a work session, confirm "Skip Break" is NOT visible. Let a work session complete — confirm "Skip Break" becomes visible as soon as the break auto-starts (per Task 1, there's no idle gap to wait through). Click it while the break is counting down — confirm the break ends immediately, the next work session starts immediately (auto-started, per Task 1), and "Skip Break" disappears again. Repeat inside a shared room with two participants — confirm clicking Skip Break on one client ends the break for BOTH clients and starts work for both.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: 74/74, same as before this plan — no new tests, no regressions.

- [ ] **Step 8: Commit**

```bash
git add renderer/index.html renderer/style.css renderer/app.js
git commit -m "feat: add Skip Break button for auto-started break phases"
```
