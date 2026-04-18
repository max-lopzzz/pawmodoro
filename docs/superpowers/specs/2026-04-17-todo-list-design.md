# Linked To-Do List — Design Spec

**Date:** 2026-04-17
**Builds on:** Kawaii Cat Pomodoro Timer (existing app)

---

## Overview

Add a linked to-do list panel that expands the window to the right of the timer. Tasks are selected before starting the timer; completed pomodoro work sessions automatically log time against the active task. Tasks support infinite subtask nesting, checkbox-based completion %, and manual time estimates.

---

## Architecture

### New Files

| File | Responsibility |
|------|---------------|
| `renderer/todo-logic.js` | Pure functions: task tree CRUD, completion %, time logging. UMD-lite (Jest + browser). |
| `renderer/todo.js` | DOM wiring: render task list, handle events, IPC resize calls. |
| `tests/todo-logic.test.js` | Jest unit tests for all `todo-logic.js` functions. |

### Modified Files

| File | Change |
|------|--------|
| `main.js` | Add `window-resize` IPC handler: `win.setSize(width, 580)` |
| `renderer/index.html` | Add todo panel markup + toggle button in titlebar |
| `renderer/style.css` | Todo panel layout, task styles, expand animation |
| `renderer/app.js` | Add `state.activeTaskId`, log minutes on work session complete, render active task name |

### Script Load Order in `index.html`

```html
<script src="timer-logic.js"></script>
<script src="todo-logic.js"></script>
<script src="app.js"></script>
<script src="todo.js"></script>
```

---

## Data Model

Tasks are stored in localStorage under key `todo-tasks` as a JSON array of root task nodes.

### Task Node

```javascript
{
  id: "uuid-string",           // generated via crypto.randomUUID()
  name: "Task name",
  checked: false,
  estimatedMinutes: 120,       // null if not set
  loggedMinutes: 0,            // incremented by completed work sessions
  children: [],                // recursive task nodes
  collapsed: false             // UI state: subtree visible/hidden
}
```

---

## Pure Logic — `todo-logic.js`

All functions treat the task tree as immutable (return new tree). UMD-lite export pattern (same as `timer-logic.js`).

### Functions

```javascript
createTask(name)
// Returns a new task node with crypto.randomUUID() id, empty children.

checkTask(tasks, id, checked)
// Returns new tasks array with target node + all descendants set to checked.
// If all siblings are checked, their parent is auto-checked.
// If any sibling is unchecked, their parent is auto-unchecked.

getLeafCount(node)
// Returns total number of leaf nodes in subtree (nodes with no children).
// A task with no children counts as 1 leaf.

getCheckedLeafCount(node)
// Returns number of checked leaf nodes in subtree.

getCompletionPercent(node)
// Returns Math.round((getCheckedLeafCount(node) / getLeafCount(node)) * 100).
// Returns 0 if node has no leaves.

getOverallPercent(tasks)
// Returns Math.round(sum of all checked leaves / sum of all leaves * 100).
// Returns 0 for empty list.

addMinutes(tasks, id, minutes)
// Returns new tasks array with loggedMinutes incremented by minutes for node with id.
// No-op if id not found.

addTask(tasks, parentId, task)
// If parentId is null: appends task to root array.
// If parentId found: appends task to that node's children array.
// Returns new tasks array.

deleteTask(tasks, id)
// Removes node with id and all its descendants.
// Returns new tasks array.

findTask(tasks, id)
// Returns the task node with given id, or null.

parseTimeInput(str)
// Parses user time input: "2h" → 120, "90m" → 90, "1.5h" → 90, "45" → 45.
// Returns null for invalid input.

formatLoggedTime(minutes)
// Formats logged minutes: 0 → "0:00", 90 → "1:30", 150 → "2:30".
// Named distinctly from timer-logic.js's formatTime(seconds) to avoid global collision.
```

---

## IPC — Window Resize

**preload.js addition:**
```javascript
windowControls.resize = (width) => ipcRenderer.send('window-resize', width)
```

**main.js addition:**
```javascript
ipcMain.on('window-resize', (_, width) => win.setSize(width, 580))
```

The renderer calls:
- `window.windowControls.resize(740)` when opening the panel
- `window.windowControls.resize(420)` when closing it

