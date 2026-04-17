# Kawaii Cat Pomodoro Timer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frameless Electron desktop pomodoro timer with kawaii cat GIFs, MorningBreeze fonts, and a custom color palette.

**Architecture:** Electron main process creates a frameless BrowserWindow and handles IPC for window controls. The renderer is plain HTML/CSS/JS with no bundler — a pure-logic module (`timer-logic.js`) is loaded as a global script and tested with Jest, while `app.js` wires state to the DOM.

**Tech Stack:** Electron 30, vanilla JS (ES5-compatible), Jest 29 (unit tests for pure logic only), Web Audio API (chime), localStorage (settings persistence).

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Electron + Jest config, npm scripts |
| `main.js` | BrowserWindow creation, IPC handlers (close/minimize) |
| `preload.js` | `contextBridge` — exposes `windowControls.close/minimize` only |
| `renderer/index.html` | Full app markup |
| `renderer/style.css` | `@font-face`, CSS vars, all component styles |
| `renderer/timer-logic.js` | Pure functions: `formatTime`, `getNextSession`, `getAmbientGif`, `pickCelebrationGif`, `getAccentColor` + GIF constant maps |
| `renderer/app.js` | State object, render loop, event listeners, chime, celebration overlay |
| `tests/timer-logic.test.js` | Jest unit tests for `timer-logic.js` |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "kawaii-pomodoro",
  "version": "1.0.0",
  "description": "Kawaii cat pomodoro timer",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "jest"
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "jest": "^29.0.0"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/hanniamabellopezmontano/Desktop/pomodoro
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: scaffold electron + jest project"
```

---

## Task 2: Main Process & Preload

**Files:**
- Create: `main.js`
- Create: `preload.js`

- [ ] **Step 1: Create `preload.js`**

```javascript
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('windowControls', {
  close: () => ipcRenderer.send('window-close'),
  minimize: () => ipcRenderer.send('window-minimize')
})
```

- [ ] **Step 2: Create `main.js`**

```javascript
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

let win

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 580,
    resizable: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadFile('renderer/index.html')
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.on('window-close', () => win.close())
ipcMain.on('window-minimize', () => win.minimize())
```

- [ ] **Step 3: Create `renderer/index.html` (stub so `npm start` works)**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Pomodoro</title></head>
<body><p>Loading...</p></body>
</html>
```

- [ ] **Step 4: Run `npm start` and verify a frameless window opens**

```bash
npm start
```

Expected: A small window appears with "Loading..." and no native title bar. Quit with Cmd+Q.

- [ ] **Step 5: Commit**

```bash
git add main.js preload.js renderer/index.html
git commit -m "feat: electron main process and preload IPC bridge"
```

---

## Task 3: Pure Logic Module (with Tests)

**Files:**
- Create: `renderer/timer-logic.js`
- Create: `tests/timer-logic.test.js`

- [ ] **Step 1: Create `tests/timer-logic.test.js` (failing)**

