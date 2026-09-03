# Pawmodoro Google Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace anonymous-only Supabase auth with mandatory Google sign-in — the whole app, including the free solo timer, is gated behind a sign-in screen until a real (non-anonymous) session exists.

**Architecture:** Electron's main process gains a custom URL scheme (`pawmodoro://`) and forwards the OAuth redirect to the renderer over IPC; a new `renderer/auth.js` owns the Supabase client, the sign-in/sign-out flow, and the boot-time session check; a new full-screen sign-in view blocks the existing app until that check passes; the existing `ensureAnonSession()` (which every room/skin-purchase call site used to lazily create an anonymous session) is replaced by a simpler `getSession()`, since mandatory login means a real session always already exists by the time any of those call sites run.

**Tech Stack:** `@supabase/supabase-js`'s OAuth methods (already integrated), Electron's `app.setAsDefaultProtocolClient`/`open-url` for deep linking, Capacitor's native-bridge `window.Capacitor.addListener(plugin, event, callback)` primitive for the iOS deep-link event (no new npm dependency — see the corrected constraint below).

**Spec:** [docs/superpowers/specs/2026-09-03-pawmodoro-google-accounts-design.md](../specs/2026-09-03-pawmodoro-google-accounts-design.md)

## Global Constraints

- No bundler — every script loads via a plain `<script>` tag; no ES modules, no `import`/`require` in renderer code.
- Match existing code style exactly: `var` declarations, named `function` statements (no arrow functions).
- **Verified against real SDK source, not assumed** (all confirmed directly against the shipped packages in `node_modules`, not from memory or documentation):
  - `supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } })` resolves `{ data: { url }, error }` without navigating anywhere, confirmed in `@supabase/auth-js`'s shipped type definitions.
  - `supabase.auth.exchangeCodeForSession(code)` completes a PKCE OAuth flow given the `code` query parameter from the redirect.
  - `User.is_anonymous` is a real `boolean` field on the session's user object (confirmed in `@supabase/auth-js`'s shipped `User` interface) — this is how the boot check tells a real Google-authenticated user apart from the old anonymous-session model.
  - **Correction found during Task 2's live verification (superseding this plan's original approach):** vendoring `@capacitor/app`'s `dist/plugin.js` was tried and is genuinely broken outside a native context — loading it via a plain `<script>` tag throws `ReferenceError: capacitorExports is not defined`, because that file's UMD wrapper expects a *second* script (`@capacitor/core`'s own `dist/capacitor.js`) to have already run and defined the global `var capacitorExports = ...` — a file this project deliberately never vendors. The correct, verified mechanism needs no plugin-specific bundle at all: `@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js` (the actual native bridge iOS injects into the WebView before any of this app's own scripts run — confirmed by reading its shipped source directly, not assumed) defines `cap.addListener = (pluginName, eventName, callback) => { const callbackId = cap.nativeCallback(pluginName, 'addListener', { eventName }, callback); return { remove: ... } }`. So `window.Capacitor.addListener('App', 'appUrlOpen', callback)` is a real, native-bridge-provided primitive — it internally calls `nativeCallback`, the exact sibling of the `nativePromise` mechanism `renderer/platform.js`'s existing `Browser.open` call already uses (`window.Capacitor.nativePromise('Browser', 'open', { url })`). No `@capacitor/app` npm dependency, no vendored file, no plugin registration needed — just this one direct call in `renderer/auth.js`, gated on `window.Capacitor` existing exactly like `platform.js` already gates its own native calls.
