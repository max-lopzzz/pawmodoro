# Todo List + Dark Mode + DMG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a linked to-do panel with subtasks and % completion, dark mode (system-aware + manual toggle), and a macOS .dmg build.

**Architecture:** Three independent features sequenced for clean layering. Todo list (Tasks 1–6) adds the panel and task data model. Dark mode (Tasks 7–8) adds CSS variable overrides and a settings toggle. DMG packaging (Task 9) adds electron-builder config. IPC resize wiring is already complete in `main.js` and `preload.js`.

**Tech Stack:** Electron, vanilla JS (ES5 `var`), localStorage, CSS custom properties, Jest 29, electron-builder.

**Prerequisite:** IPC window-resize is already wired (`main.js` line 33, `preload.js` line 6). Do not redo it.

---

## File Structure

| File | Change | Responsibility |
|------|--------|---------------|
| `renderer/todo-logic.js` | Create | Pure functions: task CRUD, completion %, time formatting |
| `tests/todo-logic.test.js` | Create | Jest unit tests for all todo-logic functions |
| `renderer/index.html` | Modify | Todo panel markup, active-task-label, dark mode select, script load order |
| `renderer/style.css` | Modify | App-body flex, todo panel layout, dark mode CSS vars + overrides |
| `renderer/app.js` | Modify | loadTasks/saveTasks, state.activeTaskId, render() dark-aware accent, initTheme(), settings wiring |
| `renderer/timer-logic.js` | Modify | Add getDarkAccentColor() |
| `renderer/todo.js` | Create | DOM wiring: render panel, task elements, inline edits, panel open/close |
| `package.json` | Modify | Add electron-builder devDep, build config, dist script |

---

### Task 1: todo-logic.js (TDD)

**Files:**
- Create: `tests/todo-logic.test.js`
- Create: `renderer/todo-logic.js`

- [ ] **Step 1: Create the test file**

Create `tests/todo-logic.test.js`:

```javascript
var {
  createTask,
  checkTask,
  getLeafCount,
  getCheckedLeafCount,
  getCompletionPercent,
  getOverallPercent,
  addMinutes,
  addTask,
  deleteTask,
  findTask,
  parseTimeInput,
  formatLoggedTime
} = require('../renderer/todo-logic.js')

test('createTask returns correct shape', function () {
  var t = createTask('Write tests')
  expect(t.name).toBe('Write tests')
  expect(t.checked).toBe(false)
  expect(t.estimatedMinutes).toBeNull()
  expect(t.loggedMinutes).toBe(0)
  expect(t.children).toEqual([])
  expect(t.collapsed).toBe(false)
  expect(typeof t.id).toBe('string')
  expect(t.id.length).toBeGreaterThan(0)
})

test('checkTask sets node checked', function () {
  var tasks = [createTask('A')]
  var result = checkTask(tasks, tasks[0].id, true)
  expect(result[0].checked).toBe(true)
})

test('checkTask propagates to all descendants', function () {
  var child1 = createTask('Child 1')
  var child2 = createTask('Child 2')
  var grandchild = createTask('Grandchild')
  child2.children = [grandchild]
  var parent = createTask('Parent')
  parent.children = [child1, child2]
  var result = checkTask([parent], parent.id, true)
  var p = result[0]
  expect(p.checked).toBe(true)
  expect(p.children[0].checked).toBe(true)
  expect(p.children[1].checked).toBe(true)
  expect(p.children[1].children[0].checked).toBe(true)
})

test('checkTask auto-checks parent when all siblings checked', function () {
  var child1 = createTask('C1'); child1.checked = true
  var child2 = createTask('C2')
  var parent = createTask('Parent')
  parent.children = [child1, child2]
  var result = checkTask([parent], child2.id, true)
  expect(result[0].checked).toBe(true)
})

test('checkTask auto-unchecks parent when sibling unchecked', function () {
  var child1 = createTask('C1'); child1.checked = true
  var child2 = createTask('C2'); child2.checked = true
  var parent = createTask('Parent'); parent.checked = true
  parent.children = [child1, child2]
  var result = checkTask([parent], child1.id, false)
  expect(result[0].checked).toBe(false)
})

test('getLeafCount returns 1 for leaf node', function () {
  expect(getLeafCount(createTask('A'))).toBe(1)
})

test('getLeafCount returns total leaves in subtree', function () {
  var child1 = createTask('C1')
  var child2 = createTask('C2')
  var grandchild = createTask('GC')
  child2.children = [grandchild]
  var parent = createTask('P')
  parent.children = [child1, child2]
  expect(getLeafCount(parent)).toBe(2)
})

test('getCheckedLeafCount counts checked leaves only', function () {
  var c1 = createTask('C1'); c1.checked = true
  var c2 = createTask('C2')
  var gc = createTask('GC'); gc.checked = true
  c2.children = [gc]
  var p = createTask('P')
  p.children = [c1, c2]
  expect(getCheckedLeafCount(p)).toBe(2)
})

test('getCompletionPercent for leaf: 0% unchecked', function () {
  expect(getCompletionPercent(createTask('A'))).toBe(0)
})

test('getCompletionPercent for leaf: 100% checked', function () {
  var t = createTask('A'); t.checked = true
  expect(getCompletionPercent(t)).toBe(100)
})

test('getCompletionPercent partial tree', function () {
  var c1 = createTask('C1'); c1.checked = true
  var c2 = createTask('C2')
  var p = createTask('P')
  p.children = [c1, c2]
  expect(getCompletionPercent(p)).toBe(50)
})

test('getOverallPercent returns 0 for empty list', function () {
  expect(getOverallPercent([])).toBe(0)
})

test('getOverallPercent across multiple root tasks', function () {
  var a = createTask('A'); a.checked = true
  var b = createTask('B')
  var c = createTask('C'); c.checked = true
  expect(getOverallPercent([a, b, c])).toBe(67)
})

test('addMinutes increments loggedMinutes', function () {
  var tasks = [createTask('A')]
  var id = tasks[0].id
  var result = addMinutes(tasks, id, 25)
  expect(result[0].loggedMinutes).toBe(25)
})

test('addMinutes accumulates multiple calls', function () {
  var tasks = [createTask('A')]
  var id = tasks[0].id
  tasks = addMinutes(tasks, id, 25)
  tasks = addMinutes(tasks, id, 10)
  expect(tasks[0].loggedMinutes).toBe(35)
})

test('addMinutes no-ops on missing id', function () {
  var tasks = [createTask('A')]
  var result = addMinutes(tasks, 'nonexistent-id', 25)
  expect(result[0].loggedMinutes).toBe(0)
})

test('addMinutes works on nested task', function () {
  var child = createTask('Child')
  var parent = createTask('Parent')
  parent.children = [child]
  var result = addMinutes([parent], child.id, 30)
  expect(result[0].children[0].loggedMinutes).toBe(30)
})

test('addTask at root when parentId is null', function () {
  var tasks = [createTask('A')]
  var newTask = createTask('B')
  var result = addTask(tasks, null, newTask)
  expect(result.length).toBe(2)
  expect(result[1].name).toBe('B')
})

test('addTask as child of existing task', function () {
  var parent = createTask('Parent')
  var child = createTask('Child')
  var result = addTask([parent], parent.id, child)
  expect(result[0].children.length).toBe(1)
  expect(result[0].children[0].name).toBe('Child')
})

test('deleteTask removes root task', function () {
  var a = createTask('A')
  var b = createTask('B')
  var result = deleteTask([a, b], a.id)
  expect(result.length).toBe(1)
  expect(result[0].name).toBe('B')
})

test('deleteTask removes nested task and its descendants', function () {
  var child = createTask('Child')
  var grandchild = createTask('GC')
  child.children = [grandchild]
  var parent = createTask('Parent')
  parent.children = [child]
  var result = deleteTask([parent], child.id)
  expect(result[0].children.length).toBe(0)
})

test('findTask returns correct node', function () {
  var a = createTask('A')
  var b = createTask('B')
  var result = findTask([a, b], b.id)
  expect(result).not.toBeNull()
  expect(result.name).toBe('B')
})

test('findTask returns null when not found', function () {
  expect(findTask([createTask('A')], 'nonexistent')).toBeNull()
})

test('findTask finds nested task', function () {
  var child = createTask('Child')
  var parent = createTask('Parent')
  parent.children = [child]
  var result = findTask([parent], child.id)
  expect(result.name).toBe('Child')
})

test('parseTimeInput: "2h" → 120', function () { expect(parseTimeInput('2h')).toBe(120) })
test('parseTimeInput: "90m" → 90', function () { expect(parseTimeInput('90m')).toBe(90) })
test('parseTimeInput: "1.5h" → 90', function () { expect(parseTimeInput('1.5h')).toBe(90) })
test('parseTimeInput: "45" → 45', function () { expect(parseTimeInput('45')).toBe(45) })
test('parseTimeInput: invalid → null', function () {
  expect(parseTimeInput('abc')).toBeNull()
  expect(parseTimeInput('')).toBeNull()
  expect(parseTimeInput('0m')).toBeNull()
})

test('formatLoggedTime: 0 → "0:00"', function () { expect(formatLoggedTime(0)).toBe('0:00') })
test('formatLoggedTime: 90 → "1:30"', function () { expect(formatLoggedTime(90)).toBe('1:30') })
test('formatLoggedTime: 150 → "2:30"', function () { expect(formatLoggedTime(150)).toBe('2:30') })
test('formatLoggedTime: 5 → "0:05"', function () { expect(formatLoggedTime(5)).toBe('0:05') })
```

- [ ] **Step 2: Run tests — confirm they all fail**

```bash
cd /Users/hanniamabellopezmontano/Desktop/pomodoro
npx jest tests/todo-logic.test.js --no-coverage
```

Expected: All tests fail with `Cannot find module '../renderer/todo-logic.js'`

- [ ] **Step 3: Create renderer/todo-logic.js**

Create `renderer/todo-logic.js`:

```javascript
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function createTask(name) {
  return { id: generateId(), name: name, checked: false, estimatedMinutes: null, loggedMinutes: 0, children: [], collapsed: false }
}

function setCheckedDeep(node, checked) {
  return Object.assign({}, node, {
    checked: checked,
    children: node.children.map(function (c) { return setCheckedDeep(c, checked) })
  })
}

function checkTask(tasks, id, checked) {
  function processNode(node) {
    if (node.id === id) return setCheckedDeep(node, checked)
    var newChildren = checkTask(node.children, id, checked)
    var allChecked = newChildren.length > 0 && newChildren.every(function (c) { return c.checked })
    var parentChecked = newChildren.length > 0
      ? (checked ? allChecked : allChecked)
      : node.checked
    return Object.assign({}, node, { children: newChildren, checked: parentChecked })
  }
  return tasks.map(processNode)
}

function getLeafCount(node) {
  if (node.children.length === 0) return 1
  return node.children.reduce(function (sum, c) { return sum + getLeafCount(c) }, 0)
}

function getCheckedLeafCount(node) {
  if (node.children.length === 0) return node.checked ? 1 : 0
  return node.children.reduce(function (sum, c) { return sum + getCheckedLeafCount(c) }, 0)
}

function getCompletionPercent(node) {
  var total = getLeafCount(node)
  if (total === 0) return 0
  return Math.round((getCheckedLeafCount(node) / total) * 100)
}

function getOverallPercent(tasks) {
  if (tasks.length === 0) return 0
  var totalLeaves = tasks.reduce(function (sum, t) { return sum + getLeafCount(t) }, 0)
  if (totalLeaves === 0) return 0
  var checkedLeaves = tasks.reduce(function (sum, t) { return sum + getCheckedLeafCount(t) }, 0)
  return Math.round((checkedLeaves / totalLeaves) * 100)
}

function addMinutes(tasks, id, minutes) {
  return tasks.map(function (task) {
    if (task.id === id) return Object.assign({}, task, { loggedMinutes: task.loggedMinutes + minutes })
    return Object.assign({}, task, { children: addMinutes(task.children, id, minutes) })
  })
}

function addTask(tasks, parentId, task) {
  if (parentId === null) return tasks.concat([task])
  return tasks.map(function (t) {
    if (t.id === parentId) return Object.assign({}, t, { children: t.children.concat([task]) })
    return Object.assign({}, t, { children: addTask(t.children, parentId, task) })
  })
}

function deleteTask(tasks, id) {
  return tasks
    .filter(function (t) { return t.id !== id })
    .map(function (t) { return Object.assign({}, t, { children: deleteTask(t.children, id) }) })
}

function findTask(tasks, id) {
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) return tasks[i]
    var found = findTask(tasks[i].children, id)
    if (found) return found
  }
  return null
}

function parseTimeInput(str) {
  if (!str) return null
  str = str.trim()
  var hourMatch = str.match(/^(\d+(?:\.\d+)?)h$/)
  if (hourMatch) { var mins = Math.round(parseFloat(hourMatch[1]) * 60); return mins > 0 ? mins : null }
  var minMatch = str.match(/^(\d+)m$/)
  if (minMatch) { var m = parseInt(minMatch[1], 10); return m > 0 ? m : null }
  var numMatch = str.match(/^(\d+)$/)
  if (numMatch) { var n = parseInt(numMatch[1], 10); return n > 0 ? n : null }
  return null
}

function formatLoggedTime(minutes) {
  var h = Math.floor(minutes / 60)
  var m = minutes % 60
  return h + ':' + (m < 10 ? '0' : '') + m
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createTask, checkTask, getLeafCount, getCheckedLeafCount, getCompletionPercent, getOverallPercent, addMinutes, addTask, deleteTask, findTask, parseTimeInput, formatLoggedTime }
}
```

- [ ] **Step 4: Run tests — confirm they all pass**

```bash
cd /Users/hanniamabellopezmontano/Desktop/pomodoro
npx jest tests/todo-logic.test.js --no-coverage
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/hanniamabellopezmontano/Desktop/pomodoro
git add renderer/todo-logic.js tests/todo-logic.test.js
git commit -m "feat: add todo-logic.js pure functions with tests"
```

---

### Task 2: HTML Markup

**Files:**
- Modify: `renderer/index.html`

- [ ] **Step 1: Replace the entire contents of renderer/index.html**

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
    <div class="titlebar-left no-drag">
      <button class="btn-todo-toggle" id="btn-todo-toggle" aria-label="Toggle to-do list">&#9776;</button>
    </div>
    <div class="titlebar-drag"></div>
    <div class="titlebar-controls">
      <button class="btn-minimize" id="btn-minimize" aria-label="Minimize window">&#8212;</button>
      <button class="btn-close" id="btn-close" aria-label="Close window">&#215;</button>
    </div>
  </div>

  <div class="app-body">

    <div class="timer-section">
      <main class="main">
        <div class="cat-container">
          <img class="cat-gif" id="cat-ambient" alt="cat" src="../assets/Wake Up Art Sticker.gif">
        </div>
        <div class="session-label" id="session-label">Focus</div>
        <div class="active-task-label" id="active-task-label"></div>
        <div class="timer-display" id="timer-display">25:00</div>
        <div class="session-dots" id="session-dots"></div>
        <div class="controls">
          <button class="btn-start" id="btn-start">Start</button>
          <button class="btn-reset" id="btn-reset">Reset</button>
        </div>
      </main>
    </div>

    <div class="todo-panel" id="todo-panel">
      <div class="todo-header">
        <span class="todo-title">To-Do</span>
        <span class="todo-overall" id="todo-overall">0%</span>
        <button class="btn-todo-add-root" id="btn-todo-add-root" aria-label="Add task">+</button>
      </div>
      <div class="todo-list" id="todo-list"></div>
    </div>

  </div>

  <button class="btn-settings" id="btn-settings" aria-label="Open settings">&#9881;</button>

  <div class="overlay-celebration" id="overlay-celebration">
    <img class="cat-celebration" id="cat-celebration" alt="celebration cat" src="">
  </div>

  <div class="settings-panel" id="settings-panel">
    <div class="settings-header">
      <span class="settings-title">Settings</span>
      <button class="btn-settings-close" id="btn-settings-close" aria-label="Close settings">&#215;</button>
    </div>
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
    <button class="btn-save" id="btn-save">Save</button>
  </div>

  <script src="timer-logic.js"></script>
  <script src="todo-logic.js"></script>
  <script src="app.js"></script>
  <script src="todo.js"></script>