---

## UI Layout

### Titlebar Change

A list icon button (`☰`, id `btn-todo-toggle`) is added to the left of the titlebar drag region, inside a `no-drag` wrapper. Clicking it toggles the panel.

### Window Expansion

The window animates from 420→740px. Because `win.setSize()` is instant (no built-in Electron animation), the todo panel uses a CSS `opacity` + `transform` transition (fade + slide from right) to visually smooth the appearance.

### Todo Panel Structure (right column, 320px wide)

```
┌──────────────────────────────┐
│ To-Do              42%  [+]  │  ← header
├──────────────────────────────┤
│ ☐  Write intro       [select]│  ← task row
│    ████░░░░ 50%              │
│    est: 2h  spent: 0:30      │
│  ▸ ☐  Draft outline [select]│  ← subtask (indented)
│  ▸ ☑  Research      [select]│
├──────────────────────────────┤
│ ☐  Review notes      [select]│
└──────────────────────────────┘
```

### Task Row Elements

- **Checkbox** — checks/unchecks task + all descendants
- **Task name** — click to edit inline (input swap: text replaced with `<input>`, saved on Enter/blur, cancelled on Escape)
- **Select button** — sets as active task; highlighted with accent-color left border when active
- **Completion % bar** — thin bar below name, filled proportionally
- **Time line** — `est: 2h  spent: 1:30` (est shows `—` if not set; clicking est opens inline input)
- **Expand/collapse arrow** — only shown if task has children
- **Add subtask `+`** — shown on hover
- **Delete `×`** — shown on hover

### Active Task in Timer Area

Below `#session-label`, a new `<div id="active-task-label">` shows:
- `→ Task name` when a task is selected
- Empty (hidden) when no task selected

---

## Timer Integration (`app.js` changes)

```javascript
// Added to state:
state.activeTaskId = null

// Added to onSessionComplete():
if (state.sessionType === 'work' && state.activeTaskId) {
  var tasks = loadTasks()
  tasks = addMinutes(tasks, state.activeTaskId, config.work)
  saveTasks(tasks)
  renderTodoPanel()   // defined in todo.js, called as global
}

// Added to render():
var task = state.activeTaskId ? findTask(loadTasks(), state.activeTaskId) : null
elActiveTaskLabel.textContent = task ? '→ ' + task.name : ''
elActiveTaskLabel.style.display = task ? 'block' : 'none'
```

`loadTasks()` and `saveTasks(tasks)` are thin localStorage wrappers defined in `todo.js`.

---

## Interactions

| Action | Behaviour |
|--------|-----------|
| Click `+` in header | Inserts new root task with empty name, input focused |
| Click `+` on hover next to task | Inserts child task, input focused |
| Press Enter in name input | Saves name |
| Press Escape in name input | Cancels (deletes if task has no name yet) |
| Click time estimate | Opens inline input; accepts `2h`, `90m`, `1.5h`, `45` (minutes) |
| Check all subtasks | Parent auto-checks |
| Uncheck any subtask | Parent auto-unchecks |
| Click `×` | Deletes task + all descendants (no confirmation) |
| Click Select | Sets active task; previous active task deselected |
| Close panel | Active task stays selected; timer label still shows task name |
| Session complete (no active task) | Time not logged; no error |
| Session complete (task 100% checked) | Time still logged; tasks can exceed estimate |

---

## Testing (`tests/todo-logic.test.js`)

Unit tests covering:
- `createTask` returns correct shape
- `checkTask` propagates to descendants
- `checkTask` auto-checks parent when all siblings checked
- `checkTask` auto-unchecks parent when sibling unchecked
- `getCompletionPercent` for leaf, partial, full trees
- `getOverallPercent` for empty, mixed lists
- `addMinutes` increments correctly, no-ops on missing id
- `addTask` at root and nested
- `deleteTask` removes node and descendants
- `findTask` returns correct node or null
- `parseTimeInput` handles all valid formats and invalid input
- `formatTime` handles 0, sub-hour, multi-hour values

---

## Out of Scope

- Drag-and-drop task reordering
- Task due dates / deadlines
- Syncing tasks across devices
- Keyboard shortcuts for the todo panel
- Exporting task list
