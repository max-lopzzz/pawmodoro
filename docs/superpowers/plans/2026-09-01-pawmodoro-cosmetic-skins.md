# Pawmodoro Cosmetic Skins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick Cat (free), Dog, or Rabbit (both included with the existing `pawmodoro_pro` entitlement) as their companion animal for the ambient/celebration GIFs, via a new "Companion" row in Settings.

**Architecture:** `renderer/timer-logic.js`'s GIF lookup tables become nested by skin; a new, simpler sibling to the existing room-access gate (`ensureSkinAccess`) reuses the same `pawmodoro_pro` entitlement with no free-trial branch; three new buttons in the Settings panel apply a skin immediately (Cat, or Dog/Rabbit if already entitled) or trigger the paywall (Dog/Rabbit if not).

**Tech Stack:** Vanilla JS (no bundler, no framework), reuses the already-integrated RevenueCat Web Billing SDK and Supabase anonymous auth — no new dependencies, no RevenueCat dashboard changes.

**Spec:** [docs/superpowers/specs/2026-09-01-pawmodoro-cosmetic-skins-design.md](../specs/2026-09-01-pawmodoro-cosmetic-skins-design.md)

## Global Constraints

- No bundler — every script loads via a plain `<script>` tag; no ES modules, no `import`/`require` in renderer code.
- Match existing code style exactly: `var` declarations, named `function` statements (no arrow functions).
- Asset filenames must be used byte-exact as committed, including case: `Perrito Idle.GIF`, `Perrito Estudiando.GIF`, `Perrito Descansando.GIF`, `Perrito Celebrando.GIF` (dog); `Conejito Idle.GIF`, `Conejito trabajando.GIF` (lowercase `t`), `Conejito Descansando.GIF`, `Conejito Celebrando.GIF` (rabbit).
- No new RevenueCat product, entitlement, or dashboard configuration — everything reuses `pawmodoro_pro` exactly as already configured and already used by `ensureRoomAccess()`.
- Skin choice has no free-trial concept: Cat is unconditionally free, Dog/Rabbit unconditionally require the entitlement. Do not add any trial/grace logic for skins.
- `getAmbientGif`/`pickCelebrationGif`'s `skin` parameter is a plain required argument (no default value) — every call site passes it explicitly, matching this codebase's existing preference for explicit over implicit parameters (e.g. `computeSecondsLeft(row, now)` always takes `now` explicitly rather than defaulting to `Date.now()` internally).
- The full test suite (`npm test`) must stay at its current count plus this plan's new tests, with zero regressions on existing tests.

---

### Task 1: Pure logic — skin-aware GIF lookup

**Files:**
- Modify: `renderer/timer-logic.js`
- Modify: `tests/timer-logic.test.js`

**Interfaces:**
- Produces: `getAmbientGif(sessionType, timerState, skin)` and `pickCelebrationGif(skin)` — both now take `skin` (`'cat' | 'dog' | 'rabbit'`) as their last argument. `AMBIENT_GIFS`/`CELEBRATION_GIFS` are now nested by skin (`AMBIENT_GIFS.cat.idle`, `CELEBRATION_GIFS.dog`, etc.) instead of flat. Task 3 consumes both functions with the new signature.

- [ ] **Step 1: Write the failing tests**

Current (`tests/timer-logic.test.js`, the `getAmbientGif` and `pickCelebrationGif` describe blocks):
```js
describe('getAmbientGif', () => {
  test('returns idle gif when timerState is idle', () => {
    expect(getAmbientGif('work', 'idle')).toBe('Cat Idle.gif')
  })
  test('returns idle gif when timerState is complete', () => {
    expect(getAmbientGif('work', 'complete')).toBe('Cat Idle.gif')
  })
  test('returns working gif for work+running', () => {
    expect(getAmbientGif('work', 'running')).toBe('Cat Working.gif')
  })
  test('returns idle gif for work+paused', () => {
    expect(getAmbientGif('work', 'paused')).toBe('Cat Idle.gif')
  })
  test('returns resting gif for short-break', () => {
    expect(getAmbientGif('short-break', 'running')).toBe('Cat Resting.gif')
  })
  test('returns resting gif for long-break', () => {
    expect(getAmbientGif('long-break', 'running')).toBe('Cat Resting.gif')
  })
})

describe('pickCelebrationGif', () => {
  test('returns a string from CELEBRATION_GIFS', () => {
    const gif = pickCelebrationGif()
    expect(CELEBRATION_GIFS).toContain(gif)
  })
})
```

