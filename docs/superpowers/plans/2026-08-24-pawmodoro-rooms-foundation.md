# Pawmodoro Rooms Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add room creation, code-based joining, and a live presence list (nickname + focusing/break/idle/away status) to Pawmodoro, using Supabase anonymous auth and Realtime Presence — no timer syncing or paywall yet.

**Architecture:** A `rooms` table for code lookup, with the participant list handled entirely by Supabase Realtime Presence (no participants table). The vendored Supabase JS bundle and all new renderer files stay top-level in `renderer/` so both Electron's direct load and the existing iOS sync script pick them up unmodified. Status (`focusing`/`break`/`idle`/`away`) is derived locally from the existing timer `state` plus `document.visibilitychange` (used instead of the spec's originally-suggested Capacitor `App` plugin, to avoid the same "plugin JS never loaded without a bundler" bug already fixed once in this project — see Global Constraints).

**Tech Stack:** `@supabase/supabase-js` v2 (vendored UMD bundle, no bundler), existing vanilla JS/Jest toolchain.

**Spec:** `docs/superpowers/specs/2026-08-24-pawmodoro-rooms-foundation-design.md`

## Global Constraints

- No Supabase project exists yet — tasks that need live credentials (real room create/join/presence round-trips) are deferred to manual verification once you provide a project URL + anon key. Tasks that only need file scaffolding proceed now.
- No bundler — every new script must work loaded via a plain `<script>` tag.
- `scripts/sync-ios-www.js` only copies files directly inside `renderer/`, not subdirectories — every new renderer file must be top-level in `renderer/`.
- Participant identity is Supabase anonymous auth (`signInAnonymously()`), not a local-only nickname scheme.
- Joining a room is by typed 6-character code only — no deep links.
- Away-detection uses `document.addEventListener('visibilitychange', ...)`, not any Capacitor plugin — deviation from the spec's literal wording, made during planning because the plugin approach would repeat a bug already found and fixed in the iOS sub-project (`window.Capacitor.Plugins.X` is never populated without a bundler).
- `npm test` currently passes 59/59 (54 original + 5 for `sync-ios-www`) — must keep passing, growing only where a task adds tests.

---

### Task 1: Room status/code pure logic

**Files:**
- Create: `renderer/rooms-logic.js`
- Test: `tests/rooms-logic.test.js`

**Interfaces:**
- Produces: `generateJoinCode()` → 6-character string; `deriveStatus(timerState, sessionType, isAway)` → `'focusing' | 'break' | 'idle' | 'away'`; `JOIN_CODE_ALPHABET` (string), `JOIN_CODE_LENGTH` (number, `6`). All exported via `module.exports` when `typeof module !== 'undefined'`, matching `renderer/timer-logic.js`'s existing dual Node/browser export pattern exactly. Later tasks (Task 4) call `generateJoinCode()` and `deriveStatus(...)` by these exact names.

- [ ] **Step 1: Write the failing test**

Create `tests/rooms-logic.test.js`:

```js
const {
  generateJoinCode,
  deriveStatus,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH
} = require('../renderer/rooms-logic')

describe('generateJoinCode', () => {
  test('generates a code of the expected length', () => {
    var code = generateJoinCode()
    expect(code.length).toBe(JOIN_CODE_LENGTH)
  })

  test('only uses characters from the safe alphabet', () => {
    var code = generateJoinCode()
    for (var i = 0; i < code.length; i++) {
      expect(JOIN_CODE_ALPHABET.indexOf(code.charAt(i))).toBeGreaterThanOrEqual(0)
    }
  })

  test('excludes ambiguous characters', () => {
    var code = generateJoinCode()
    expect(code).not.toMatch(/[0O1IL]/)
  })

  test('generates different codes across many calls', () => {
    var codes = {}
    for (var i = 0; i < 50; i++) codes[generateJoinCode()] = true
    expect(Object.keys(codes).length).toBeGreaterThan(1)
  })
})

describe('deriveStatus', () => {
  test('returns "away" when away, regardless of timer state', () => {
    expect(deriveStatus('running', 'work', true)).toBe('away')
    expect(deriveStatus('idle', 'work', true)).toBe('away')
  })

  test('returns "focusing" when running a work session', () => {
    expect(deriveStatus('running', 'work', false)).toBe('focusing')
  })

  test('returns "break" when running a short or long break', () => {
    expect(deriveStatus('running', 'short-break', false)).toBe('break')
    expect(deriveStatus('running', 'long-break', false)).toBe('break')
  })

  test('returns "idle" when paused', () => {
    expect(deriveStatus('paused', 'work', false)).toBe('idle')
  })

  test('returns "idle" when stopped or complete', () => {
    expect(deriveStatus('idle', 'work', false)).toBe('idle')
    expect(deriveStatus('complete', 'work', false)).toBe('idle')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/rooms-logic.test.js`