- **Google Cloud Console's Authorized Redirect URI is Supabase's own fixed callback URL** (`https://<project-ref>.supabase.co/auth/v1/callback`), not the app's custom scheme — this is the user's own dashboard configuration, not something this plan's code touches, but it's worth restating here since a wrong value there breaks everything downstream silently.
- This app's `package.json` description scopes it to macOS — only macOS's `open-url` deep-link mechanism is implemented; Windows/Linux (`second-instance` + `requestSingleInstanceLock`) is out of scope.
- This app has never been packaged into a distributable `.app` (only ever run via `npm start`/`electron .`) — `app.setAsDefaultProtocolClient` is less reliable for an unpackaged dev run than a packaged one. This is a real, accepted risk to how far this plan's live verification can go, not something this plan's tasks attempt to fix.
- The full test suite (`npm test`) must stay at its current count (87/87) with zero regressions — this plan adds no new automated tests (OAuth flow, IPC, and native config wiring have no pure logic to unit test, consistent with how this codebase's other DOM/network/native-wiring code is verified: manually, not with Jest).

---

### Task 1: Electron deep-link plumbing

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

**Interfaces:**
- Produces: a new IPC channel, `auth-deep-link`, carrying the full callback URL string (e.g. `pawmodoro://auth-callback?code=...`) from the main process to the renderer, exposed to the renderer as `window.authBridge.onDeepLink(callback)`. Task 3 consumes this.

- [ ] **Step 1: Register the protocol and capture the redirect**

Current (`main.js`, full file):
```js
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')

let win

function createWindow() {
  win = new BrowserWindow({
    width: 740,
    height: 580,
    minWidth: 740,
    minHeight: 580,
    resizable: true,
    frame: false,
    icon: path.join(__dirname, 'assets/icon.icns'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadFile('renderer/index.html')
}

app.whenReady().then(() => {
  if (app.dock) app.dock.setIcon(path.join(__dirname, 'assets/icon.icns'))
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.on('window-close', () => win.close())
ipcMain.on('window-minimize', () => win.minimize())
ipcMain.on('open-external', (_, url) => shell.openExternal(url))
```

Replace with:
```js
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')

let win
let pendingDeepLink = null

app.setAsDefaultProtocolClient('pawmodoro')

app.on('open-url', (event, url) => {
  event.preventDefault()
  if (win) {
    win.webContents.send('auth-deep-link', url)
  } else {
    pendingDeepLink = url
  }
})

function createWindow() {
  win = new BrowserWindow({
    width: 740,
    height: 580,
    minWidth: 740,
    minHeight: 580,
    resizable: true,
    frame: false,
    icon: path.join(__dirname, 'assets/icon.icns'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadFile('renderer/index.html')
  if (pendingDeepLink) {
    var deferredUrl = pendingDeepLink
    pendingDeepLink = null
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('auth-deep-link', deferredUrl)
    })
  }
}

app.whenReady().then(() => {
  if (app.dock) app.dock.setIcon(path.join(__dirname, 'assets/icon.icns'))
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.on('window-close', () => win.close())
ipcMain.on('window-minimize', () => win.minimize())
ipcMain.on('open-external', (_, url) => shell.openExternal(url))
```

The `pendingDeepLink` handling covers the case where macOS launches the app fresh via the deep link (so `open-url` fires before `win` exists) — the URL is held until the window's first load finishes, then delivered. In the normal case (app already running when the user completes sign-in), `win` already exists and the URL is sent immediately.

- [ ] **Step 2: Expose the channel to the renderer**

Current (`preload.js`, full file):
```js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('windowControls', {
  close: () => ipcRenderer.send('window-close'),
  minimize: () => ipcRenderer.send('window-minimize'),
  openExternal: (url) => ipcRenderer.send('open-external', url)
})
```

Replace with:
```js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('windowControls', {
  close: () => ipcRenderer.send('window-close'),
  minimize: () => ipcRenderer.send('window-minimize'),
  openExternal: (url) => ipcRenderer.send('open-external', url)
})

contextBridge.exposeInMainWorld('authBridge', {
  onDeepLink: (callback) => ipcRenderer.on('auth-deep-link', (_event, url) => callback(url))
})
```

- [ ] **Step 3: Manual verification**

This task has no renderer-visible effect on its own (nothing calls `window.authBridge` yet — that's Task 3) and no automated test coverage (Electron main-process code isn't reachable from this project's Jest suite, consistent with how `main.js`/`preload.js` have never been unit tested). Confirm `npm start` still launches the app normally with no console errors, and that `node -c main.js` / `node -c preload.js` report no syntax errors (Electron-specific globals like `require('electron')` will fail an actual `node` execution, but `-c` only checks syntax, not execution, so this is a safe sanity check).

- [ ] **Step 4: Run the full test suite**

Run: `npm test` (or `npx jest --watchman=false --forceExit --runInBand` if it hangs — a known sandbox quirk in some environments, unrelated to this change)

Expected: 87/87, unchanged.

- [ ] **Step 5: Commit**

```bash
git add main.js preload.js
git commit -m "feat: register pawmodoro:// deep link and forward it to the renderer"
```

---

### Task 2: Sign-in view UI

**Files:**
- Modify: `renderer/index.html`
- Modify: `renderer/style.css`

**Interfaces:**
- Produces: the DOM elements `#auth-view`, `#auth-error`, `#btn-sign-in-google`, `#btn-sign-out` — Task 3 (`renderer/auth.js`) looks these up by ID. `body.signed-in` is the CSS class that hides `#auth-view` — Task 3 toggles it. The `auth.js` `<script>` tag itself is added to `renderer/index.html` in this task even though Task 3 hasn't created that file yet — the browser will show one 404 for that tag until Task 3 lands, exactly as already accepted in this project's history (the cosmetic-skins feature's Settings-picker task did the same thing for its own follow-up file) — a 404 on one `<script>` tag doesn't block the other tags from loading and running in order.

- [ ] **Step 1: Add the sign-in view and sign-out button markup**

Current (`renderer/index.html`, the top of `<body>`, right after the opening tag):
```html
<body>

  <div class="titlebar">
```

Replace with:
```html
<body>

  <div class="auth-view" id="auth-view">
    <div class="auth-box">
      <img class="auth-mascot" src="../assets/Cat Idle.gif" alt="">
      <div class="auth-title">Pawmodoro</div>
      <div class="auth-subtitle">Sign in to get started</div>
      <button class="btn-sign-in-google" id="btn-sign-in-google" type="button">Sign in with Google</button>
      <div class="auth-error" id="auth-error"></div>
    </div>
  </div>

  <div class="titlebar">
```

Current (`renderer/index.html`, the end of the settings panel):
```html
    <button class="btn-save" id="btn-save">Save</button>
  </div>

  <div class="room-panel" id="room-panel">
```

Replace with:
```html
    <button class="btn-save" id="btn-save">Save</button>
    <button class="btn-sign-out" id="btn-sign-out" type="button">Sign Out</button>
  </div>

  <div class="room-panel" id="room-panel">
```

- [ ] **Step 2: Update the script tags**

Current (`renderer/index.html`, the closing script block):
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
</body>
```

Replace with:
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
  <script src="auth.js"></script>
  <script src="app.js"></script>
  <script src="todo.js"></script>
  <script src="monetization.js"></script>
  <script src="rooms.js"></script>
</body>
```

`auth.js` doesn't exist until Task 3 — see the note in this task's Interfaces section above; this is expected and harmless. No `capacitor-app.js` tag is added — see the corrected Global Constraints note: the iOS deep-link listener uses Capacitor's native-bridge `window.Capacitor.addListener` primitive directly (Task 3), needing no vendored plugin bundle. `auth.js` loads after `platform.js` (it calls `window.platformControls.openExternal`) and before `app.js`/`rooms.js` (both of which will call `auth.js`'s `getSession()` once Task 4 lands).

- [ ] **Step 3: Style the sign-in view and sign-out button**

Add to `renderer/style.css`, as a new section right after the `/* ── Web layout ───` section (search for `body.web .titlebar { display: none; }` — insert immediately after that line, before the following `/* ── Room panel ───` comment):
```css
/* ── Auth gate ────────────────────────────────── */

.auth-view {
  position: fixed;
  inset: 0;
  background: var(--white);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

body.signed-in .auth-view {
  display: none;
}

.auth-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.auth-mascot {
  width: 120px;
  height: 120px;
  object-fit: contain;
}

.auth-title {
  font-size: 28px;
  font-weight: 700;
}

.auth-subtitle {
  font-size: 15px;
  font-weight: 300;
  opacity: 0.7;
  margin-bottom: 10px;
}

.btn-sign-in-google {
  padding: 10px 28px;
  background: var(--black);
  color: var(--white);
  border: none;
  font-family: 'MorningBreeze', sans-serif;
  font-size: 16px;
  cursor: pointer;
  border-radius: 6px;
  transition: opacity 0.15s;
}

.btn-sign-in-google:hover {
  opacity: 0.85;
}

.auth-error {
  color: var(--red);
  font-size: 12px;
  min-height: 16px;
}
```

Add to `renderer/style.css`, right after the `.btn-save:hover` rule:
```css
.btn-sign-out {
  width: 100%;
  padding: 8px;
  background: transparent;
  color: var(--red);
  border: 2px solid var(--red);
  font-family: 'MorningBreeze', sans-serif;
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  margin-top: 8px;
  transition: background 0.15s, color 0.15s;
}

.btn-sign-out:hover {
  background: var(--red);
  color: var(--white);
}
```

`z-index: 300` puts the auth gate above every other overlay in this app (the highest existing value is `.nudge-toast`'s `200`) — since the auth gate is meant to block literally everything else, it must render on top of anything that could otherwise appear.

- [ ] **Step 4: Manual verification**

Serve the repo locally (e.g. `python3 -m http.server` from the repo root, then open `renderer/index.html`) and confirm: the sign-in view covers the whole screen (since `body` doesn't have the `signed-in` class yet, nothing toggles it away — this is expected at this point in the plan, `auth.js` doesn't exist yet to ever add that class). Confirm no layout is broken, the mascot image loads, and the "Sign in with Google" button is visible (it won't do anything yet — no handler is wired until Task 3). Check the browser console: expect exactly one 404, for `auth.js` (per this task's Interfaces note) — no other errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm test` (or with the flags from Task 1 Step 4 if it hangs)

Expected: 87/87, unchanged.

- [ ] **Step 6: Commit**

```bash
git add renderer/index.html renderer/style.css
git commit -m "feat: add sign-in view UI"
```

---

### Task 3: Supabase auth module

**Files:**
- Create: `renderer/auth.js`

**Interfaces:**
- Consumes: `window.authBridge.onDeepLink` (Task 1), the DOM elements from Task 2, `window.platformControls.openExternal` (existing, `renderer/platform.js`), `window.Capacitor.addListener` (Capacitor's native-bridge primitive, only present when `window.Capacitor` exists — i.e. running inside the native iOS build, not Electron/web).
- Produces: `supabaseClient` (moved here from `renderer/rooms.js` — Task 4 removes the duplicate declaration there), `getSession()` → `Promise<Session|null>`, `isRealSession(session)` → `boolean`. Task 4 consumes `getSession()` from `renderer/rooms.js` and `renderer/app.js`.

- [ ] **Step 1: Write `renderer/auth.js`**

Create the full file:
```js
// ── Supabase client ──────────────────────────────

var supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)

// ── DOM refs ──────────────────────────────────────

var elAuthError  = document.getElementById('auth-error')
var elBtnGoogle  = document.getElementById('btn-sign-in-google')
var elBtnSignOut = document.getElementById('btn-sign-out')

// ── Session ───────────────────────────────────────

function isRealSession(session) {
  return !!(session && session.user && !session.user.is_anonymous)
}

function getSession() {
  return supabaseClient.auth.getSession().then(function (result) {
    return result.data.session
  })
}

function showApp() {
  document.body.classList.add('signed-in')
}

function showAuthGate() {
  document.body.classList.remove('signed-in')
}

// ── Errors ────────────────────────────────────────

function showAuthError(message) {
  elAuthError.textContent = message
}

function clearAuthError() {
  elAuthError.textContent = ''
}

// ── Sign in ───────────────────────────────────────

function signInWithGoogle() {
  clearAuthError()
  supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'pawmodoro://auth-callback', skipBrowserRedirect: true }
  }).then(function (result) {
    if (result.error || !result.data.url) {
      showAuthError('Could not start sign-in. Try again.')
      return
    }
    window.platformControls.openExternal(result.data.url)
  })
}