Replace both blocks with:
```js
describe('getAmbientGif', () => {
  test('returns idle gif when timerState is idle (cat)', () => {
    expect(getAmbientGif('work', 'idle', 'cat')).toBe('Cat Idle.gif')
  })
  test('returns idle gif when timerState is complete (cat)', () => {
    expect(getAmbientGif('work', 'complete', 'cat')).toBe('Cat Idle.gif')
  })
  test('returns working gif for work+running (cat)', () => {
    expect(getAmbientGif('work', 'running', 'cat')).toBe('Cat Working.gif')
  })
  test('returns idle gif for work+paused (cat)', () => {
    expect(getAmbientGif('work', 'paused', 'cat')).toBe('Cat Idle.gif')
  })
  test('returns resting gif for short-break (cat)', () => {
    expect(getAmbientGif('short-break', 'running', 'cat')).toBe('Cat Resting.gif')
  })
  test('returns resting gif for long-break (cat)', () => {
    expect(getAmbientGif('long-break', 'running', 'cat')).toBe('Cat Resting.gif')
  })
  test('returns the correct dog gif for every state', () => {
    expect(getAmbientGif('work', 'idle', 'dog')).toBe('Perrito Idle.GIF')
    expect(getAmbientGif('work', 'complete', 'dog')).toBe('Perrito Idle.GIF')
    expect(getAmbientGif('work', 'running', 'dog')).toBe('Perrito Estudiando.GIF')
    expect(getAmbientGif('work', 'paused', 'dog')).toBe('Perrito Idle.GIF')
    expect(getAmbientGif('short-break', 'running', 'dog')).toBe('Perrito Descansando.GIF')
    expect(getAmbientGif('long-break', 'running', 'dog')).toBe('Perrito Descansando.GIF')
  })
  test('returns the correct rabbit gif for every state', () => {
    expect(getAmbientGif('work', 'idle', 'rabbit')).toBe('Conejito Idle.GIF')
    expect(getAmbientGif('work', 'complete', 'rabbit')).toBe('Conejito Idle.GIF')
    expect(getAmbientGif('work', 'running', 'rabbit')).toBe('Conejito trabajando.GIF')
    expect(getAmbientGif('work', 'paused', 'rabbit')).toBe('Conejito Idle.GIF')
    expect(getAmbientGif('short-break', 'running', 'rabbit')).toBe('Conejito Descansando.GIF')
    expect(getAmbientGif('long-break', 'running', 'rabbit')).toBe('Conejito Descansando.GIF')
  })
})

describe('pickCelebrationGif', () => {
  test('returns a cat gif from CELEBRATION_GIFS.cat', () => {
    const gif = pickCelebrationGif('cat')
    expect(CELEBRATION_GIFS.cat).toContain(gif)
  })
  test('returns a dog gif from CELEBRATION_GIFS.dog', () => {
    const gif = pickCelebrationGif('dog')
    expect(CELEBRATION_GIFS.dog).toContain(gif)
  })
  test('returns a rabbit gif from CELEBRATION_GIFS.rabbit', () => {
    const gif = pickCelebrationGif('rabbit')
    expect(CELEBRATION_GIFS.rabbit).toContain(gif)
  })
})
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx jest tests/timer-logic.test.js` (if it hangs in this sandboxed environment, use `npx jest --watchman=false --forceExit --runInBand tests/timer-logic.test.js` instead)

Expected: FAIL — the dog/rabbit assertions won't match (still returning cat filenames, since the implementation hasn't changed yet), and/or `CELEBRATION_GIFS.cat` will be `undefined` since `CELEBRATION_GIFS` is still a flat array at this point.

- [ ] **Step 3: Implement**