```javascript
const {
  formatTime,
  getNextSession,
  getAmbientGif,
  pickCelebrationGif,
  getAccentColor,
  CELEBRATION_GIFS
} = require('../renderer/timer-logic')

const defaultConfig = {
  work: 25,
  shortBreak: 5,
  longBreak: 30,
  sessionsBeforeLongBreak: 4
}

describe('formatTime', () => {
  test('formats full minutes', () => {
    expect(formatTime(1500)).toBe('25:00')
  })
  test('formats with leading zero on seconds', () => {
    expect(formatTime(65)).toBe('01:05')
  })
  test('formats zero', () => {
    expect(formatTime(0)).toBe('00:00')
  })
})

describe('getNextSession', () => {
  test('after work session goes to short break (not last in cycle)', () => {
    const next = getNextSession('work', 1, defaultConfig)
    expect(next).toEqual({ type: 'short-break', duration: 5 * 60 })
  })
  test('after work session goes to long break (last in cycle)', () => {
    const next = getNextSession('work', 4, defaultConfig)
    expect(next).toEqual({ type: 'long-break', duration: 30 * 60 })
  })
  test('after short break goes to work', () => {
    const next = getNextSession('short-break', 1, defaultConfig)
    expect(next).toEqual({ type: 'work', duration: 25 * 60 })
  })
  test('after long break goes to work', () => {
    const next = getNextSession('long-break', 4, defaultConfig)
    expect(next).toEqual({ type: 'work', duration: 25 * 60 })
  })
})

describe('getAmbientGif', () => {
  test('returns idle gif when timerState is idle', () => {
    expect(getAmbientGif('work', 'idle')).toBe('Wake Up Art Sticker.gif')
  })
  test('returns idle gif when timerState is complete', () => {
    expect(getAmbientGif('work', 'complete')).toBe('Wake Up Art Sticker.gif')
  })
  test('returns running gif for work+running', () => {
    expect(getAmbientGif('work', 'running')).toBe('Running.gif')
  })
  test('returns confused gif for work+paused', () => {
    expect(getAmbientGif('work', 'paused')).toBe('Confused Wait What Sticker.gif')
  })
  test('returns lick gif for short-break', () => {
    expect(getAmbientGif('short-break', 'running')).toBe('Cat Lick Sticker.gif')
  })
  test('returns camping gif for long-break', () => {
    expect(getAmbientGif('long-break', 'running')).toBe('Cat Camping Sticker.gif')
  })
})

describe('pickCelebrationGif', () => {
  test('returns a string from CELEBRATION_GIFS', () => {
    const gif = pickCelebrationGif()
    expect(CELEBRATION_GIFS).toContain(gif)
  })
})

describe('getAccentColor', () => {
  test('work returns olive', () => {
    expect(getAccentColor('work')).toBe('#738122')
  })
  test('short-break returns blue', () => {
    expect(getAccentColor('short-break')).toBe('#4A5CD0')
  })
  test('long-break returns red', () => {
    expect(getAccentColor('long-break')).toBe('#C62A33')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: Error — `Cannot find module '../renderer/timer-logic'`.

- [ ] **Step 3: Create `renderer/timer-logic.js`**

```javascript
var AMBIENT_GIFS = {
  idle: 'Wake Up Art Sticker.gif',
  'work-running': 'Running.gif',
  'work-paused': 'Confused Wait What Sticker.gif',
  'short-break': 'Cat Lick Sticker.gif',
  'long-break': 'Cat Camping Sticker.gif'
}

var CELEBRATION_GIFS = [
  'Cat Hooray Sticker.gif',
  'Cat Party Sticker.gif',
  'Happy Dance Sticker.gif',
  'Standing Ovation Applause Sticker.gif',
  'Cat Clap Sticker.gif',
  'Table Clap.gif',
  'Cat Wow Sticker.gif'
]

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

