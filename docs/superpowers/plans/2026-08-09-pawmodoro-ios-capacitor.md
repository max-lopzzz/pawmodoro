# Pawmodoro iOS Support via Capacitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an iOS build of Pawmodoro via Capacitor, wrapping the existing `renderer/` web codebase, without changing macOS/Electron behavior.

**Architecture:** Two native shells sharing one web core. Electron keeps loading `renderer/index.html` directly, unchanged. A new sync script copies `renderer/` + `assets/` into a self-contained `www/` folder that Capacitor wraps for iOS via a generated `ios/` Xcode project. A small platform-abstraction file (`renderer/platform.js`) lets the shared renderer code call the same interface (`window.platformControls`) on both platforms, backed by Electron's existing IPC bridge on macOS and Capacitor's Browser plugin on iOS.

**Tech Stack:** Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/browser`), existing Electron/Jest toolchain — no bundler introduced.

## Global Constraints

- No behavioral change to the macOS/Electron build — `renderer/index.html` stays the file Electron loads, unmodified in its load path.
- `npm test` (existing Jest suite, currently 54 tests) must keep passing after every task.
- `.timer-logic.js`/`.todo-logic.js` business logic is not touched by this plan.
- The mobile CSS layout only activates below a 600px viewport width — desktop CSS must be visually unaffected.
- `www/` is a generated build artifact — git-ignored, never hand-edited.
- `ios/` (the generated Xcode project) is committed to git once created.
- This machine has Xcode Command Line Tools but not full Xcode — `xcodebuild` is unavailable. Any step requiring an actual iOS build/Simulator run is deferred to the user; tasks that only need Node/CocoaPods may proceed.
- App identity for Capacitor: `appId: "com.pawmodoro.app"`, `appName: "Pawmodoro"`.

---

### Task 1: Platform abstraction layer

**Files:**
- Create: `renderer/platform.js`
- Modify: `renderer/index.html:75-78` (add script tag)
- Modify: `renderer/app.js:314,318`
- Modify: `renderer/todo.js:32`

**Interfaces:**
- Produces: `window.platformControls` with methods `minimize()`, `close()`, `openExternal(url)` — same shape as the existing `window.windowControls` (defined in `preload.js`, untouched by this task). Later tasks (the Capacitor iOS project) rely on `window.Capacitor.Plugins.Browser.open({ url })` being available at runtime once the `@capacitor/browser` plugin is installed (Task 4) — this task references that global defensively (see Step 1) so it does not crash on Electron, where `window.Capacitor` is undefined.

- [ ] **Step 1: Create `renderer/platform.js`**

```js
window.platformControls = window.Capacitor
  ? {
      minimize: function () {},
      close: function () {},
      openExternal: function (url) {
        window.Capacitor.Plugins.Browser.open({ url: url })
      }
    }
  : window.windowControls
```

- [ ] **Step 2: Load `platform.js` before the scripts that use it**

In `renderer/index.html`, change lines 75-78 from:

```html
  <script src="timer-logic.js"></script>
  <script src="todo-logic.js"></script>
  <script src="app.js"></script>
  <script src="todo.js"></script>
```

to:

```html
  <script src="timer-logic.js"></script>
  <script src="todo-logic.js"></script>
  <script src="platform.js"></script>
  <script src="app.js"></script>
  <script src="todo.js"></script>
```

- [ ] **Step 3: Swap the two `windowControls` calls in `app.js`**

In `renderer/app.js`, change (around line 314):

```js
elBtnMinimize.addEventListener('click', function () {
  window.windowControls.minimize()
})

elBtnClose.addEventListener('click', function () {
  window.windowControls.close()
})
```

to:

```js
elBtnMinimize.addEventListener('click', function () {
  window.platformControls.minimize()
})

elBtnClose.addEventListener('click', function () {
  window.platformControls.close()
})
```

- [ ] **Step 4: Swap the `windowControls` call in `todo.js`**

In `renderer/todo.js`, change line 32 from:

```js
  wrap.addEventListener('click', function () { window.windowControls.openExternal(url) })