Current (`renderer/timer-logic.js`, lines 1-41):
```js
var AMBIENT_GIFS = {
  idle: 'Cat Idle.gif',
  'work-running': 'Cat Working.gif',
  'work-paused': 'Cat Idle.gif',
  'short-break': 'Cat Resting.gif',
  'long-break': 'Cat Resting.gif'
}

var CELEBRATION_GIFS = ['Cat Celebrating.gif']

function formatTime(seconds) {
  var m = Math.floor(seconds / 60)
  var s = seconds % 60
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

function getNextSession(currentType, completedWork, config) {
  if (currentType !== 'work') {
    return { type: 'work', duration: config.work * 60 }
  }
  if (completedWork % config.sessionsBeforeLongBreak === 0) {
    return { type: 'long-break', duration: config.longBreak * 60 }
  }
  return { type: 'short-break', duration: config.shortBreak * 60 }
}

function getAmbientGif(sessionType, timerState) {
  if (timerState === 'idle' || timerState === 'complete') {
    return AMBIENT_GIFS.idle
  }
  if (sessionType === 'work') {
    return timerState === 'paused' ? AMBIENT_GIFS['work-paused'] : AMBIENT_GIFS['work-running']
  }
  if (sessionType === 'short-break') return AMBIENT_GIFS['short-break']
  if (sessionType === 'long-break') return AMBIENT_GIFS['long-break']
  return AMBIENT_GIFS.idle
}

function pickCelebrationGif() {
  return CELEBRATION_GIFS[Math.floor(Math.random() * CELEBRATION_GIFS.length)]
}
```

Replace with:
```js
var AMBIENT_GIFS = {
  cat: {
    idle: 'Cat Idle.gif',
    'work-running': 'Cat Working.gif',
    'work-paused': 'Cat Idle.gif',
    'short-break': 'Cat Resting.gif',
    'long-break': 'Cat Resting.gif'
  },
  dog: {
    idle: 'Perrito Idle.GIF',
    'work-running': 'Perrito Estudiando.GIF',
    'work-paused': 'Perrito Idle.GIF',
    'short-break': 'Perrito Descansando.GIF',
    'long-break': 'Perrito Descansando.GIF'
  },
  rabbit: {
    idle: 'Conejito Idle.GIF',
    'work-running': 'Conejito trabajando.GIF',
    'work-paused': 'Conejito Idle.GIF',
    'short-break': 'Conejito Descansando.GIF',
    'long-break': 'Conejito Descansando.GIF'
  }
}

var CELEBRATION_GIFS = {
  cat: ['Cat Celebrating.gif'],
  dog: ['Perrito Celebrando.GIF'],
  rabbit: ['Conejito Celebrando.GIF']
}

function formatTime(seconds) {
  var m = Math.floor(seconds / 60)
  var s = seconds % 60
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

function getNextSession(currentType, completedWork, config) {
  if (currentType !== 'work') {
    return { type: 'work', duration: config.work * 60 }
  }
  if (completedWork % config.sessionsBeforeLongBreak === 0) {
    return { type: 'long-break', duration: config.longBreak * 60 }
  }
  return { type: 'short-break', duration: config.shortBreak * 60 }
}

function getAmbientGif(sessionType, timerState, skin) {
  var gifs = AMBIENT_GIFS[skin]
  if (timerState === 'idle' || timerState === 'complete') {
    return gifs.idle
  }
  if (sessionType === 'work') {
    return timerState === 'paused' ? gifs['work-paused'] : gifs['work-running']
  }
  if (sessionType === 'short-break') return gifs['short-break']
  if (sessionType === 'long-break') return gifs['long-break']
  return gifs.idle
}

function pickCelebrationGif(skin) {
  var gifs = CELEBRATION_GIFS[skin]
  return gifs[Math.floor(Math.random() * gifs.length)]
}
```

The rest of the file (`getAccentColor`, `getDarkAccentColor`, and the `module.exports` block) is unchanged — `AMBIENT_GIFS`/`CELEBRATION_GIFS`/`getAmbientGif`/`pickCelebrationGif` are already exported by name, so the export list itself needs no edits, only the values/functions it points to.

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx jest tests/timer-logic.test.js` (or with the flags from Step 2 if it hangs)

Expected: PASS, all tests including the new dog/rabbit coverage.

- [ ] **Step 5: Run the full suite**

Run: `npm test` (or `npx jest --watchman=false --forceExit --runInBand` if it hangs)

Expected: all suites pass, count increased by exactly 4 over the baseline (2 new `getAmbientGif` tests — one dog block, one rabbit block — and 2 new `pickCelebrationGif` tests — dog and rabbit), zero regressions.

- [ ] **Step 6: Commit**

```bash
git add renderer/timer-logic.js tests/timer-logic.test.js
git commit -m "feat: add skin-aware ambient and celebration GIF lookup"
```

---

### Task 2: Monetization gate — `ensureSkinAccess`

**Files:**
- Modify: `renderer/monetization.js`

**Interfaces:**
- Consumes: `ensureConfigured(userId)` (already exists in this file).
- Produces: `ensureSkinAccess(userId)` → `Promise<boolean>`. Task 3 consumes this from `renderer/app.js`, called after `ensureAnonSession()` (from `renderer/rooms.js`) resolves, exactly the same call shape already used for `ensureRoomAccess`.

- [ ] **Step 1: Add `ensureSkinAccess`**

Current (`renderer/monetization.js`, full file):
```js
// ── RevenueCat SDK reference ────────────────────