function getAccentColor(sessionType) {
  if (sessionType === 'work') return '#738122'
  if (sessionType === 'short-break') return '#4A5CD0'
  return '#C62A33'
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatTime,
    getNextSession,
    getAmbientGif,
    pickCelebrationGif,
    getAccentColor,
    AMBIENT_GIFS,
    CELEBRATION_GIFS
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected: All 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add renderer/timer-logic.js tests/timer-logic.test.js
git commit -m "feat: pure timer logic module with full test coverage"
```

---

## Task 4: HTML Structure

**Files:**
- Modify: `renderer/index.html`

- [ ] **Step 1: Replace stub with full markup**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pomodoro</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <div class="titlebar">
    <div class="titlebar-drag"></div>
    <div class="titlebar-controls">
      <button class="btn-minimize" id="btn-minimize">&#8212;</button>
      <button class="btn-close" id="btn-close">&#215;</button>
    </div>
  </div>

  <main class="main">
    <div class="cat-container">
      <img class="cat-gif" id="cat-ambient" alt="cat" src="../assets/Wake Up Art Sticker.gif">
    </div>
    <div class="session-label" id="session-label">Focus</div>
    <div class="timer-display" id="timer-display">25:00</div>
    <div class="session-dots" id="session-dots"></div>
    <div class="controls">
      <button class="btn-start" id="btn-start">Start</button>
      <button class="btn-reset" id="btn-reset">Reset</button>
    </div>
  </main>

  <button class="btn-settings" id="btn-settings">&#9881;</button>

  <div class="overlay-celebration" id="overlay-celebration">
    <img class="cat-celebration" id="cat-celebration" alt="celebration cat" src="">
  </div>

  <div class="settings-panel" id="settings-panel">
    <div class="settings-header">
      <span class="settings-title">Settings</span>
      <button class="btn-settings-close" id="btn-settings-close">&#215;</button>
    </div>
    <div class="settings-body">
      <label>Work (min)<input type="number" id="input-work" min="1" max="120" value="25"></label>
      <label>Short break (min)<input type="number" id="input-short-break" min="1" max="60" value="5"></label>
      <label>Long break (min)<input type="number" id="input-long-break" min="1" max="120" value="30"></label>
      <label>Sessions before long break<input type="number" id="input-sessions" min="1" max="10" value="4"></label>
    </div>
    <button class="btn-save" id="btn-save">Save</button>
  </div>

  <script src="timer-logic.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add renderer/index.html
git commit -m "feat: full HTML markup structure"
```

---

## Task 5: CSS — Fonts, Variables, Layout, Titlebar

**Files:**
- Create: `renderer/style.css`

- [ ] **Step 1: Create `renderer/style.css`**

```css
@font-face {
  font-family: 'MorningBreeze';
  src: url('../MorningBreeze.otf') format('opentype');
  font-weight: 400;
  font-style: normal;
}

@font-face {
  font-family: 'MorningBreeze';
  src: url('../MorningBreeze-Bold.otf') format('opentype');
  font-weight: 700;
  font-style: normal;
}

@font-face {
  font-family: 'MorningBreeze';
  src: url('../MorningBreeze-Light.otf') format('opentype');
  font-weight: 300;
  font-style: normal;
}

@font-face {
  font-family: 'MorningBreeze';
  src: url('../MorningBreeze-Italic.otf') format('opentype');
  font-weight: 400;
  font-style: italic;
}

:root {
  --white: #FFFFFF;
  --black: #000000;
  --olive: #738122;
  --blue: #4A5CD0;
  --red: #C62A33;
  --accent: #738122;
}

*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 420px;
  height: 580px;
  overflow: hidden;
  background: var(--white);
  color: var(--black);
  font-family: 'MorningBreeze', sans-serif;
  font-weight: 400;
  user-select: none;
  -webkit-user-select: none;
}

/* ── Titlebar ─────────────────────────────────── */

.titlebar {
  height: 36px;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
}

.titlebar-drag {
  flex: 1;
}

.titlebar-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 12px;
  -webkit-app-region: no-drag;
}

.btn-minimize,
.btn-close {
  width: 28px;
  height: 28px;
  border: 2px solid var(--black);
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  font-family: 'MorningBreeze', sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  line-height: 1;
}

.btn-minimize:hover {
  background: var(--black);
  color: var(--white);
}

.btn-close:hover {
  background: var(--red);
  color: var(--white);
  border-color: var(--red);
}

/* ── Main layout ──────────────────────────────── */

.main {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 24px 16px;
  gap: 10px;
}

/* ── Ambient cat ──────────────────────────────── */

.cat-container {
  width: 180px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cat-gif {
  max-width: 180px;
  max-height: 180px;
  object-fit: contain;
}

/* ── Session label ────────────────────────────── */

.session-label {
  font-weight: 300;
  font-size: 13px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent);
  transition: color 0.3s;
}

/* ── Timer display ────────────────────────────── */

.timer-display {
  font-weight: 700;
  font-size: 72px;
  line-height: 1;
  letter-spacing: -2px;
  color: var(--black);
}

/* ── Session dots ─────────────────────────────── */

.session-dots {
  display: flex;
  gap: 10px;
  min-height: 16px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  background: transparent;
  transition: background 0.2s, border-color 0.3s;
  display: inline-block;
}

.dot.filled {
  background: var(--accent);
}

/* ── Controls ─────────────────────────────────── */

.controls {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.btn-start {
  padding: 10px 36px;
  background: var(--accent);
  color: var(--white);
  border: none;
  font-family: 'MorningBreeze', sans-serif;
  font-size: 18px;
  font-weight: 400;
  cursor: pointer;
  border-radius: 6px;
  transition: opacity 0.15s, background 0.3s;
}

.btn-start:hover {
  opacity: 0.85;
}

.btn-reset {
  padding: 10px 20px;
  background: transparent;
  color: var(--red);
  border: 2px solid var(--red);
  font-family: 'MorningBreeze', sans-serif;
  font-size: 18px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}

.btn-reset:hover {
  background: var(--red);
  color: var(--white);
}

/* ── Settings gear ────────────────────────────── */

.btn-settings {
  position: fixed;
  bottom: 14px;
  right: 14px;
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  opacity: 0.4;
  transition: opacity 0.15s;
  -webkit-app-region: no-drag;
}

.btn-settings:hover {
  opacity: 1;
}

/* ── Celebration overlay ──────────────────────── */

.overlay-celebration {
  position: fixed;
  inset: 0;
  background: rgba(255, 255, 255, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

.overlay-celebration.visible {
  opacity: 1;
  pointer-events: all;
}

.cat-celebration {
  max-width: 280px;
  max-height: 280px;
  object-fit: contain;
}

/* ── Settings panel ───────────────────────────── */

.settings-panel {
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

.settings-panel.visible {
  transform: translateY(0);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.settings-title {
  font-size: 18px;
  font-weight: 700;
}

.btn-settings-close {
  background: transparent;
  border: none;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
  font-family: 'MorningBreeze', sans-serif;
}

.settings-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}

.settings-body label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  font-weight: 300;
}

.settings-body input[type='number'] {
  width: 64px;
  padding: 4px 8px;
  border: 2px solid var(--black);
  font-family: 'MorningBreeze', sans-serif;
  font-size: 15px;
  text-align: center;
  background: var(--white);
  border-radius: 2px;
  -webkit-appearance: none;
  appearance: none;
}

.btn-save {
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

.btn-save:hover {
  opacity: 0.8;
}
```

- [ ] **Step 2: Run `npm start`, confirm the window renders with correct fonts and layout (no timer logic yet)**

```bash
npm start
```

Expected: Window shows titlebar buttons, "Loading..." is replaced by the styled layout with the cat GIF, "Focus" label, "25:00" text, and buttons.

- [ ] **Step 3: Commit**

```bash
git add renderer/style.css
git commit -m "feat: full CSS with fonts, color palette, and all component styles"
```

---

## Task 6: App State, Timer, and Render Loop

**Files:**
- Create: `renderer/app.js`

- [ ] **Step 1: Create `renderer/app.js`**

```javascript
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

// ── State ──────────────────────────────────────

var config = loadConfig()

var state = {
  timerState: 'idle',       // idle | running | paused | complete
  sessionType: 'work',      // work | short-break | long-break
  secondsLeft: config.work * 60,
  completedWork: 0,
  interval: null
}

// ── DOM refs ───────────────────────────────────

var elTimer        = document.getElementById('timer-display')
var elLabel        = document.getElementById('session-label')
var elCatAmbient   = document.getElementById('cat-ambient')
var elDots         = document.getElementById('session-dots')
var elBtnStart     = document.getElementById('btn-start')
var elBtnReset     = document.getElementById('btn-reset')
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

// ── Render ─────────────────────────────────────

function render() {
  // Timer text
  elTimer.textContent = formatTime(state.secondsLeft)

  // Session label
  var labels = { work: 'Focus', 'short-break': 'Short Break', 'long-break': 'Long Break' }
  elLabel.textContent = labels[state.sessionType]

  // Accent color
  var accent = getAccentColor(state.sessionType)
  document.documentElement.style.setProperty('--accent', accent)
  elBtnStart.style.background = accent

  // Start/Pause button label
  elBtnStart.textContent = state.timerState === 'running' ? 'Pause' : 'Start'

  // Ambient cat GIF
  var gifFile = getAmbientGif(state.sessionType, state.timerState)
  var newSrc = '../assets/' + gifFile
  if (elCatAmbient.getAttribute('src') !== newSrc) {
    elCatAmbient.src = newSrc
  }

  // Session dots
  var n = config.sessionsBeforeLongBreak
  var completed = state.completedWork % n
  elDots.innerHTML = ''
  for (var i = 0; i < n; i++) {
    var dot = document.createElement('span')
    dot.className = 'dot' + (i < completed ? ' filled' : '')
    elDots.appendChild(dot)
  }
}

// ── Chime ──────────────────────────────────────

function playChime() {
  try {
    var ctx = new AudioContext()
    function playNote(freq, startTime, duration) {
      var osc = ctx.createOscillator()
      var gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }
    playNote(880, ctx.currentTime, 0.5)
    playNote(660, ctx.currentTime + 0.25, 0.6)
  } catch (e) {
    // AudioContext unavailable — silently skip
  }
}

// ── Session complete ───────────────────────────

function onSessionComplete() {
  clearInterval(state.interval)
  state.interval = null
  state.timerState = 'complete'

  if (state.sessionType === 'work') {
    state.completedWork += 1
  }

  playChime()
  showCelebration()
}

function showCelebration() {
  var gif = pickCelebrationGif()
  elCatCelebr.src = '../assets/' + gif
  elOverlay.classList.add('visible')

  var timeout = setTimeout(hideCelebration, 3500)

  function hideCelebration() {
    clearTimeout(timeout)
    elOverlay.classList.remove('visible')
    elOverlay.removeEventListener('click', hideCelebration)
    advanceSession()
  }

  elOverlay.addEventListener('click', hideCelebration, { once: true })
}

function advanceSession() {
  var next = getNextSession(state.sessionType, state.completedWork, config)
  state.sessionType = next.type
  state.secondsLeft = next.duration
  state.timerState = 'idle'
  render()
}

// ── Timer tick ─────────────────────────────────

function tick() {
  if (state.secondsLeft <= 0) {
    onSessionComplete()
    render()
    return
  }
  state.secondsLeft -= 1
  render()
}

// ── Controls ───────────────────────────────────

elBtnStart.addEventListener('click', function () {
  if (state.timerState === 'running') {
    clearInterval(state.interval)
    state.interval = null
    state.timerState = 'paused'
  } else {
    state.timerState = 'running'
    state.interval = setInterval(tick, 1000)
  }
  render()
})

elBtnReset.addEventListener('click', function () {
  clearInterval(state.interval)
  state.interval = null
  state.timerState = 'idle'
  state.secondsLeft = config[state.sessionType === 'work' ? 'work'
    : state.sessionType === 'short-break' ? 'shortBreak' : 'longBreak'] * 60
  render()
})

// ── Settings ───────────────────────────────────

elBtnSettings.addEventListener('click', function () {
  elInputWork.value = config.work
  elInputShort.value = config.shortBreak
  elInputLong.value = config.longBreak
  elInputSessions.value = config.sessionsBeforeLongBreak
  elSettingsPanel.classList.add('visible')
})

elBtnSetClose.addEventListener('click', function () {
  elSettingsPanel.classList.remove('visible')
})

elBtnSave.addEventListener('click', function () {
  var newWork = Math.max(1, parseInt(elInputWork.value, 10) || 25)
  var newShort = Math.max(1, parseInt(elInputShort.value, 10) || 5)
  var newLong = Math.max(1, parseInt(elInputLong.value, 10) || 30)
  var newSessions = Math.max(1, parseInt(elInputSessions.value, 10) || 4)

  config = { work: newWork, shortBreak: newShort, longBreak: newLong, sessionsBeforeLongBreak: newSessions }
  saveConfig(config)

  // Reset timer to idle with new config
  clearInterval(state.interval)
  state.interval = null
  state.timerState = 'idle'
  state.sessionType = 'work'
  state.secondsLeft = config.work * 60
  state.completedWork = 0

  elSettingsPanel.classList.remove('visible')
  render()
})

// ── Window controls ────────────────────────────

elBtnMinimize.addEventListener('click', function () {
  window.windowControls.minimize()
})

elBtnClose.addEventListener('click', function () {
  window.windowControls.close()
})

// ── Init ───────────────────────────────────────

render()
```

- [ ] **Step 2: Run `npm start` and verify full app behavior**

```bash
npm start
```

Verify:
- Timer displays `25:00`, label says "Focus", cat shows `Wake Up Art Sticker.gif`
- Clicking **Start** begins countdown, cat switches to `Running.gif`
- Clicking **Pause** freezes timer, cat switches to `Confused Wait What Sticker.gif`
- Clicking **Reset** restores full duration
- Clicking **⚙** opens settings panel from bottom
- Changing durations and clicking **Save** resets the timer with new values and persists after quit/restart
- Clicking **—** minimizes the window
- Clicking **×** closes the app

- [ ] **Step 3: Let a short test session run to zero (edit work duration to 1 min in settings to test quickly)**

Verify:
- Chime plays
- Celebration overlay appears with a cat GIF
- Overlay auto-dismisses after ~3.5 seconds (or click to dismiss)
- Timer advances to next session in idle state with correct duration and accent color

- [ ] **Step 4: Run tests to confirm logic still passes**

```bash
npm test
```

Expected: All 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add renderer/app.js
git commit -m "feat: full app wiring — timer, GIFs, chime, settings, window controls"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Task |
|---|---|
| Electron frameless window 420×580 | Task 2 |
| Custom titlebar + close/minimize IPC | Task 2, Task 6 |
| MorningBreeze fonts (all 4 variants) | Task 5 |
| Color palette applied correctly | Task 5 |
| Custom default durations (25/5/30/4) | Task 3, Task 6 |
| Configurable durations via settings panel | Task 6 |
| Settings persisted in localStorage | Task 6 |
| Settings panel slides up from bottom | Task 5 |
| Ambient cat GIF changes per state | Task 3, Task 6 |
| Celebration overlay on session complete | Task 6 |
| Celebration GIF randomly selected | Task 3 (logic), Task 6 (UI) |
| Overlay auto-dismisses in 3.5s or on click | Task 6 |
| After overlay: next session in idle state | Task 6 |
| Chime via Web Audio API on complete | Task 6 |
| Session dots show cycle progress | Task 6 |
| Dots re-render when sessionsBeforeLongBreak changes | Task 6 |

All spec requirements are covered.