```

to:

```js
  wrap.addEventListener('click', function () { window.platformControls.openExternal(url) })
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS, 54/54, unchanged (this task touches no logic covered by existing tests — `timer-logic.js`/`todo-logic.js` are untouched).

- [ ] **Step 6: Verify no remaining `windowControls` references in renderer code**

Run: `grep -rn windowControls renderer/`
Expected: only `renderer/platform.js`'s own `: window.windowControls` fallback line. No matches in `app.js` or `todo.js`.

- [ ] **Step 7: Manual Electron smoke check**

Run: `npm start`, confirm the app window opens, the minimize/close titlebar buttons still work, and a task URL link still opens externally. Quit the app afterward.

- [ ] **Step 8: Commit**

```bash
git add renderer/platform.js renderer/index.html renderer/app.js renderer/todo.js
git commit -m "feat: add platform abstraction for Electron/Capacitor window controls"
```

---

### Task 2: Mobile layout CSS

**Files:**
- Modify: `renderer/style.css` (append to end of file)

**Interfaces:**
- Consumes: existing class names `.titlebar`, `.app-body`, `.timer-section`, `.todo-panel` (all defined earlier in the same file, untouched by this task).
- Produces: nothing consumed by later tasks — this is a leaf CSS change.

- [ ] **Step 1: Append the mobile breakpoint to `renderer/style.css`**

Add this block at the end of the file (after the current last rule, `body.dark .overlay-celebration { ... }`):

```css

/* ── Mobile layout (iOS) ──────────────────────── */

@media (max-width: 600px) {
  .titlebar { display: none; }
  .app-body { flex-direction: column; padding-top: env(safe-area-inset-top); }
  .timer-section { width: 100%; }
  .todo-panel { min-width: 0; border-left: none; border-top: 2px solid var(--black); }
}
```

- [ ] **Step 2: Verify the desktop layout is untouched**

Run: `grep -n "max-width: 600px" renderer/style.css`
Expected: exactly one match, the new media query — confirms it was added once, additively.

Run: `npm test`
Expected: PASS, 54/54, unchanged (CSS is not covered by the Jest suite).

- [ ] **Step 3: Manual Electron smoke check**

Run: `npm start`, confirm the desktop window still shows the titlebar and the two-column layout (timer fixed-width, todo panel to its right) exactly as before — the new media query should not activate at the desktop window's width (740px minimum). Quit the app afterward.

- [ ] **Step 4: Commit**

```bash
git add renderer/style.css
git commit -m "feat: add mobile layout breakpoint for iOS"
```

---

### Task 3: Web asset sync script for Capacitor

**Files:**
- Create: `scripts/sync-ios-www.js`
- Test: `tests/sync-ios-www.test.js`