var RevenueCatPurchases = window.Purchases.Purchases

// ── State ────────────────────────────────────────

var monetizationState = {
  configured: false,
  purchasesClient: null
}

// ── Configuration ────────────────────────────────

function ensureConfigured(userId) {
  if (!monetizationState.configured) {
    monetizationState.purchasesClient = RevenueCatPurchases.configure(window.REVENUECAT_API_KEY, userId)
    monetizationState.configured = true
  }
  return monetizationState.purchasesClient
}

// ── Free trial ────────────────────────────────────

function markFreeTrialUsed() {
  recordFreeTrialUsed(localStorage)
}

// ── Room access gate ──────────────────────────────

function ensureRoomAccess(userId) {
  var client = ensureConfigured(userId)
  if (!hasUsedFreeTrial(localStorage)) {
    return Promise.resolve(true)
  }
  return client.isEntitledTo('pawmodoro_pro').then(function (entitled) {
    if (entitled) return true
    return client.presentPaywall({}).catch(function () {}).then(function () {
      return client.isEntitledTo('pawmodoro_pro')
    })
  })
}
```

Add this new section at the end of the file, after `ensureRoomAccess`:
```js

// ── Skin access gate ──────────────────────────────

function ensureSkinAccess(userId) {
  var client = ensureConfigured(userId)
  return client.isEntitledTo('pawmodoro_pro').then(function (entitled) {
    if (entitled) return true
    return client.presentPaywall({}).catch(function () {}).then(function () {
      return client.isEntitledTo('pawmodoro_pro')
    })
  })
}
```

Unlike `ensureRoomAccess`, there is no free-trial branch here — Cat is unconditionally free (Task 3 never calls this function for the Cat option at all) and Dog/Rabbit unconditionally require the entitlement, so this always goes straight to the entitlement check.

- [ ] **Step 2: Run the full test suite**

Run: `npm test` (or `npx jest --watchman=false --forceExit --runInBand` if it hangs)

Expected: no change in count from Task 1's end state — this task adds no automated tests (SDK/network-dependent, manually verified, matching how `ensureRoomAccess` itself has no dedicated tests).

- [ ] **Step 3: Commit**

```bash
git add renderer/monetization.js
git commit -m "feat: add skin entitlement gate reusing pawmodoro_pro"
```

---

### Task 3: Companion picker UI

**Files:**
- Modify: `renderer/index.html`
- Modify: `renderer/style.css`
- Modify: `renderer/app.js`

**Interfaces:**
- Consumes: `getAmbientGif(sessionType, timerState, skin)` / `pickCelebrationGif(skin)` (Task 1), `ensureSkinAccess(userId)` (Task 2), `ensureAnonSession()` (existing, `renderer/rooms.js`), `ensureConfigured(userId)` (existing, `renderer/monetization.js`).
- Produces: nothing consumed elsewhere — this is the final task.

- [ ] **Step 1: Add the Companion row markup**

Current (`renderer/index.html`, the `.settings-body` block):
```html
    <div class="settings-body">
      <label>Work (min)<input type="number" id="input-work" min="1" max="120" value="25"></label>
      <label>Short break (min)<input type="number" id="input-short-break" min="1" max="60" value="5"></label>
      <label>Long break (min)<input type="number" id="input-long-break" min="1" max="120" value="30"></label>
      <label>Sessions before long break<input type="number" id="input-sessions" min="1" max="10" value="4"></label>
      <label>Dark mode
        <select id="select-theme">
          <option value="auto">Auto</option>
          <option value="dark">On</option>
          <option value="light">Off</option>
        </select>
      </label>
    </div>