Expected: FAIL — `Cannot find module '../renderer/rooms-logic'`

- [ ] **Step 3: Write the implementation**

Create `renderer/rooms-logic.js`:

```js
var JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
var JOIN_CODE_LENGTH = 6

function generateJoinCode() {
  var code = ''
  for (var i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET.charAt(Math.floor(Math.random() * JOIN_CODE_ALPHABET.length))
  }
  return code
}

function deriveStatus(timerState, sessionType, isAway) {
  if (isAway) return 'away'
  if (timerState === 'running' && sessionType === 'work') return 'focusing'
  if (timerState === 'running' && (sessionType === 'short-break' || sessionType === 'long-break')) return 'break'
  return 'idle'
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateJoinCode,
    deriveStatus,
    JOIN_CODE_ALPHABET,
    JOIN_CODE_LENGTH
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/rooms-logic.test.js`
Expected: PASS, 9/9 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 68/68 (59 existing + 9 new).

- [ ] **Step 6: Commit**

```bash
git add renderer/rooms-logic.js tests/rooms-logic.test.js
git commit -m "feat: add room code and status-derivation logic"
```

---

### Task 2: Supabase scaffolding

**Files:**
- Create: `renderer/supabase.js` (vendored)
- Create: `renderer/supabase-config.js`
- Create: `supabase/schema.sql`
- Modify: `package.json`
- Modify: `renderer/index.html:75-79`

**Interfaces:**
- Produces: `window.supabase.createClient(url, key)` (from the vendored bundle — standard Supabase JS v2 global export), `window.SUPABASE_URL`, `window.SUPABASE_ANON_KEY` (from the config file). Task 4 constructs the Supabase client using these three globals, in that reading order.

- [ ] **Step 1: Install the dependency**

