# Pawmodoro RevenueCat Monetization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate shared rooms behind a one-time `pawmodoro_pro` purchase — free users get one room (create or join), every room action after that requires the entitlement, purchased through RevenueCat's Web Billing checkout.

**Architecture:** A new pure-logic file (`renderer/monetization-logic.js`) holds the free-trial-flag read/write functions, storage-injected so they're genuinely unit-testable without a DOM — matching the `rooms-logic.js`/`rooms.js` split already established in this codebase. A new DOM-wiring file (`renderer/monetization.js`) owns the vendored RevenueCat SDK: lazy configuration, the entitlement check, and presenting the paywall. `renderer/rooms.js`'s two room-entry click handlers each gain one gate check calling into it; nothing else about the existing create/join/leave/presence/timer-sync flow changes.

**Tech Stack:** `@revenuecat/purchases-js` v1 (vendored UMD bundle, no bundler — same pattern as `@supabase/supabase-js`), existing vanilla JS/Jest toolchain.

**Spec:** `docs/superpowers/specs/2026-08-25-pawmodoro-revenuecat-monetization-design.md`

## Global Constraints

- Real Stripe + RevenueCat accounts already exist — live purchase-flow testing happens for real in this plan, not deferred.
- Product: **Lifetime (one-time purchase) only** — no subscription code.
- Entitlement identifier: **`pawmodoro_pro`** (exact string).
- API key: `test_kZvwYQCGYEFNChQFCxuJmLtShuK` — a test-mode public key, safe to commit (same trust model as Supabase's anon key).
- No bundler — every new script must work loaded via a plain `<script>` tag.
- **Critical API detail, verified directly against the shipped UMD bundle, not assumed:** the bundle attaches a namespace object to `window.Purchases`, and the actual `Purchases` class — the one with `.configure()` — is a property ON that namespace: `window.Purchases.Purchases`, not `window.Purchases` itself. Getting this wrong breaks the whole feature silently (calling `.configure` on the wrong object throws immediately).
- `npm test` currently passes 74/74; must keep passing, growing only where a task adds tests.
- Free-trial tracking is a single `localStorage` flag — soft, per-device, resettable by clearing storage. Accepted simplification, not real anti-abuse enforcement.
- Accepted limitation, not mitigated in this plan: clearing storage creates a new anonymous Supabase user ID (reused as RevenueCat's `appUserId`), so a genuine past purchase would no longer show as entitled on that fresh identity. No email collection or account linking.
- No Customer Center, no explicit restore-purchases flow (not needed given the `appUserId` continuity model).

---

### Task 1: Pure free-trial-flag logic

**Files:**
- Create: `renderer/monetization-logic.js`
- Test: `tests/monetization-logic.test.js`

**Interfaces:**
- Produces: `hasUsedFreeTrial(storage)` → boolean; `recordFreeTrialUsed(storage)` → void; `FREE_TRIAL_KEY` (string constant). `storage` is any object shaped like the Web Storage API (`{ getItem(key), setItem(key, value) }`) — in the browser this is the real `localStorage`; tests pass a plain-object-backed fake. Both exported via `module.exports` when `typeof module !== 'undefined'`, matching `renderer/rooms-logic.js`'s existing dual Node/browser export pattern. Task 3 calls both by these exact names, passing the real `localStorage`.

- [ ] **Step 1: Write the failing tests**

Create `tests/monetization-logic.test.js`:

```js
const {
  hasUsedFreeTrial,
  recordFreeTrialUsed,
  FREE_TRIAL_KEY
} = require('../renderer/monetization-logic')

function createFakeStorage() {
  var store = {}
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem: function (key, value) {
      store[key] = value
    }
  }
}

describe('hasUsedFreeTrial', () => {
  test('returns false when nothing has been stored', () => {
    var storage = createFakeStorage()
    expect(hasUsedFreeTrial(storage)).toBe(false)
  })

  test('returns true after recordFreeTrialUsed has been called', () => {
    var storage = createFakeStorage()
    recordFreeTrialUsed(storage)
    expect(hasUsedFreeTrial(storage)).toBe(true)
  })
})

describe('recordFreeTrialUsed', () => {
  test('writes the expected key to storage', () => {
    var storage = createFakeStorage()
    recordFreeTrialUsed(storage)
    expect(storage.getItem(FREE_TRIAL_KEY)).toBe('true')
  })

  test('is idempotent across repeated calls', () => {
    var storage = createFakeStorage()
    recordFreeTrialUsed(storage)
    recordFreeTrialUsed(storage)
    expect(hasUsedFreeTrial(storage)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/monetization-logic.test.js`
Expected: FAIL — `Cannot find module '../renderer/monetization-logic'`

- [ ] **Step 3: Write the implementation**

Create `renderer/monetization-logic.js`:

```js
var FREE_TRIAL_KEY = 'room-free-trial-used'

function hasUsedFreeTrial(storage) {
  return !!storage.getItem(FREE_TRIAL_KEY)
}

function recordFreeTrialUsed(storage) {
  storage.setItem(FREE_TRIAL_KEY, 'true')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hasUsedFreeTrial,
    recordFreeTrialUsed,
    FREE_TRIAL_KEY
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/monetization-logic.test.js`
Expected: PASS, 4/4 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 78/78 (74 existing + 4 new).

- [ ] **Step 6: Commit**

```bash
git add renderer/monetization-logic.js tests/monetization-logic.test.js
git commit -m "feat: add free-trial-flag pure logic for room paywall gating"
```

---

### Task 2: Vendor the RevenueCat SDK and config scaffolding

**Files:**
- Create: `renderer/purchases.js` (vendored)
- Create: `renderer/revenuecat-config.js`
- Modify: `package.json`
- Modify: `renderer/index.html:102-110`

**Interfaces:**
- Produces: `window.Purchases.Purchases` (the RevenueCat SDK class — note the namespace nesting, see Global Constraints), `window.REVENUECAT_API_KEY` (from the config file). Task 3 constructs the client using these two globals.

- [ ] **Step 1: Install the dependency**

Run:
```bash
npm install --save-dev @revenuecat/purchases-js
```
Expected: install succeeds, `package.json` gains `@revenuecat/purchases-js` under `devDependencies` (not `dependencies` — it's a browser-global bundle we vendor, never `require`d by Electron/Node code, matching the same reasoning already applied to `@supabase/supabase-js` and the Capacitor packages).

- [ ] **Step 2: Vendor the browser bundle**

Run:
```bash
cp node_modules/@revenuecat/purchases-js/dist/Purchases.umd.js renderer/purchases.js
```
Expected: `renderer/purchases.js` exists.

- [ ] **Step 3: Create the config file**

Create `renderer/revenuecat-config.js`:

```js
window.REVENUECAT_API_KEY = 'test_kZvwYQCGYEFNChQFCxuJmLtShuK'
```

- [ ] **Step 4: Wire the script tags**

In `renderer/index.html`, change lines 102-110 from:

```html
  <script src="timer-logic.js"></script>
  <script src="todo-logic.js"></script>
  <script src="rooms-logic.js"></script>
  <script src="supabase-config.js"></script>
  <script src="supabase.js"></script>
  <script src="platform.js"></script>
  <script src="app.js"></script>
  <script src="todo.js"></script>
  <script src="rooms.js"></script>
```

to:

```html
  <script src="timer-logic.js"></script>
  <script src="todo-logic.js"></script>
  <script src="rooms-logic.js"></script>
  <script src="monetization-logic.js"></script>
  <script src="supabase-config.js"></script>
  <script src="supabase.js"></script>
  <script src="revenuecat-config.js"></script>
  <script src="purchases.js"></script>
  <script src="platform.js"></script>
  <script src="app.js"></script>
  <script src="todo.js"></script>
  <script src="monetization.js"></script>
  <script src="rooms.js"></script>
```

- [ ] **Step 5: Verify the global namespace shape**

Run: `npm start`, and once the app window is open, check the renderer's console (or add a temporary `console.log(typeof window.Purchases, typeof window.Purchases.Purchases)` at the end of `renderer/purchases.js` loading — remove it after checking) — confirm `window.Purchases` is an object and `window.Purchases.Purchases` is a function (the class constructor/static-method holder). This confirms the Global Constraints section's namespace claim before Task 3 depends on it.

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: PASS, 78/78, unchanged (this task adds no test-covered logic).

- [ ] **Step 7: Verify the new files sync into the iOS build folder**

Run: `npm run sync:ios`
Expected: script populates `www/`. Then run:
```bash
ls www/
```
Expected: `purchases.js`, `revenuecat-config.js`, and `monetization-logic.js` all present alongside the existing files (the sync script copies every top-level file in `renderer/`, so this should need no code change).

- [ ] **Step 8: Commit**

```bash
git add renderer/purchases.js renderer/revenuecat-config.js renderer/index.html package.json package-lock.json
git commit -m "feat: vendor RevenueCat SDK and add config scaffolding"
```

---

### Task 3: Room paywall gating

**Files:**
- Create: `renderer/monetization.js`
- Modify: `renderer/rooms.js:278-324`

**Interfaces:**
- Consumes: `hasUsedFreeTrial(storage)`, `recordFreeTrialUsed(storage)` (Task 1). `window.Purchases.Purchases`, `window.REVENUECAT_API_KEY` (Task 2). The global `localStorage` browser API.
- Produces: `ensureRoomAccess(userId)` → `Promise<boolean>`; `markFreeTrialUsed()` → void (no-arg wrapper around `recordFreeTrialUsed(localStorage)`). Both global functions in `renderer/monetization.js`, called from `renderer/rooms.js`'s `elBtnRoomCreate`/`elBtnRoomJoin` handlers and `enterRoom()`.

- [ ] **Step 1: Create `renderer/monetization.js`**

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
    return client.presentPaywall({}).then(function () {
      return client.isEntitledTo('pawmodoro_pro')
    })
  })
}
```

- [ ] **Step 2: Add the gate check to `elBtnRoomCreate`**

In `renderer/rooms.js`, change:

```js
elBtnRoomCreate.addEventListener('click', function () {
  clearRoomError()
  ensureAnonSession().then(function () {
    var code = generateJoinCode()
    return supabaseClient.from('rooms').insert({ join_code: code }).select().single().then(function (result) {
      if (result.error) {
        showRoomError('Could not create room. Try again.')
        return
      }
      enterRoom(result.data)
    })
  }).catch(function () {
    showRoomError('Could not connect. Check your connection.')
  })
})
```

to:

```js
elBtnRoomCreate.addEventListener('click', function () {
  clearRoomError()
  ensureAnonSession().then(function (session) {
    return ensureRoomAccess(session.user.id).then(function (allowed) {
      if (!allowed) return
      var code = generateJoinCode()
      return supabaseClient.from('rooms').insert({ join_code: code }).select().single().then(function (result) {
        if (result.error) {
          showRoomError('Could not create room. Try again.')
          return
        }
        enterRoom(result.data)
      })
    })
  }).catch(function () {
    showRoomError('Could not connect. Check your connection.')
  })
})
```

- [ ] **Step 3: Add the gate check to `elBtnRoomJoin`**

In `renderer/rooms.js`, change:

```js
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
      enterRoom(result.data)
    })
  }).catch(function () {
    showRoomError('Could not connect. Check your connection.')
  })
})
```

to:

```js
elBtnRoomJoin.addEventListener('click', function () {
  clearRoomError()
  var code = elInputJoinCode.value.trim().toUpperCase()
  if (!code) return
  ensureAnonSession().then(function (session) {
    return ensureRoomAccess(session.user.id).then(function (allowed) {
      if (!allowed) return
      return supabaseClient.from('rooms').select().eq('join_code', code).single().then(function (result) {
        if (result.error || !result.data) {
          showRoomError('Room not found.')
          return
        }
        enterRoom(result.data)
      })
    })
  }).catch(function () {
    showRoomError('Could not connect. Check your connection.')
  })
})
```

- [ ] **Step 4: Mark the free trial used on successful room entry**

In `renderer/rooms.js`, change `enterRoom`:

```js
function enterRoom(row) {
  roomState.roomId = row.id
  roomState.joinCode = row.join_code
  roomState.nickname = getNickname()
  localStorage.setItem('room-nickname', roomState.nickname)
  clearInterval(state.interval)
  state.interval = null
  applyRoomTimerRow(row)
  subscribeToRoom(row.id)
  roomState.tickInterval = setInterval(tick, 1000)
  elRoomCodeValue.textContent = row.join_code
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
  clearInterval(state.interval)
  state.interval = null
  applyRoomTimerRow(row)
  subscribeToRoom(row.id)
  roomState.tickInterval = setInterval(tick, 1000)
  elRoomCodeValue.textContent = row.join_code
  elRoomPanel.classList.add('in-room')
  clearRoomError()
  markFreeTrialUsed()
}
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS, 78/78, unchanged (this task adds DOM/network wiring, not logic covered by tests — matches the established pattern where `rooms.js`'s Supabase wiring is verified live rather than unit-tested).

- [ ] **Step 6: Manual live verification — free trial**

Run `npm start`, using an environment that has never had a room open before (or manually run `localStorage.removeItem('room-free-trial-used')` in the app's devtools console first). Create a room. Confirm it succeeds with no paywall shown — this is the free first room.

- [ ] **Step 7: Manual live verification — paywall trigger and purchase**

In the same running instance, leave the room, then attempt to create or join a second room. Confirm the RevenueCat paywall overlay appears (rendered by `presentPaywall`). Complete a test-mode purchase using Stripe's test card flow. Confirm the paywall closes and the room action you attempted (create/join) completes successfully afterward.

- [ ] **Step 8: Manual live verification — persistence across relaunch**

Quit and relaunch the app (same device, same persisted Supabase session — do not clear storage). Attempt to create/join another room. Confirm no paywall appears this time — the earlier purchase is recognized via the same `appUserId`, `isEntitledTo('pawmodoro_pro')` resolves `true` without a new purchase.

Note any discrepancy in your report — this is genuinely live-tested against real Stripe/RevenueCat test-mode infrastructure, not deferred.

- [ ] **Step 9: Commit**

```bash
git add renderer/monetization.js renderer/rooms.js
git commit -m "feat: gate shared rooms behind a one-time RevenueCat purchase"
```