```

Replace with:
```html
    <div class="settings-body">
      <label>Work (min)<input type="number" id="input-work" min="1" max="120" value="25"></label>
      <label>Short break (min)<input type="number" id="input-short-break" min="1" max="60" value="5"></label>
      <label>Long break (min)<input type="number" id="input-long-break" min="1" max="120" value="30"></label>
      <label>Sessions before long break<input type="number" id="input-sessions" min="1" max="10" value="4"></label>
      <label>Dark mode
        <select id="select-theme">
          <option value="auto">Auto</option>
          <option value="dark">On</option>
          <option value="light">Off</option>
        </select>
      </label>
      <label>Companion
        <div class="skin-picker">
          <button class="skin-option" id="skin-option-cat" data-skin="cat" type="button">Cat</button>
          <button class="skin-option" id="skin-option-dog" data-skin="dog" type="button">Dog</button>
          <button class="skin-option" id="skin-option-rabbit" data-skin="rabbit" type="button">Rabbit</button>
        </div>
      </label>
    </div>
```

`type="button"` on each is deliberate — without it, a `<button>` inside a form-like structure can trigger unintended default behavior on click; none of this app's other buttons need it because they aren't nested inside a `<label>` the way these are.

- [ ] **Step 2: Style the picker**

Current (`renderer/style.css`, end of the "── Focus states ───" section):
```css
.settings-body input[type='number']:focus {
  outline: 2px solid var(--black);
  outline-offset: 2px;
}

/* ── Todo panel ───────────────────────────────── */
```

Insert a new section between the two, so it reads:
```css
.settings-body input[type='number']:focus {
  outline: 2px solid var(--black);
  outline-offset: 2px;
}

/* ── Skin picker ──────────────────────────────── */

.skin-picker {
  display: flex;
  gap: 6px;
}

.skin-option {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--black);
  background: transparent;
  color: var(--black);
  cursor: pointer;
  border-radius: 3px;
  font-family: 'MorningBreeze', sans-serif;
  white-space: nowrap;
}

.skin-option.selected {
  background: var(--accent);
  color: #ffffff;
  border-color: var(--accent);
}

.skin-option.locked {
  opacity: 0.6;
}

/* ── Todo panel ───────────────────────────────── */
```

(the last line is the pre-existing comment shown above for placement — do not duplicate it, it already follows immediately after in the file)

- [ ] **Step 3: Add DOM refs and skin state in `renderer/app.js`**

Current (`renderer/app.js`, the DOM refs block, lines 82-102):
```js
var elTimer        = document.getElementById('timer-display')
var elLabel        = document.getElementById('session-label')
var elCatAmbient   = document.getElementById('cat-ambient')
var elDots         = document.getElementById('session-dots')
var elBtnStart     = document.getElementById('btn-start')
var elBtnReset     = document.getElementById('btn-reset')
var elBtnSkipBreak = document.getElementById('btn-skip-break')
var elBtnSettings  = document.getElementById('btn-settings')
var elBtnSetClose  = document.getElementById('btn-settings-close')
var elBtnSave      = document.getElementById('btn-save')
var elBtnMinimize  = document.getElementById('btn-minimize')
var elBtnClose     = document.getElementById('btn-close')
var elOverlay      = document.getElementById('overlay-celebration')
var elCatCelebr    = document.getElementById('cat-celebration')
var elSettingsPanel = document.getElementById('settings-panel')
var elInputWork    = document.getElementById('input-work')
var elInputShort   = document.getElementById('input-short-break')
var elInputLong    = document.getElementById('input-long-break')
var elInputSessions = document.getElementById('input-sessions')
var elActiveTaskLabel = document.getElementById('active-task-label')
var elThemeSelect     = document.getElementById('select-theme')
```

Replace with:
```js
var elTimer        = document.getElementById('timer-display')
var elLabel        = document.getElementById('session-label')
var elCatAmbient   = document.getElementById('cat-ambient')
var elDots         = document.getElementById('session-dots')
var elBtnStart     = document.getElementById('btn-start')
var elBtnReset     = document.getElementById('btn-reset')
var elBtnSkipBreak = document.getElementById('btn-skip-break')
var elBtnSettings  = document.getElementById('btn-settings')
var elBtnSetClose  = document.getElementById('btn-settings-close')
var elBtnSave      = document.getElementById('btn-save')
var elBtnMinimize  = document.getElementById('btn-minimize')
var elBtnClose     = document.getElementById('btn-close')
var elOverlay      = document.getElementById('overlay-celebration')
var elCatCelebr    = document.getElementById('cat-celebration')
var elSettingsPanel = document.getElementById('settings-panel')
var elInputWork    = document.getElementById('input-work')
var elInputShort   = document.getElementById('input-short-break')
var elInputLong    = document.getElementById('input-long-break')
var elInputSessions = document.getElementById('input-sessions')
var elActiveTaskLabel = document.getElementById('active-task-label')
var elThemeSelect     = document.getElementById('select-theme')
var elSkinOptions     = Array.prototype.slice.call(document.querySelectorAll('.skin-option'))
```

Current (`renderer/app.js`, `loadConfig`/`saveConfig`, lines 1-17):
```js
// ── Config persistence ─────────────────────────