</body>
</html>
```

- [ ] **Step 2: Start app and verify timer still renders**

```bash
cd /Users/hanniamabellopezmontano/Desktop/pomodoro
npm start
```

The timer section should display correctly. The settings gear should open the settings panel and the new "Dark mode" select should be visible. No console errors.

- [ ] **Step 3: Commit**

```bash
git add renderer/index.html
git commit -m "feat: add todo panel markup, active-task-label, dark mode select"
```

---

### Task 3: CSS Layout and Styles

**Files:**
- Modify: `renderer/style.css`

- [ ] **Step 1: Replace the html/body block and add body flex + dark mode CSS vars**

Find this block in `style.css`:

```css
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
```

Replace it with:

```css
html {
  height: 580px;
  overflow: hidden;
}

body {
  width: 420px;
  height: 580px;
  overflow: hidden;
  background: var(--white);
  color: var(--black);
  font-family: 'MorningBreeze', sans-serif;
  font-weight: 400;
  user-select: none;
  -webkit-user-select: none;
  display: flex;
  flex-direction: column;
  transition: width 0.25s ease;
}

body.dark {
  --white: #1A1A1A;
  --black: #F0F0F0;
  --red: #E8434E;
}
```

- [ ] **Step 2: Update the titlebar section**

Find the existing `.titlebar` block:

```css
.titlebar {
  height: 36px;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
}
```

Replace it with:

```css
.titlebar {
  height: 36px;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.titlebar-left {
  padding-left: 8px;
  display: flex;
  align-items: center;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.btn-todo-toggle {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  font-family: 'MorningBreeze', sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--black);
  opacity: 0.5;
  transition: opacity 0.15s;
  padding: 0;
}

.btn-todo-toggle:hover { opacity: 1; }
```

- [ ] **Step 3: Add app-body, timer-section, and active-task-label styles**

After the `.titlebar` section (before `/* ── Main layout */`), add:

```css
/* ── App body ─────────────────────────────────── */

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Timer section ────────────────────────────── */

.timer-section {
  width: 420px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

/* ── Active task label ────────────────────────── */

.active-task-label {
  font-size: 12px;
  font-weight: 300;
  color: var(--accent);
  letter-spacing: 0.05em;
  min-height: 16px;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.3s;
}
```

- [ ] **Step 4: Add todo panel and task row styles**

At the end of `style.css`, append:

```css
/* ── Todo panel ───────────────────────────────── */

.todo-panel {
  width: 320px;
  flex-shrink: 0;
  border-left: 2px solid var(--black);
  display: flex;
  flex-direction: column;
  opacity: 0;
  transform: translateX(20px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
  overflow: hidden;
}

.todo-panel.open {
  opacity: 1;
  transform: translateX(0);
  pointer-events: all;
}

.todo-header {
  display: flex;
  align-items: center;
  padding: 10px 12px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
  gap: 8px;
}

body.dark .todo-header {
  border-bottom-color: rgba(240, 240, 240, 0.15);
}

.todo-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  flex: 1;
}

.todo-overall {
  font-size: 12px;
  font-weight: 300;
  color: var(--accent);
  transition: color 0.3s;
}

.btn-todo-add-root {
  width: 24px;
  height: 24px;
  border: 2px solid var(--black);
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  font-family: 'MorningBreeze', sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  line-height: 1;
  padding: 0;
  transition: background 0.15s, color 0.15s;
}

.btn-todo-add-root:hover {
  background: var(--black);
  color: var(--white);
}

.todo-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

/* ── Task rows ────────────────────────────────── */

.task-row { display: flex; flex-direction: column; position: relative; }

.task-row-main {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 5px 8px;
  position: relative;
}

.task-row-main:hover { background: rgba(0, 0, 0, 0.04); }
body.dark .task-row-main:hover { background: rgba(255, 255, 255, 0.06); }

.task-row-main.active-task { border-left: 3px solid var(--accent); padding-left: 5px; }

.task-indent { flex-shrink: 0; }

.task-collapse-btn {
  width: 16px; height: 16px; background: transparent; border: none; cursor: pointer;
  font-size: 9px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; padding: 0; opacity: 0.5; transition: opacity 0.15s;
  color: var(--black); font-family: 'MorningBreeze', sans-serif;
}
.task-collapse-btn:hover { opacity: 1; }
.task-collapse-spacer { width: 16px; flex-shrink: 0; }

.task-checkbox { width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; accent-color: var(--accent); }

.task-name {
  flex: 1; font-size: 13px; font-weight: 400; cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
}
.task-name.checked { text-decoration: line-through; opacity: 0.45; }

.task-name-input {
  flex: 1; border: none; border-bottom: 1px solid var(--black);
  font-family: 'MorningBreeze', sans-serif; font-size: 13px;
  background: transparent; outline: none; min-width: 0; padding: 0; color: var(--black);
}

.task-select-btn {
  font-size: 11px; padding: 1px 5px; border: 1px solid var(--black);
  background: transparent; cursor: pointer; border-radius: 3px;
  font-family: 'MorningBreeze', sans-serif; white-space: nowrap; flex-shrink: 0;
  opacity: 0; transition: opacity 0.15s, background 0.15s, color 0.15s;
  color: var(--black);
}
.task-row-main:hover .task-select-btn,
.task-row-main.active-task .task-select-btn { opacity: 1; }
.task-select-btn.selected { background: var(--accent); color: var(--white); border-color: var(--accent); }

.task-delete-btn {
  width: 16px; height: 16px; border: none; background: transparent; cursor: pointer;
  font-size: 14px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; opacity: 0; transition: opacity 0.15s, color 0.15s;
  color: var(--black); font-family: 'MorningBreeze', sans-serif; padding: 0; line-height: 1;
}
.task-row-main:hover .task-delete-btn { opacity: 0.5; }
.task-delete-btn:hover { opacity: 1 !important; color: var(--red); }

.task-add-child-btn {
  width: 16px; height: 16px; border: none; background: transparent; cursor: pointer;
  font-size: 14px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; opacity: 0; transition: opacity 0.15s;
  color: var(--black); font-family: 'MorningBreeze', sans-serif; padding: 0; line-height: 1;
}
.task-row-main:hover .task-add-child-btn { opacity: 0.5; }
.task-add-child-btn:hover { opacity: 1 !important; }

/* ── Task meta (progress + time) ─────────────── */

.task-meta { padding: 0 10px 4px; display: flex; flex-direction: column; gap: 2px; }

.task-progress-bar {
  height: 3px; background: rgba(0, 0, 0, 0.1); border-radius: 2px; overflow: hidden;
}
body.dark .task-progress-bar { background: rgba(255, 255, 255, 0.12); }

.task-progress-fill {
  height: 100%; background: var(--accent); border-radius: 2px;
  transition: width 0.2s ease, background 0.3s;
}

.task-time-line {
  font-size: 11px; font-weight: 300; color: rgba(0, 0, 0, 0.5); display: flex; gap: 10px;
}
body.dark .task-time-line { color: rgba(240, 240, 240, 0.5); }

.task-est-span { cursor: pointer; }
.task-est-span:hover { color: var(--black); }

.task-est-input {
  width: 52px; border: none; border-bottom: 1px solid var(--black);
  font-family: 'MorningBreeze', sans-serif; font-size: 11px;
  background: transparent; outline: none; padding: 0; color: var(--black);
}

.task-children { margin-left: 0; }

/* ── Settings select (dark mode toggle) ─────── */

.settings-body select {
  padding: 4px 8px;
  border: 2px solid var(--black);
  font-family: 'MorningBreeze', sans-serif;
  font-size: 15px;
  background: var(--white);
  color: var(--black);
  border-radius: 2px;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

/* ── Dark mode: celebration overlay ─────────── */

body.dark .overlay-celebration { background: rgba(26, 26, 26, 0.88); }
```

- [ ] **Step 5: Start app and verify layout**

```bash
npm start
```

The ☰ button should appear in the titlebar top-left. Timer section renders normally. Settings opens — "Dark mode" select row is visible with Auto/On/Off options. No console errors.

- [ ] **Step 6: Commit**

```bash
git add renderer/style.css
git commit -m "feat: add todo panel CSS, task row styles, dark mode CSS vars"
```

---

### Task 4: Add getDarkAccentColor to timer-logic.js

**Files:**
- Modify: `renderer/timer-logic.js`
- Modify: `tests/timer-logic.test.js` (if it exists — check first with `ls tests/`)

Dark mode needs per-session accent colors. `render()` in `app.js` will call this to pick the right accent when dark mode is active.

- [ ] **Step 1: Add getDarkAccentColor to timer-logic.js**

Open `renderer/timer-logic.js`. After the `getAccentColor` function (line 51), add:

```javascript
function getDarkAccentColor(sessionType) {
  if (sessionType === 'work') return '#95A82B'
  if (sessionType === 'short-break') return '#6A7FE8'
  return '#E8434E'
}
```

Update the `module.exports` block at the bottom to include it:

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatTime,
    getNextSession,
    getAmbientGif,
    pickCelebrationGif,
    getAccentColor,
    getDarkAccentColor,
    AMBIENT_GIFS,
    CELEBRATION_GIFS
  }
}
```

- [ ] **Step 2: Check if tests/timer-logic.test.js exists**

```bash
ls /Users/hanniamabellopezmontano/Desktop/pomodoro/tests/
```

If `timer-logic.test.js` exists, open it and add a test at the end:

```javascript
test('getDarkAccentColor returns dark variants', function () {
  var { getDarkAccentColor } = require('../renderer/timer-logic.js')
  expect(getDarkAccentColor('work')).toBe('#95A82B')
  expect(getDarkAccentColor('short-break')).toBe('#6A7FE8')
  expect(getDarkAccentColor('long-break')).toBe('#E8434E')
})
```

If `timer-logic.test.js` does not exist, skip this sub-step.

- [ ] **Step 3: Run all tests**

```bash
cd /Users/hanniamabellopezmontano/Desktop/pomodoro
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add renderer/timer-logic.js tests/
git commit -m "feat: add getDarkAccentColor for dark mode session accents"
```

---

### Task 5: app.js Integration (todo + dark mode)

**Files:**
- Modify: `renderer/app.js`

This task wires: (a) localStorage helpers for tasks, (b) `state.activeTaskId`, (c) active task label in `render()`, (d) time logging on session complete, (e) `initTheme()` / `applyTheme()`, (f) dark mode select listener.

- [ ] **Step 1: Add loadTasks/saveTasks after saveConfig**

Open `renderer/app.js`. After the `saveConfig` function (around line 17), add:

```javascript
function loadTasks() {
  try { return JSON.parse(localStorage.getItem('todo-tasks') || '[]') }
  catch (e) { return [] }
}

function saveTasks(tasks) {
  localStorage.setItem('todo-tasks', JSON.stringify(tasks))
}
```

- [ ] **Step 2: Add activeTaskId to state**

Find the `state` object (around line 33). Change it to:

```javascript
var state = {
  timerState: 'idle',
  sessionType: 'work',
  secondsLeft: config.work * 60,
  completedWork: 0,
  interval: null,
  activeTaskId: null
}
```

- [ ] **Step 3: Add DOM refs for active-task-label and theme select**

In the DOM refs block (after line 60), add:

```javascript
var elActiveTaskLabel = document.getElementById('active-task-label')
var elThemeSelect     = document.getElementById('select-theme')
```

- [ ] **Step 4: Update render() to show active task and use dark-aware accent**

Find the top of `render()`. Replace:

```javascript
  // Accent color
  var accent = getAccentColor(state.sessionType)
  document.documentElement.style.setProperty('--accent', accent)
  elBtnStart.style.background = accent
```

With:

```javascript
  // Accent color — use dark variants when dark mode active
  var accent = document.body.classList.contains('dark')
    ? getDarkAccentColor(state.sessionType)
    : getAccentColor(state.sessionType)
  document.documentElement.style.setProperty('--accent', accent)
  elBtnStart.style.background = accent
```

At the end of `render()`, before the closing `}`, add:

```javascript
  // Active task label
  var activeTask = state.activeTaskId ? findTask(loadTasks(), state.activeTaskId) : null
  if (elActiveTaskLabel) {
    elActiveTaskLabel.textContent = activeTask ? '\u2192 ' + activeTask.name : ''
    elActiveTaskLabel.style.display = activeTask ? 'block' : 'none'
  }
```

- [ ] **Step 5: Update onSessionComplete() to log time**

Find `onSessionComplete()`. Replace:

```javascript
  if (state.sessionType === 'work') {
    state.completedWork += 1
  }
```

With:

```javascript
  if (state.sessionType === 'work') {
    state.completedWork += 1
    if (state.activeTaskId) {
      var tasks = loadTasks()
      tasks = addMinutes(tasks, state.activeTaskId, config.work)
      saveTasks(tasks)
      if (typeof renderTodoPanel === 'function') renderTodoPanel()
    }
  }
```

- [ ] **Step 6: Add initTheme() and applyTheme() after saveConfig block**

After the `saveTasks` function, add:

```javascript
function applyTheme(mode) {
  if (mode === 'dark') document.body.classList.add('dark')
  else document.body.classList.remove('dark')
  render()
}

function initTheme() {
  var override = localStorage.getItem('theme-override')
  if (override === 'dark' || override === 'light') {
    applyTheme(override)
  } else {
    var mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyTheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', function (e) {
      if (!localStorage.getItem('theme-override')) applyTheme(e.matches ? 'dark' : 'light')
    })
  }
}
```

- [ ] **Step 7: Add theme select change listener and sync on settings open**

In the settings event listeners section, add after `elBtnSettings.addEventListener`:

After the existing `elBtnSettings.addEventListener('click', function () { ... })` block, add inside it (before the closing `}`), a line to sync the select:

```javascript
elBtnSettings.addEventListener('click', function () {
  elInputWork.value = config.work
  elInputShort.value = config.shortBreak
  elInputLong.value = config.longBreak
  elInputSessions.value = config.sessionsBeforeLongBreak
  elThemeSelect.value = localStorage.getItem('theme-override') || 'auto'
  elSettingsPanel.classList.add('visible')
})
```

Then add the theme change listener after all existing event listeners (before `render()`):

```javascript
elThemeSelect.addEventListener('change', function () {
  var val = elThemeSelect.value
  if (val === 'auto') {
    localStorage.removeItem('theme-override')
    var mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyTheme(mq.matches ? 'dark' : 'light')
  } else {
    localStorage.setItem('theme-override', val)
    applyTheme(val)
  }
})
```

- [ ] **Step 8: Call initTheme() before the final render() call**

At the bottom of `app.js`, change:

```javascript
render()
```

To:

```javascript
initTheme()
render()
```

- [ ] **Step 9: Start the app and test dark mode**

```bash
npm start
```

Test:
1. Open Settings → set Dark mode to "On" → app immediately goes dark (background dark, text light)
2. Set Dark mode to "Off" → app immediately goes light
3. Set Dark mode to "Auto" → app follows system appearance
4. Close and reopen app → theme preference persists

- [ ] **Step 10: Commit**

```bash
git add renderer/app.js
git commit -m "feat: wire app.js for active task, time logging, and dark mode"
```

---

### Task 6: todo.js DOM Wiring

**Files:**
- Create: `renderer/todo.js`

- [ ] **Step 1: Create renderer/todo.js**

Create `renderer/todo.js`:

```javascript
var panelOpen = false

var elTodoPanel     = document.getElementById('todo-panel')
var elTodoList      = document.getElementById('todo-list')
var elTodoOverall   = document.getElementById('todo-overall')
var elBtnTodoToggle = document.getElementById('btn-todo-toggle')
var elBtnAddRoot    = document.getElementById('btn-todo-add-root')

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatEstimate(minutes) {
  if (!minutes) return '\u2014'
  if (minutes % 60 === 0) return (minutes / 60) + 'h'
  var h = Math.floor(minutes / 60)
  var m = minutes % 60
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm'
}

function updateTaskName(tasks, id, name) {
  return tasks.map(function (t) {
    if (t.id === id) return Object.assign({}, t, { name: name })
    return Object.assign({}, t, { children: updateTaskName(t.children, id, name) })
  })
}

function setCollapsed(tasks, id, collapsed) {
  return tasks.map(function (t) {
    if (t.id === id) return Object.assign({}, t, { collapsed: collapsed })
    return Object.assign({}, t, { children: setCollapsed(t.children, id, collapsed) })
  })
}

function startInlineNameEdit(nameEl, taskId, isNew) {
  var input = document.createElement('input')
  input.type = 'text'
  input.className = 'task-name-input'
  input.value = isNew ? '' : nameEl.textContent
  nameEl.replaceWith(input)
  input.focus()

  var saved = false
  function save() {
    if (saved) return; saved = true
    var val = input.value.trim()
    if (!val) {
      if (isNew) { var t = loadTasks(); saveTasks(deleteTask(t, taskId)) }
      renderTodoPanel(); return
    }
    saveTasks(updateTaskName(loadTasks(), taskId, val))
    renderTodoPanel()
  }

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    if (e.key === 'Escape') {
      saved = true
      if (isNew) saveTasks(deleteTask(loadTasks(), taskId))
      renderTodoPanel()
    }
  })
  input.addEventListener('blur', save)
}

function startInlineEstEdit(estSpan, taskId) {
  var input = document.createElement('input')
  input.type = 'text'
  input.className = 'task-est-input'
  input.placeholder = '2h / 90m'
  estSpan.replaceWith(input)
  input.focus()

  var saved = false
  function save() {
    if (saved) return; saved = true
    var minutes = input.value.trim() ? parseTimeInput(input.value.trim()) : null
    var tasks = loadTasks().map(function fix(t) {
      if (t.id === taskId) return Object.assign({}, t, { estimatedMinutes: minutes })
      return Object.assign({}, t, { children: t.children.map(fix) })
    })
    saveTasks(tasks)
    renderTodoPanel()
  }

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    if (e.key === 'Escape') { saved = true; renderTodoPanel() }
  })
  input.addEventListener('blur', save)
}

function buildTaskEl(task, depth) {
  var row = document.createElement('div')
  row.className = 'task-row'
  row.dataset.taskId = task.id

  var main = document.createElement('div')
  main.className = 'task-row-main' + (state.activeTaskId === task.id ? ' active-task' : '')

  if (depth > 0) {
    var indent = document.createElement('div')
    indent.className = 'task-indent'
    indent.style.width = (depth * 14) + 'px'
    main.appendChild(indent)
  }

  if (task.children.length > 0) {
    var colBtn = document.createElement('button')
    colBtn.className = 'task-collapse-btn'
    colBtn.textContent = task.collapsed ? '\u25B6' : '\u25BC'
    colBtn.addEventListener('click', function () {
      saveTasks(setCollapsed(loadTasks(), task.id, !task.collapsed))
      renderTodoPanel()
    })
    main.appendChild(colBtn)
  } else {
    var spacer = document.createElement('div')
    spacer.className = 'task-collapse-spacer'
    main.appendChild(spacer)
  }

  var checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = 'task-checkbox'
  checkbox.checked = task.checked
  checkbox.addEventListener('change', function () {
    saveTasks(checkTask(loadTasks(), task.id, checkbox.checked))
    renderTodoPanel()
  })
  main.appendChild(checkbox)

  var nameEl = document.createElement('span')
  nameEl.className = 'task-name' + (task.checked ? ' checked' : '')
  nameEl.textContent = task.name || '(unnamed)'
  nameEl.addEventListener('click', function () { startInlineNameEdit(nameEl, task.id, false) })
  main.appendChild(nameEl)

  var addChildBtn = document.createElement('button')
  addChildBtn.className = 'task-add-child-btn'
  addChildBtn.textContent = '+'
  addChildBtn.title = 'Add subtask'
  addChildBtn.addEventListener('click', function () {
    var newTask = createTask('')
    var tasks = addTask(loadTasks(), task.id, newTask)
    if (task.collapsed) tasks = setCollapsed(tasks, task.id, false)
    saveTasks(tasks)
    renderTodoPanel()
    var newEl = elTodoList.querySelector('[data-task-id="' + newTask.id + '"] .task-name')
    if (newEl) startInlineNameEdit(newEl, newTask.id, true)
  })
  main.appendChild(addChildBtn)

  var selectBtn = document.createElement('button')
  selectBtn.className = 'task-select-btn' + (state.activeTaskId === task.id ? ' selected' : '')
  selectBtn.textContent = state.activeTaskId === task.id ? 'Active' : 'Select'
  selectBtn.addEventListener('click', function () {
    state.activeTaskId = state.activeTaskId === task.id ? null : task.id
    render(); renderTodoPanel()
  })
  main.appendChild(selectBtn)

  var delBtn = document.createElement('button')
  delBtn.className = 'task-delete-btn'
  delBtn.textContent = '\u00D7'
  delBtn.addEventListener('click', function () {
    if (state.activeTaskId === task.id) { state.activeTaskId = null; render() }
    saveTasks(deleteTask(loadTasks(), task.id))
    renderTodoPanel()
  })
  main.appendChild(delBtn)
  row.appendChild(main)

  var pct = getCompletionPercent(task)
  var meta = document.createElement('div')
  meta.className = 'task-meta'
  meta.style.paddingLeft = (depth * 14 + 36) + 'px'

  var bar = document.createElement('div')
  bar.className = 'task-progress-bar'
  var fill = document.createElement('div')
  fill.className = 'task-progress-fill'
  fill.style.width = pct + '%'
  bar.appendChild(fill)
  meta.appendChild(bar)

  var timeLine = document.createElement('div')
  timeLine.className = 'task-time-line'

  var estSpan = document.createElement('span')
  estSpan.className = 'task-est-span'
  estSpan.textContent = 'est: ' + formatEstimate(task.estimatedMinutes)
  estSpan.addEventListener('click', function () { startInlineEstEdit(estSpan, task.id) })
  timeLine.appendChild(estSpan)

  var spentSpan = document.createElement('span')
  spentSpan.textContent = 'spent: ' + formatLoggedTime(task.loggedMinutes)
  timeLine.appendChild(spentSpan)

  meta.appendChild(timeLine)
  row.appendChild(meta)

  if (task.children.length > 0 && !task.collapsed) {
    var childrenEl = document.createElement('div')
    childrenEl.className = 'task-children'
    task.children.forEach(function (child) { childrenEl.appendChild(buildTaskEl(child, depth + 1)) })
    row.appendChild(childrenEl)
  }

  return row
}

function renderTodoPanel() {
  var tasks = loadTasks()
  elTodoOverall.textContent = getOverallPercent(tasks) + '%'
  elTodoList.innerHTML = ''
  tasks.forEach(function (task) { elTodoList.appendChild(buildTaskEl(task, 0)) })
}

function openTodoPanel() {
  panelOpen = true
  elTodoPanel.classList.add('open')
  window.windowControls.resize(740)
  renderTodoPanel()
}

function closeTodoPanel() {
  panelOpen = false
  elTodoPanel.classList.remove('open')
  window.windowControls.resize(420)
}

elBtnTodoToggle.addEventListener('click', function () {
  if (panelOpen) closeTodoPanel()
  else openTodoPanel()
})

elBtnAddRoot.addEventListener('click', function () {
  var newTask = createTask('')
  saveTasks(addTask(loadTasks(), null, newTask))
  renderTodoPanel()
  var newEl = elTodoList.querySelector('[data-task-id="' + newTask.id + '"] .task-name')
  if (newEl) startInlineNameEdit(newEl, newTask.id, true)
})

renderTodoPanel()
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /Users/hanniamabellopezmontano/Desktop/pomodoro
npm test
```

Expected: All tests pass.

- [ ] **Step 3: Start the app and run the full manual flow**

```bash
npm start
```

Test each of these in order:
1. ☰ button → window expands to 740px, panel fades in
2. ☰ again → window shrinks, panel fades out
3. Click + in panel header → new task created, name input focused; type a name, Enter → saves
4. Hover a task → click its + → subtask added, indented, input focused
5. Check leaf subtask → progress bar fills on parent; check all sibling subtasks → parent auto-checks
6. Uncheck one subtask → parent auto-unchecks
7. Click task name → inline edit; Enter saves, Escape cancels
8. Click "est:" → type `2h`, Enter → shows `2h` in time line
9. Click Select on a task → `Active` label shows, accent border appears
10. Close panel → "→ Task name" shows below session label in timer
11. Set work to 1 min in settings, start timer, let it complete → check spent time incremented
12. Click × on a task → task and children deleted
13. Settings → Dark mode On → entire app switches to dark palette
14. Dark mode Off → switches back to light
15. Reload app → tasks and theme preference persist

- [ ] **Step 4: Commit**

```bash
git add renderer/todo.js
git commit -m "feat: add todo.js DOM wiring for task panel"
```

---

### Task 7: DMG Packaging

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install electron-builder**

```bash
cd /Users/hanniamabellopezmontano/Desktop/pomodoro
npm install --save-dev electron-builder
```

Expected: `package-lock.json` updated, `node_modules/electron-builder` exists.

- [ ] **Step 2: Update package.json**

Open `package.json`. Replace the entire file with:

```json
{
  "name": "kawaii-pomodoro",
  "version": "1.0.0",
  "description": "Kawaii cat pomodoro timer",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "jest",
    "dist": "electron-builder --mac dmg"
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.0.0",
    "jest": "^29.0.0"
  },
  "build": {
    "appId": "com.kawaii.pomodoro",
    "productName": "Kawaii Pomodoro",
    "mac": {
      "category": "public.app-category.productivity"
    },
    "dmg": {
      "title": "Kawaii Pomodoro"
    },
    "files": [
      "main.js",
      "preload.js",
      "renderer/**",
      "assets/**",
      "*.otf"
    ]
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

> Note: `electron-builder` may update the exact version number in `devDependencies` after `npm install` — that's fine. Don't manually change the version it wrote.

- [ ] **Step 3: Run npm install to sync**

```bash
npm install
```

Expected: No errors. `package-lock.json` updated.

- [ ] **Step 4: Build the DMG**

```bash
npm run dist
```

Expected: Produces `dist/Kawaii Pomodoro-1.0.0.dmg` (may take 1–2 minutes on first run).

If it fails with a code signing error, add `"identity": null` under the `"mac"` key in the build config:

```json
"mac": {
  "category": "public.app-category.productivity",
  "identity": null
}
```

Then re-run `npm run dist`.

- [ ] **Step 5: Install and verify the DMG**

Double-click `dist/Kawaii Pomodoro-1.0.0.dmg`. Drag the app to Applications. Open it. If macOS shows a Gatekeeper warning ("app cannot be opened"), right-click the app → Open → Open. The app should launch and work normally.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add electron-builder DMG packaging"
```

---

### Task 8: Final Integration Test

**Files:** (no code changes — verification only)

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/hanniamabellopezmontano/Desktop/pomodoro
npm test
```

Expected: All tests pass with no failures.

- [ ] **Step 2: Full smoke test**

```bash
npm start
```

Complete end-to-end flow:
1. App opens at 420px, light mode (or matches system)
2. Toggle todo panel → expands to 740px
3. Add "Project A" with subtasks "Design" and "Build"; check "Design" → 50% progress bar on Project A; overall % updates in header
4. Select "Build" as active task → label shows in timer
5. Set work to 1 min, complete a session → spent time increments on "Build"
6. Open settings → Dark mode On → dark palette across full app including todo panel
7. Dark mode Auto → system follow works
8. Close panel → active task label still visible
9. Reload → tasks persist, theme persists
10. `npm run dist` → DMG builds without errors

- [ ] **Step 3: Commit any minor fixes**

```bash
git add -p
git commit -m "fix: [describe any smoke test fixes]"
```
