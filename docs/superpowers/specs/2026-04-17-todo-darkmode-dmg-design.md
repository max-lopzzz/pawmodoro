# Todo List + Dark Mode + DMG Packaging — Design Spec

**Date:** 2026-04-17
**Builds on:** Kawaii Cat Pomodoro Timer (existing app)

---

## Overview

Three features added to the existing Electron pomodoro app:

1. **Todo list** — linked task panel with subtasks, % completion per task, overall %, and automatic pomodoro time logging. (Full spec already exists at `2026-04-17-todo-list-design.md`; carried forward unchanged.)
2. **Dark mode** — follows system `prefers-color-scheme` by default; user can override to Auto / On / Off via a settings select.
3. **DMG packaging** — `electron-builder` produces a drag-to-Applications `.dmg` via `npm run dist`.

---

## 1. Todo List

See [`2026-04-17-todo-list-design.md`](2026-04-17-todo-list-design.md) for the full spec. No changes.

Key points:
- Panel expands window 420→740px rightward
- Infinite subtask nesting; checkbox propagates up/down
- % completion per task = checked leaves / total leaves
- Overall % = all checked leaves / all leaves
- Completed work sessions log minutes to the active task automatically

---

## 2. Dark Mode

### Color Palette

| CSS Token | Light value | Dark value |
|-----------|-------------|------------|
| `--white`  | `#FFFFFF`   | `#1A1A1A`  |
| `--black`  | `#000000`   | `#F0F0F0`  |
| `--red`    | `#C62A33`   | `#E8434E`  |
| `--accent` | `#738122`   | `#95A82B`  |

### State Logic

- **On page load:** read localStorage key `theme-override`
  - `"dark"` → force dark, ignore system
  - `"light"` → force light, ignore system
  - absent → follow `window.matchMedia('(prefers-color-scheme: dark)')` and attach a live listener for system changes
- **On toggle:** write chosen value to `theme-override` (or remove key for Auto), detach/reattach system listener accordingly

### Toggle UI

A new row in the existing settings panel:

```
Dark mode   [Auto ▾]
```

Implemented as a `<select>` with three options: `Auto`, `On`, `Off`. Consistent with the existing settings input style.

### Implementation Surface

| File | Change |
|------|--------|
| `renderer/style.css` | Add `body.dark { }` block redefining the four CSS vars |
| `renderer/app.js` | Add `initTheme()` (called at load) and `applyTheme(mode)` |
| `renderer/index.html` | Add dark-mode select row to settings panel |

No new files needed.

---

## 3. DMG Packaging

### Tool

`electron-builder` added as a devDependency.

### `package.json` additions

```json
"scripts": {
  "dist": "electron-builder --mac dmg"
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
}
```

### Usage

```
npm run dist
```

Produces `dist/Kawaii Pomodoro-1.0.0.dmg`. No code signing required for personal use. macOS Gatekeeper will prompt on first open; dismissed via right-click → Open.

---

## Out of Scope

- Code signing / notarization
- Auto-updater
- Windows / Linux builds
- Custom DMG background image
- Dark mode scheduled switching (e.g. sunrise/sunset)