**Interfaces:**
- Produces: `syncIosWww({ rendererDir, assetsDir, outDir })`, exported from `scripts/sync-ios-www.js` via `module.exports = { syncIosWww }`. Copies all files directly inside `rendererDir` into `outDir`, copies `assetsDir` into `outDir/assets`, and rewrites every occurrence of `../assets/` to `assets/` inside the copied `outDir/index.html`. Later tasks (Task 4's `sync:ios` npm script) invoke this file's CLI entry point (`node scripts/sync-ios-www.js`, using `require.main === module`) with the real repo paths (`renderer/`, `assets/`, `www/`).

- [ ] **Step 1: Write the failing test**

Create `tests/sync-ios-www.test.js`:

```js
const fs = require('fs')
const os = require('os')
const path = require('path')
const { syncIosWww } = require('../scripts/sync-ios-www')

describe('syncIosWww', () => {
  let tmpDir, rendererDir, assetsDir, outDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-ios-www-'))
    rendererDir = path.join(tmpDir, 'renderer')
    assetsDir = path.join(tmpDir, 'assets')
    outDir = path.join(tmpDir, 'www')

    fs.mkdirSync(rendererDir, { recursive: true })
    fs.mkdirSync(assetsDir, { recursive: true })

    fs.writeFileSync(
      path.join(rendererDir, 'index.html'),
      '<img src="../assets/cat.gif"><script src="app.js"></script>'
    )
    fs.writeFileSync(path.join(rendererDir, 'app.js'), 'console.log("app")')
    fs.writeFileSync(path.join(rendererDir, 'style.css'), 'body { color: red; }')

    fs.writeFileSync(path.join(assetsDir, 'cat.gif'), 'fake-gif-bytes')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('copies renderer files into outDir', () => {
    syncIosWww({ rendererDir, assetsDir, outDir })

    expect(fs.readFileSync(path.join(outDir, 'app.js'), 'utf8')).toBe('console.log("app")')
    expect(fs.readFileSync(path.join(outDir, 'style.css'), 'utf8')).toBe('body { color: red; }')
  })

  test('copies assetsDir into outDir/assets', () => {
    syncIosWww({ rendererDir, assetsDir, outDir })

    expect(fs.readFileSync(path.join(outDir, 'assets', 'cat.gif'), 'utf8')).toBe('fake-gif-bytes')
  })

  test('rewrites ../assets/ to assets/ in the copied index.html', () => {
    syncIosWww({ rendererDir, assetsDir, outDir })

    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8')
    expect(html).toContain('src="assets/cat.gif"')
    expect(html).not.toContain('../assets/')
  })

  test('does not modify the source renderer/index.html', () => {
    syncIosWww({ rendererDir, assetsDir, outDir })

    const sourceHtml = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8')
    expect(sourceHtml).toContain('../assets/cat.gif')
  })

  test('clears a previous outDir before re-syncing', () => {
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'stale-file.txt'), 'old build output')

    syncIosWww({ rendererDir, assetsDir, outDir })

    expect(fs.existsSync(path.join(outDir, 'stale-file.txt'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/sync-ios-www.test.js`
Expected: FAIL — `Cannot find module '../scripts/sync-ios-www'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `scripts/sync-ios-www.js`:

```js
const fs = require('fs')
const path = require('path')

function syncIosWww({ rendererDir, assetsDir, outDir }) {
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  for (const entry of fs.readdirSync(rendererDir)) {
    const srcPath = path.join(rendererDir, entry)
    if (fs.statSync(srcPath).isFile()) {
      fs.copyFileSync(srcPath, path.join(outDir, entry))
    }
  }

  const indexPath = path.join(outDir, 'index.html')
  const html = fs.readFileSync(indexPath, 'utf8')
  fs.writeFileSync(indexPath, html.split('../assets/').join('assets/'))

  fs.cpSync(assetsDir, path.join(outDir, 'assets'), { recursive: true })
}

module.exports = { syncIosWww }

if (require.main === module) {
  syncIosWww({
    rendererDir: path.join(__dirname, '..', 'renderer'),
    assetsDir: path.join(__dirname, '..', 'assets'),
    outDir: path.join(__dirname, '..', 'www')
  })
  console.log('Synced renderer/ + assets/ into www/ for Capacitor')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/sync-ios-www.test.js`
Expected: PASS, 5/5 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 59/59 (54 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
git add scripts/sync-ios-www.js tests/sync-ios-www.test.js
git commit -m "feat: add renderer-to-www sync script for Capacitor iOS build"
```

---

### Task 4: Capacitor project configuration

**Files:**
- Modify: `package.json`
- Create: `capacitor.config.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `scripts/sync-ios-www.js`'s CLI entry point from Task 3 (invoked via the new `sync:ios` npm script).
- Produces: `capacitor.config.json` with `webDir: "www"` — Task 5's `npx cap add ios` and `npx cap sync ios` read this file to know where the web assets live and what native project to generate/update.

- [ ] **Step 1: Install Capacitor dependencies**

Run:
```bash
npm install --save @capacitor/core @capacitor/ios @capacitor/browser
npm install --save-dev @capacitor/cli
```
Expected: install succeeds, `package.json` gains these under `dependencies`/`devDependencies`.

- [ ] **Step 2: Add npm scripts**

In `package.json`, change the `"scripts"` block from:

```json
  "scripts": {
    "start": "electron .",
    "test": "jest"
  },
```

to:

```json
  "scripts": {
    "start": "electron .",
    "test": "jest",
    "sync:ios": "node scripts/sync-ios-www.js && npx cap sync ios",
    "open:ios": "npx cap open ios"
  },
```

(Leave the dependency versions that `npm install` wrote in Step 1 as-is — don't hand-edit them.)

- [ ] **Step 3: Create `capacitor.config.json`**

```json
{
  "appId": "com.pawmodoro.app",
  "appName": "Pawmodoro",
  "webDir": "www"
}
```

- [ ] **Step 4: Add `www/` to `.gitignore`**

In `.gitignore`, change:

```
node_modules/
coverage/
.DS_Store
dist/
```

to:

```
node_modules/
coverage/
.DS_Store
dist/
www/
```

- [ ] **Step 5: Verify config is valid JSON and scripts are wired**

Run: `node -e "console.log(require('./capacitor.config.json'))"`
Expected: prints the object, no parse errors.

Run: `npm run sync:ios`
Expected: `scripts/sync-ios-www.js` runs and creates `www/` with the synced files (confirm with `ls www/`), then `npx cap sync ios` runs. If `npx cap sync ios` reports there is no iOS platform yet (e.g. "iOS project does not exist"), that's expected — Task 5 creates it. Note the exact output in your report either way.

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: PASS, 59/59, unchanged (this task adds config and scripts, no logic changes).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json capacitor.config.json .gitignore
git commit -m "feat: add Capacitor project configuration"
```

---

### Task 5: Generate the iOS native project

**Files:**
- Create: `ios/` (generated by `npx cap add ios`)

**Interfaces:**
- Consumes: `capacitor.config.json` (Task 4) for `appId`/`appName`/`webDir`; `www/` (produced by `npm run sync:ios`, Task 4's script) as the web asset source `npx cap add ios` copies into the native project.

- [ ] **Step 1: Ensure `www/` exists and is current**

Run: `npm run sync:ios`
Expected: same as Task 4 Step 5 — `www/` is (re)created from the current `renderer/` + `assets/`, now including `platform.js` (Task 1) and the mobile CSS (Task 2).

- [ ] **Step 2: Generate the iOS platform**

Run: `npx cap add ios`
Expected: one of two outcomes —
  - **Success:** creates `ios/App/` (an Xcode project) and reports something like "add ios ... in X.XXs". This may include running `pod install` via CocoaPods (already installed on this machine at v1.16.2), which does not require full Xcode.
  - **Failure specifically citing missing Xcode.app / xcodebuild:** this is the expected environment limitation documented in the plan's Global Constraints (only Xcode Command Line Tools are installed here, not full Xcode). If this happens, do not attempt to work around it — record the exact error in your report and stop this task with status DONE_WITH_CONCERNS, noting that `ios/` generation is blocked pending the user installing full Xcode.

- [ ] **Step 3: If Step 2 succeeded, sync and verify the project structure**

Run: `npx cap sync ios`
Expected: reports copying `www/` into the iOS project and updating native dependencies, no errors.

Run: `ls ios/App`
Expected: an Xcode project structure (e.g. `App.xcodeproj` or `App.xcworkspace`, a `App/` source folder, `Podfile`).

- [ ] **Step 4: Run the test suite**

Run: `npm test`
Expected: PASS, 59/59, unchanged — this task only generates native project files, no JS logic changes.

- [ ] **Step 5: Commit whatever was produced**

If Step 2 succeeded and `ios/` exists:
```bash
git add ios/ package-lock.json
git commit -m "feat: generate iOS native project via Capacitor"
```

If Step 2 failed due to missing Xcode (no `ios/` directory was created), skip this commit — there is nothing new to commit, and this task ends with status DONE_WITH_CONCERNS per Step 2's guidance. In your report, include the exact commands the user should run once Xcode is installed, in order:
```bash
npm run sync:ios
npx cap add ios
npx cap sync ios
npm run open:ios
```
followed by building/running the "App" target on an iPhone Simulator from within Xcode, and confirming: the app launches, the mobile layout (no titlebar, stacked timer/todo panel) renders correctly, and tapping a task's URL link opens it via the system browser.