Run:
```bash
npm install --save-dev @supabase/supabase-js
```
Expected: install succeeds, `package.json` gains `@supabase/supabase-js` under `devDependencies` (not `dependencies` — it's a browser-global bundle we vendor, never `require`d by Electron/Node code, matching the same reasoning already applied to the Capacitor packages).

- [ ] **Step 2: Vendor the browser bundle**

Run:
```bash
cp node_modules/@supabase/supabase-js/dist/umd/supabase.js renderer/supabase.js
```
Expected: `renderer/supabase.js` exists (~212KB).

- [ ] **Step 3: Create the config placeholder**

Create `renderer/supabase-config.js`:

```js
window.SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'
window.SUPABASE_ANON_KEY = 'YOUR-ANON-KEY'
```

- [ ] **Step 4: Create the schema file**

Create `supabase/schema.sql`:

```sql
-- Run this in the Supabase SQL editor once the project exists.
-- Also enable Authentication → Providers → Anonymous Sign-Ins.

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

This file is not run automatically — it's meant to be pasted into the Supabase dashboard's SQL editor once a project exists.

- [ ] **Step 5: Wire the script tags**

In `renderer/index.html`, change lines 75-79 from:

```html
  <script src="timer-logic.js"></script>
  <script src="todo-logic.js"></script>
  <script src="platform.js"></script>
  <script src="app.js"></script>
  <script src="todo.js"></script>
```

to:

```html
  <script src="timer-logic.js"></script>
  <script src="todo-logic.js"></script>
  <script src="rooms-logic.js"></script>
  <script src="supabase-config.js"></script>
  <script src="supabase.js"></script>
  <script src="platform.js"></script>
  <script src="app.js"></script>
  <script src="todo.js"></script>
```

- [ ] **Step 6: Verify the test suite is unaffected**

Run: `npm test`
Expected: PASS, 68/68, unchanged (this task adds no test-covered logic).

- [ ] **Step 7: Verify the new files sync into the iOS build folder**

Run: `npm run sync:ios`
Expected: script runs (may still fail at the `npx cap sync ios` step the same way it already did before this plan, since that part is unrelated to this task). Then run:
```bash
ls www/
```
Expected: `supabase.js`, `supabase-config.js`, and `rooms-logic.js` all present alongside the existing files.

- [ ] **Step 8: Commit**

```bash
git add renderer/supabase.js renderer/supabase-config.js renderer/index.html supabase/schema.sql package.json package-lock.json
git commit -m "feat: add Supabase client scaffolding and rooms schema"
```

---

### Task 3: Room panel UI shell (open/close only)

**Files:**
- Create: `renderer/rooms.js`
- Modify: `renderer/index.html`
- Modify: `renderer/app.js`
- Modify: `renderer/style.css`

**Interfaces:**
- Consumes: none from earlier tasks (this task's wiring is UI-only; the Supabase/logic wiring lands in Task 4, which modifies this same `renderer/rooms.js` file).
- Produces: DOM elements with ids `room-panel`, `btn-room`, `btn-room-close`, `room-join-view`, `room-active-view`, `input-nickname`, `btn-room-create`, `input-join-code`, `btn-room-join`, `room-error`, `room-code-value`, `room-participants`, `btn-room-leave` — Task 4 attaches its behavior to these exact ids.

- [ ] **Step 1: Add the room button and panel markup**

In `renderer/index.html`, find this line:

```html
  <button class="btn-settings" id="btn-settings" aria-label="Open settings">&#9881;</button>
```

Add a new button immediately after it:

```html
  <button class="btn-settings" id="btn-settings" aria-label="Open settings">&#9881;</button>
  <button class="btn-room" id="btn-room" aria-label="Open room">&#128101;</button>
```

Then find the closing `</div>` of the `settings-panel` block (the settings panel ends right before the closing `</body>` tag area — locate the `<div class="settings-panel" id="settings-panel">...</div>` block and insert the new room panel markup immediately after its closing `</div>`):

```html
  <div class="room-panel" id="room-panel">
    <div class="room-header">
      <span class="room-title">Room</span>
      <button class="btn-room-close" id="btn-room-close" aria-label="Close room panel">&#215;</button>
    </div>
    <div class="room-body">
      <div class="room-join-view" id="room-join-view">
        <label>Nickname<input type="text" id="input-nickname" maxlength="24" placeholder="Your name"></label>
        <button class="btn-room-create" id="btn-room-create">Create Room</button>
        <div class="room-join-row">
          <input type="text" id="input-join-code" maxlength="6" placeholder="Enter code">
          <button class="btn-room-join" id="btn-room-join">Join</button>
        </div>
        <div class="room-error" id="room-error"></div>
      </div>
      <div class="room-active-view" id="room-active-view">
        <div class="room-code-display">
          <span class="room-code-label">Room Code</span>
          <span class="room-code-value" id="room-code-value"></span>
        </div>
        <div class="room-participants" id="room-participants"></div>
        <button class="btn-room-leave" id="btn-room-leave">Leave Room</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Add the `rooms.js` script tag**

In `renderer/index.html`, change the script list (already modified by Task 2) from:

```html
  <script src="app.js"></script>
  <script src="todo.js"></script>
```

to:

```html
  <script src="app.js"></script>
  <script src="todo.js"></script>
  <script src="rooms.js"></script>
```

- [ ] **Step 3: Add the room panel CSS**

Append this block to the end of `renderer/style.css` (after the current last rule):

```css

/* ── Room panel ───────────────────────────────── */

.room-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--white);
  border-top: 2px solid var(--black);
  padding: 18px 24px 20px;
  z-index: 50;
  transform: translateY(100%);
  transition: transform 0.25s ease;
}

.room-panel.visible {
  transform: translateY(0);
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.room-title {
  font-size: 18px;
  font-weight: 700;
}

.btn-room-close {
  background: transparent;
  border: none;
  color: var(--black);
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
  font-family: 'MorningBreeze', sans-serif;
}

.room-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 60vh;
  overflow-y: auto;
}

.room-body label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  font-weight: 300;
}

.room-body input[type='text'] {
  padding: 4px 8px;
  border: 2px solid var(--black);
  font-family: 'MorningBreeze', sans-serif;
  font-size: 15px;
  background: var(--white);
  border-radius: 2px;
}

.btn-room-create,
.btn-room-leave {
  width: 100%;
  padding: 10px;
  background: var(--black);
  color: var(--white);
  border: none;
  font-family: 'MorningBreeze', sans-serif;
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  transition: opacity 0.15s;
}

.btn-room-create:hover,
.btn-room-leave:hover {
  opacity: 0.8;
}

.room-join-row {
  display: flex;
  gap: 8px;
}

.room-join-row input {
  flex: 1;
}

.btn-room-join {
  padding: 4px 16px;
  background: var(--black);
  color: var(--white);
  border: none;
  font-family: 'MorningBreeze', sans-serif;
  font-size: 15px;
  cursor: pointer;
  border-radius: 4px;
}

.room-error {
  color: var(--red);
  font-size: 12px;
  min-height: 16px;
}

.room-active-view { display: none; }
.room-panel.in-room .room-join-view { display: none; }
.room-panel.in-room .room-active-view { display: flex; flex-direction: column; gap: 10px; }

.room-code-display {
  text-align: center;
}

.room-code-label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.room-code-value {
  display: block;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.15em;
}

.room-participants {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room-participant-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  font-size: 15px;
}

body.dark .room-participant-row { border-bottom-color: rgba(255, 255, 255, 0.08); }
```

- [ ] **Step 4: Add the focus-visible outline for the new buttons**

In `renderer/style.css`, find this rule:

```css
.btn-start:focus-visible,
.btn-reset:focus-visible,
.btn-save:focus-visible,
.btn-minimize:focus-visible,
.btn-close:focus-visible,
.btn-settings:focus-visible,
.btn-settings-close:focus-visible {
  outline: 2px solid var(--black);
  outline-offset: 2px;
}
```

Change it to:

```css
.btn-start:focus-visible,
.btn-reset:focus-visible,
.btn-save:focus-visible,
.btn-minimize:focus-visible,
.btn-close:focus-visible,
.btn-settings:focus-visible,
.btn-settings-close:focus-visible,
.btn-room:focus-visible,
.btn-room-close:focus-visible,
.btn-room-create:focus-visible,
.btn-room-join:focus-visible,
.btn-room-leave:focus-visible {
  outline: 2px solid var(--black);
  outline-offset: 2px;
}
```

- [ ] **Step 5: Create `renderer/rooms.js` with open/close wiring**

```js
// ── Room panel toggle ──────────────────────────

var elBtnRoom      = document.getElementById('btn-room')
var elBtnRoomClose = document.getElementById('btn-room-close')
var elRoomPanel    = document.getElementById('room-panel')

elBtnRoom.addEventListener('click', function () {
  document.getElementById('settings-panel').classList.remove('visible')
  elRoomPanel.classList.add('visible')
})

elBtnRoomClose.addEventListener('click', function () {
  elRoomPanel.classList.remove('visible')
})
```

- [ ] **Step 6: Make settings and room panels mutually exclusive**

In `renderer/app.js`, find the settings-open handler:

```js
elBtnSettings.addEventListener('click', function () {
  elInputWork.value = config.work
  elInputShort.value = config.shortBreak
  elInputLong.value = config.longBreak
  elInputSessions.value = config.sessionsBeforeLongBreak
  elThemeSelect.value = localStorage.getItem('theme-override') || 'auto'
  elSettingsPanel.classList.add('visible')
})
```

Change it to:

```js
elBtnSettings.addEventListener('click', function () {
  elInputWork.value = config.work
  elInputShort.value = config.shortBreak
  elInputLong.value = config.longBreak
  elInputSessions.value = config.sessionsBeforeLongBreak
  elThemeSelect.value = localStorage.getItem('theme-override') || 'auto'
  document.getElementById('room-panel').classList.remove('visible')
  elSettingsPanel.classList.add('visible')
})
```

- [ ] **Step 7: Run the test suite**

Run: `npm test`
Expected: PASS, 68/68, unchanged (this task is UI wiring only, no logic covered by tests).

- [ ] **Step 8: Manual Electron smoke check**

Run: `npm start`. Confirm:
- Clicking the new room icon slides the room panel up from the bottom, showing the "not in a room" view (nickname field, Create Room button, join-code row).
- Clicking its close button slides it back down.
- Opening Settings while the room panel is open closes the room panel, and vice versa.
- No console errors.

Quit the app afterward.

- [ ] **Step 9: Commit**

```bash
git add renderer/index.html renderer/app.js renderer/style.css renderer/rooms.js
git commit -m "feat: add room panel UI shell with open/close wiring"
```

---

### Task 4: Room create/join/leave and live presence

**Files:**
- Modify: `renderer/rooms.js`
- Modify: `renderer/app.js:119-160`

**Interfaces:**
- Consumes: `generateJoinCode()`, `deriveStatus(timerState, sessionType, isAway)` (Task 1); `window.supabase.createClient`, `window.SUPABASE_URL`, `window.SUPABASE_ANON_KEY` (Task 2); the DOM ids from Task 3; the global `state` object from `app.js` (`state.timerState`, `state.sessionType`).
- Produces: `updateRoomStatus()` (global function) — called from `app.js`'s `render()` after every state change, matching the existing `renderTodoPanel()` cross-file hook pattern already in `onSessionComplete()`.

- [ ] **Step 1: Add the status re-track hook to `render()`**

In `renderer/app.js`, find the end of the `render()` function:

```js
  // Active task label
  var activeTask = state.activeTaskId ? findTask(loadTasks(), state.activeTaskId) : null
  if (elActiveTaskLabel) {
    elActiveTaskLabel.textContent = activeTask ? '→ ' + activeTask.name : ''
    elActiveTaskLabel.style.display = activeTask ? 'block' : 'none'
  }
}
```

Change it to:

```js
  // Active task label
  var activeTask = state.activeTaskId ? findTask(loadTasks(), state.activeTaskId) : null
  if (elActiveTaskLabel) {
    elActiveTaskLabel.textContent = activeTask ? '→ ' + activeTask.name : ''
    elActiveTaskLabel.style.display = activeTask ? 'block' : 'none'
  }

  if (typeof updateRoomStatus === 'function') updateRoomStatus()
}
```

- [ ] **Step 2: Append the Supabase client, room state, and auth bootstrap to `renderer/rooms.js`**

Add this after the existing "Room panel toggle" section:

```js
// ── Supabase client ─────────────────────────────

var supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)

// ── Room state ──────────────────────────────────

var roomState = {
  roomId: null,
  joinCode: null,
  channel: null,
  nickname: '',
  isAway: false
}

// ── DOM refs (room feature) ─────────────────────

var elInputNickname    = document.getElementById('input-nickname')
var elBtnRoomCreate    = document.getElementById('btn-room-create')
var elInputJoinCode    = document.getElementById('input-join-code')
var elBtnRoomJoin      = document.getElementById('btn-room-join')
var elRoomError        = document.getElementById('room-error')
var elRoomCodeValue    = document.getElementById('room-code-value')
var elRoomParticipants = document.getElementById('room-participants')
var elBtnRoomLeave     = document.getElementById('btn-room-leave')

// ── Nickname persistence ────────────────────────

elInputNickname.value = localStorage.getItem('room-nickname') || ''

function getNickname() {
  var name = elInputNickname.value.trim()
  return name || 'Anonymous'
}

// ── Auth bootstrap ──────────────────────────────

function ensureAnonSession() {
  return supabaseClient.auth.getSession().then(function (result) {
    if (result.data.session) return result.data.session
    return supabaseClient.auth.signInAnonymously().then(function (signInResult) {
      return signInResult.data.session
    })
  })
}

// ── Errors ───────────────────────────────────────

function showRoomError(message) {
  elRoomError.textContent = message
}

function clearRoomError() {
  elRoomError.textContent = ''
}
```

- [ ] **Step 3: Append status tracking and away-detection**

```js
// ── Status tracking ──────────────────────────────

function currentStatus() {
  return deriveStatus(state.timerState, state.sessionType, roomState.isAway)
}

function trackPresence() {
  if (!roomState.channel) return
  roomState.channel.track({ nickname: roomState.nickname, status: currentStatus() })
}

function updateRoomStatus() {
  if (!roomState.channel) return
  trackPresence()
}

document.addEventListener('visibilitychange', function () {
  roomState.isAway = document.hidden
  updateRoomStatus()
})
```

- [ ] **Step 4: Append presence rendering**

```js
// ── Presence rendering ──────────────────────────

var STATUS_LABELS = { focusing: 'Focusing', break: 'On Break', idle: 'Idle', away: 'Away' }

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

- [ ] **Step 5: Append create/join/leave**

```js
// ── Create / Join / Leave ───────────────────────

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

elBtnRoomCreate.addEventListener('click', function () {
  clearRoomError()
  ensureAnonSession().then(function () {
    var code = generateJoinCode()
    return supabaseClient.from('rooms').insert({ join_code: code }).select().single().then(function (result) {
      if (result.error) {
        showRoomError('Could not create room. Try again.')
        return
      }
      enterRoom(result.data.id, result.data.join_code)
    })
  }).catch(function () {
    showRoomError('Could not connect. Check your connection.')
  })
})

elBtnRoomJoin.addEventListener('click', function () {
  clearRoomError()
  var code = elInputJoinCode.value.trim().toUpperCase()
  if (!code) return
  ensureAnonSession().then(function () {
    return supabaseClient.from('rooms').select().eq('join_code', code).single().then(function (result) {
      if (result.error || !result.data) {
        showRoomError('Room not found.')
        return
      }
      enterRoom(result.data.id, result.data.join_code)
    })
  }).catch(function () {
    showRoomError('Could not connect. Check your connection.')
  })
})

elBtnRoomLeave.addEventListener('click', function () {
  if (roomState.channel) {
    supabaseClient.removeChannel(roomState.channel)
  }
  roomState.roomId = null
  roomState.joinCode = null
  roomState.channel = null
  elRoomParticipants.innerHTML = ''
  elRoomPanel.classList.remove('in-room')
})
```

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: PASS, 68/68, unchanged (this task adds DOM/network wiring, not logic covered by existing tests — matches the established pattern where `app.js`/`todo.js` are also untested directly).

- [ ] **Step 7: Manual smoke check with placeholder credentials (real Supabase verification is deferred)**

Run: `npm start`. With the placeholder `SUPABASE_URL`/`SUPABASE_ANON_KEY` still in place (no real project yet), confirm:
- The app launches with no uncaught JS errors in the console.
- Opening the room panel and clicking "Create Room" shows "Could not connect. Check your connection." in the error area (the graceful-failure path, since the placeholder URL isn't reachable) rather than crashing or hanging.
- Typing a code and clicking "Join" behaves the same way.

This confirms the error-handling path works correctly. Once you provide a real Supabase project URL + anon key (update `renderer/supabase-config.js` and run the `supabase/schema.sql` script plus enable Anonymous Sign-Ins in the dashboard, per Task 2), the full round-trip — two simultaneous `npm start` instances joining the same room and seeing each other's live status — should be manually verified as a follow-up, per the spec's deferred-testing note.

Quit the app afterward.

- [ ] **Step 8: Commit**

```bash
git add renderer/rooms.js renderer/app.js
git commit -m "feat: add room create/join/leave and live presence tracking"
```