function loadConfig() {
  return {
    work: parseInt(localStorage.getItem('cfg-work') || '25', 10),
    shortBreak: parseInt(localStorage.getItem('cfg-shortBreak') || '5', 10),
    longBreak: parseInt(localStorage.getItem('cfg-longBreak') || '30', 10),
    sessionsBeforeLongBreak: parseInt(localStorage.getItem('cfg-sessions') || '4', 10)
  }
}

function saveConfig(config) {
  localStorage.setItem('cfg-work', config.work)
  localStorage.setItem('cfg-shortBreak', config.shortBreak)
  localStorage.setItem('cfg-longBreak', config.longBreak)
  localStorage.setItem('cfg-sessions', config.sessionsBeforeLongBreak)
}
```

Replace with:
```js
// ── Config persistence ─────────────────────────

function loadConfig() {
  return {
    work: parseInt(localStorage.getItem('cfg-work') || '25', 10),
    shortBreak: parseInt(localStorage.getItem('cfg-shortBreak') || '5', 10),
    longBreak: parseInt(localStorage.getItem('cfg-longBreak') || '30', 10),
    sessionsBeforeLongBreak: parseInt(localStorage.getItem('cfg-sessions') || '4', 10)
  }
}

function saveConfig(config) {
  localStorage.setItem('cfg-work', config.work)
  localStorage.setItem('cfg-shortBreak', config.shortBreak)
  localStorage.setItem('cfg-longBreak', config.longBreak)
  localStorage.setItem('cfg-sessions', config.sessionsBeforeLongBreak)
}

function loadSkin() {
  return localStorage.getItem('selected-skin') || 'cat'
}

function saveSkin(skin) {
  localStorage.setItem('selected-skin', skin)
}
```

Current (`renderer/app.js`, the `state` object, lines 70-78):
```js
var state = {
  timerState: 'idle',       // idle | running | paused | complete
  sessionType: 'work',      // work | short-break | long-break
  secondsLeft: config.work * 60,
  completedWork: 0,
  interval: null,
  activeTaskId: null,
  sessionWorkMinutes: config.work
}
```

Replace with:
```js
var state = {
  timerState: 'idle',       // idle | running | paused | complete
  sessionType: 'work',      // work | short-break | long-break
  secondsLeft: config.work * 60,
  completedWork: 0,
  interval: null,
  activeTaskId: null,
  sessionWorkMinutes: config.work,
  skin: loadSkin()
}
```

- [ ] **Step 4: Pass `state.skin` into `getAmbientGif`/`pickCelebrationGif`**

Current (`renderer/app.js`, inside `render()`):
```js
  // Ambient cat GIF
  var gifFile = getAmbientGif(state.sessionType, state.timerState)
```

Replace with:
```js
  // Ambient cat GIF
  var gifFile = getAmbientGif(state.sessionType, state.timerState, state.skin)