function handleAuthCallbackUrl(url) {
  var code
  try {
    code = new URL(url).searchParams.get('code')
  } catch (e) {
    return
  }
  if (!code) return
  supabaseClient.auth.exchangeCodeForSession(code).then(function (result) {
    if (result.error || !isRealSession(result.data.session)) {
      showAuthError('Sign-in failed. Try again.')
      return
    }
    showApp()
  })
}

elBtnGoogle.addEventListener('click', signInWithGoogle)

// ── Sign out ──────────────────────────────────────

function signOut() {
  supabaseClient.auth.signOut().then(function () {
    showAuthGate()
  })
}

elBtnSignOut.addEventListener('click', signOut)

// ── Deep link listeners ───────────────────────────

if (window.authBridge) {
  window.authBridge.onDeepLink(handleAuthCallbackUrl)
}

if (window.Capacitor) {
  window.Capacitor.addListener('App', 'appUrlOpen', function (data) {
    handleAuthCallbackUrl(data.url)
  })
}

// ── Boot ──────────────────────────────────────────

getSession().then(function (session) {
  if (isRealSession(session)) showApp()
})
```

`elBtnGoogle`/`elBtnSignOut` are referenced without a `typeof`/null guard because Task 2 already created both elements unconditionally in `renderer/index.html`, and `auth.js` loads after that markup exists in the DOM (script tags execute after the DOM nodes above them have already been parsed) — this matches the existing convention elsewhere in this codebase (e.g. `renderer/app.js`'s `elBtnStart` DOM refs are never null-guarded either, for the same reason.

The `window.authBridge` guard covers Capacitor/web, where that global is never defined (only Electron's `preload.js` sets it). The `window.Capacitor` guard covers Electron/web, where that global doesn't exist — `window.Capacitor.addListener('App', 'appUrlOpen', callback)` is Capacitor's native-bridge primitive (confirmed directly in `@capacitor/ios`'s shipped `native-bridge.js`, the actual script iOS injects before this app's own scripts run — see the corrected Global Constraints note above), the exact sibling of `renderer/platform.js`'s existing `window.Capacitor.nativePromise('Browser', 'open', { url })` call. No `@capacitor/app` dependency and no vendored plugin file are needed.

- [ ] **Step 2: Manual verification**

Serve the repo locally and confirm: the sign-in view still shows (no real session exists yet — this is still expected, since Task 4 hasn't updated the rest of the app to use `getSession()`, but that doesn't affect this task's own boot check running correctly). No console errors this time (the `auth.js` 404 from Task 2 is gone now that the file exists). Click "Sign in with Google" — since no real Google OAuth credentials are configured in this environment, expect either an error from Supabase (shown via `showAuthError`) or nothing visible (if `openExternal` succeeds in opening some URL) — either is acceptable at this stage; the actual end-to-end OAuth round trip needs live Google Cloud Console + Supabase dashboard configuration that only the user can set up, and is called out as outstanding in this plan's final testing section.

- [ ] **Step 3: Run the full test suite**

Run: `npm test` (or with the flags from Task 1 Step 4 if it hangs)

Expected: 87/87, unchanged.

- [ ] **Step 4: Commit**

```bash
git add renderer/auth.js
git commit -m "feat: add Google sign-in flow via Supabase OAuth"
```

---

### Task 4: Replace ensureAnonSession with getSession

**Files:**
- Modify: `renderer/rooms.js`
- Modify: `renderer/app.js`

**Interfaces:**
- Consumes: `getSession()` (Task 3).
- Produces: nothing consumed elsewhere — this is the final task.

- [ ] **Step 1: Remove the duplicate Supabase client and `ensureAnonSession` from `renderer/rooms.js`**

Current (`renderer/rooms.js`, lines 16-18):
```js
// ── Supabase client ─────────────────────────────

var supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
```

Replace with:
```js
// ── Supabase client ─────────────────────────────
// supabaseClient is created once in renderer/auth.js, which loads earlier.
```

Current (`renderer/rooms.js`, the "Auth bootstrap" section):
```js
// ── Auth bootstrap ──────────────────────────────

function ensureAnonSession() {
  return supabaseClient.auth.getSession().then(function (result) {
    if (result.data.session) return result.data.session
    return supabaseClient.auth.signInAnonymously().then(function (signInResult) {
      if (signInResult.error || !signInResult.data.session) {
        throw signInResult.error || new Error('No session returned')
      }
      return signInResult.data.session
    })
  })
}
```

Delete this section entirely (both the comment header and the function) — `getSession()` from `renderer/auth.js` replaces it.

- [ ] **Step 2: Update `renderer/rooms.js`'s two call sites**

Current (`renderer/rooms.js`, the `elBtnRoomCreate` handler):
```js
elBtnRoomCreate.addEventListener('click', function () {
  clearRoomError()
  ensureAnonSession().then(function (session) {
    return ensureRoomAccess(session.user.id).then(function (allowed) {
```

Replace with:
```js
elBtnRoomCreate.addEventListener('click', function () {
  clearRoomError()
  getSession().then(function (session) {
    return ensureRoomAccess(session.user.id).then(function (allowed) {
```

Current (`renderer/rooms.js`, the `elBtnRoomJoin` handler):
```js
elBtnRoomJoin.addEventListener('click', function () {
  clearRoomError()
  var code = elInputJoinCode.value.trim().toUpperCase()
  if (!code) return
  ensureAnonSession().then(function (session) {
    return ensureRoomAccess(session.user.id).then(function (allowed) {
```

Replace with:
```js
elBtnRoomJoin.addEventListener('click', function () {
  clearRoomError()
  var code = elInputJoinCode.value.trim().toUpperCase()
  if (!code) return
  getSession().then(function (session) {
    return ensureRoomAccess(session.user.id).then(function (allowed) {
```

Everything else in both handlers (the rest of the `.then()` chain, the `.catch()` at the end) is unchanged — only the first call in the chain changes from `ensureAnonSession()` to `getSession()`.

- [ ] **Step 3: Update `renderer/app.js`'s two call sites**

Current (`renderer/app.js`, the `elBtnSettings` handler):
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
  getSession().then(function (session) {
    var client = ensureConfigured(session.user.id)
    return client.isEntitledTo('pawmodoro_pro')
  }).then(function (entitled) {
    skinEntitled = entitled
    updateSkinOptions()
  }).catch(function () {})
})
```

Current (`renderer/app.js`, the skin-option click handler):
```js
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

Replace with:
```js
elSkinOptions.forEach(function (btn) {
  btn.addEventListener('click', function () {
    var skin = btn.getAttribute('data-skin')
    if (skin === state.skin) return
    if (skin === 'cat') {
      applySkin(skin)
      return
    }
    getSession().then(function (session) {
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

- [ ] **Step 4: Manual verification**

This is the task that makes the whole feature cohere end to end — verify as much of the full loop as this sandboxed environment allows: serve the repo locally, confirm the sign-in view still gates everything (no real session exists), and confirm no console errors reference `ensureAnonSession` anywhere (it no longer exists). A full live walkthrough — completing a real Google sign-in, confirming the app unlocks, creating a room, confirming `pawmodoro_pro` gating still works with the new session type — needs the user's own Google Cloud Console + Supabase dashboard configuration and is called out explicitly below.

- [ ] **Step 5: Run the full test suite**

Run: `npm test` (or with the flags from Task 1 Step 4 if it hangs)

Expected: 87/87, unchanged.

- [ ] **Step 6: Commit**

```bash
git add renderer/rooms.js renderer/app.js
git commit -m "refactor: replace ensureAnonSession with getSession now that login is mandatory"
```

---

## What the user must verify live (not achievable in this sandboxed environment, and larger in scope than any prior feature in this project)

1. Create a Google Cloud Console OAuth Client ID, add Supabase's fixed callback URL as its Authorized Redirect URI, enable the Google provider in Supabase's dashboard with those credentials, and add `pawmodoro://auth-callback` to Supabase's own Redirect URLs allowlist.
2. Launch the app fresh (or after `localStorage.clear()`) — confirm the sign-in view appears instead of the timer.
3. Click "Sign in with Google" — confirm the system browser opens to Google's real consent screen.
4. Complete it — confirm the app itself receives focus again and shows the normal timer, not the sign-in view. If this step fails, the most likely cause is `app.setAsDefaultProtocolClient` not registering reliably for an unpackaged `npm start` run — packaging the app (out of scope for this plan) may be required to resolve it.
5. Quit and relaunch — confirm the session persists and the sign-in view does not reappear.
6. Test "Sign Out" in Settings — confirm it returns to the sign-in view.
7. Create a room and confirm `pawmodoro_pro` gating (from the RevenueCat monetization feature) still works correctly with the new, real session's user ID.