```

Current (`renderer/app.js`, inside `showCelebration()`):
```js
function showCelebration() {
  var gif = pickCelebrationGif()
```

Replace with:
```js
function showCelebration() {
  var gif = pickCelebrationGif(state.skin)
```

- [ ] **Step 5: Add the skin-picker logic and wiring**

Add a new section to `renderer/app.js`, right after the `// ── Settings ───` section's existing handlers (`elBtnSettings`, `elBtnSetClose`, `elBtnSave` — i.e. right before the `// ── Window controls ───` comment):

```js
// ── Skin selection ──────────────────────────────

var SKIN_LABELS = { cat: 'Cat', dog: 'Dog', rabbit: 'Rabbit' }
var skinEntitled = false

function updateSkinOptions() {
  elSkinOptions.forEach(function (btn) {
    var skin = btn.getAttribute('data-skin')
    var locked = skin !== 'cat' && !skinEntitled
    btn.classList.toggle('selected', skin === state.skin)
    btn.classList.toggle('locked', locked)
    btn.textContent = locked ? SKIN_LABELS[skin] + ' 🔒' : SKIN_LABELS[skin]
  })
}

function applySkin(skin) {
  state.skin = skin
  saveSkin(skin)
  render()
  updateSkinOptions()
}

elSkinOptions.forEach(function (btn) {
  btn.addEventListener('click', function () {
    var skin = btn.getAttribute('data-skin')
    if (skin === state.skin) return
    if (skin === 'cat') {
      applySkin(skin)
      return
    }
    ensureAnonSession().then(function (session) {
      return ensureSkinAccess(session.user.id)
    }).then(function (allowed) {
      if (allowed) {
        skinEntitled = true
        applySkin(skin)
      }
    }).catch(function () {})
  })
})
```

Write `🔒` as a literal UTF-8 character in the file, not an escape sequence — this codebase's other emoji (e.g. the 🔗 in `renderer/todo.js`, the nudge toast copy in `renderer/rooms.js`) are all written as literal characters.

`ensureAnonSession` and `ensureSkinAccess` are called directly without a `typeof` guard, matching the existing convention in this file (see `roomHandleStart()`, `roomAttemptAdvance()` being called directly elsewhere in `app.js` once the relevant cross-file dependency is known to exist by the time any click can actually happen — all scripts are loaded by the time a user can click anything).

- [ ] **Step 6: Show the current skin state whenever Settings opens**

Current (`renderer/app.js`, the `elBtnSettings` click handler):
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

Replace with:
```js
elBtnSettings.addEventListener('click', function () {
  elInputWork.value = config.work
  elInputShort.value = config.shortBreak
  elInputLong.value = config.longBreak
  elInputSessions.value = config.sessionsBeforeLongBreak
  elThemeSelect.value = localStorage.getItem('theme-override') || 'auto'
  document.getElementById('room-panel').classList.remove('visible')
  elSettingsPanel.classList.add('visible')
  updateSkinOptions()
  ensureAnonSession().then(function (session) {
    var client = ensureConfigured(session.user.id)
    return client.isEntitledTo('pawmodoro_pro')
  }).then(function (entitled) {
    skinEntitled = entitled
    updateSkinOptions()
  }).catch(function () {})
})
```

The first `updateSkinOptions()` call (before the entitlement check resolves) renders the picker immediately using whatever `skinEntitled` was left at from the last check this session (`false` on first open) — this avoids a flash of unstyled/unlabeled buttons while the async check is in flight. The second call, once the real entitlement status is known, corrects the lock display if it was wrong. `ensureConfigured` is called directly, matching the existing no-guard-needed convention for cross-file calls used throughout this file (e.g. `roomHandleStart`).

- [ ] **Step 7: Manual verification**

Run the app. Open Settings — confirm all three Companion buttons render, Cat is selected by default, Dog/Rabbit show a lock. Click Cat while it's already selected — confirm nothing happens (no-op). As a non-entitled user, click Dog — confirm the paywall appears; complete a purchase — confirm Dog becomes selected, its lock disappears, and Rabbit's lock disappears too (same entitlement unlocks both); confirm the ambient GIF on the main timer screen is now the dog GIF matching the current session state, and that triggering a celebration (finish a session) shows a dog celebration GIF. Reopen Settings — confirm Dog stays selected and unlocked. As an already-entitled user (or after the above), click Rabbit — confirm it applies immediately with no paywall, and the ambient/celebration GIFs update accordingly. Switch back to Cat — confirm it applies immediately (never gated) and the GIFs revert to the cat set.

- [ ] **Step 8: Run the full test suite**

Run: `npm test` (or with the flags from Task 1 Step 2 if it hangs)

Expected: no change in count from Task 2's end state — this task adds no new automated tests (DOM/SDK wiring, manually verified).

- [ ] **Step 9: Commit**

```bash
git add renderer/index.html renderer/style.css renderer/app.js
git commit -m "feat: add Companion skin picker to Settings"
```
