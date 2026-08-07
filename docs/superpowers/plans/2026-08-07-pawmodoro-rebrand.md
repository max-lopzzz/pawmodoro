# Pawmodoro Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the kechappu codebase to Pawmodoro across all app metadata, docs, and licensing, with zero functional/behavioral changes.

**Architecture:** This is a metadata-only pass — no application logic changes. Three independent file groups get touched: (1) app identity (`package.json`, `renderer/index.html`), (2) `README.md`, (3) a new `LICENSE` file. Each is testable/verifiable on its own via grep and the existing `npm test` suite.

**Tech Stack:** Electron (existing), Jest (existing test runner) — no new dependencies.

## Global Constraints

- No functional or behavioral changes — this pass only touches names, text, and metadata.
- `npm test` must pass after every task (existing suite, unmodified).
- Existing assets (`assets/icon.icns`, all GIFs) are untouched — no new art in this sub-project.
- README Credits section must retain: kechappu (max-lopzzz) as base project credit, and catsupontop for existing cat artwork — per the base Pawmodoro spec's credits requirement.
- Git remote (`origin`) is left untouched — out of scope for this plan.
- No tagline, no shared-rooms language anywhere — those features don't exist yet.

---

### Task 1: Rename app identity (package.json + window title)

**Files:**
- Modify: `package.json`
- Modify: `renderer/index.html:6`

**Interfaces:**
- Produces: `package.json` `name: "pawmodoro"`, `productName: "Pawmodoro"` — later tasks (README build instructions) reference these exact strings.

- [ ] **Step 1: Update `package.json`**

Replace the full contents of `package.json` with:

```json
{
  "name": "pawmodoro",
  "productName": "Pawmodoro",
  "version": "1.0.0",
  "description": "A kawaii Pomodoro timer for macOS.",
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

- [ ] **Step 2: Update the window title**

In `renderer/index.html`, change line 6 from:

```html
  <title>kechappu</title>
```

to:

```html
  <title>Pawmodoro</title>
```

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: PASS, same result as before this change (this task touches no logic).

- [ ] **Step 4: Verify no stray references remain in these two files**

Run: `grep -in kechappu package.json renderer/index.html`
Expected: no output (empty match).

- [ ] **Step 5: Commit**

```bash
git add package.json renderer/index.html
git commit -m "rebrand: rename app identity from kechappu to Pawmodoro"
```

---

### Task 2: Rewrite README.md

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `productName` from Task 1 (`Pawmodoro`) for the title; the packager output naming convention already used by kechappu's README (`<name>-darwin-arm64/<name>.app`).
- Produces: none consumed by later tasks in this plan.

- [ ] **Step 1: Replace the full contents of `README.md`**

```markdown
# Pawmodoro

A kawaii Pomodoro timer for macOS. Stay focused with the help of a very supportive cat.

## Features

- **Pomodoro timer** — work sessions, short breaks, and long breaks with configurable durations
- **Cat GIFs** — ambient cat reacts to your timer state; celebration overlay when a session completes
- **To-do panel** — tasks with subtasks, time estimates, logged time, and completion tracking
- **Task-linked timer** — selecting a task with an estimate sets the timer to the remaining time automatically
- **Media links** — attach a URL to any task; YouTube and image links show a preview inline, all others show a favicon chip
- **Drag to reorganize** — reorder and reparent tasks by dragging
- **Resizable window** — drag to any size; timer column stays fixed, to-do panel expands
- **Dark mode** — auto, on, or off — persists across restarts
- **Chime** — a soft two-tone sound plays when a session completes
- All settings and tasks persist locally across restarts

## Run locally

```bash
npm install
npm start
```

## Test

```bash
npm test
```

## Build

```bash
npx @electron/packager . pawmodoro --platform=darwin --arch=arm64 --out=dist --overwrite --icon=assets/icon.icns
```

The app will be at `dist/pawmodoro-darwin-arm64/pawmodoro.app`.

## Credits

Forked from [kechappu](https://github.com/max-lopzzz/kechappu) by max-lopzzz.

Cat stickers and artwork by [catsupontop](https://www.instagram.com/catsupontop).

## License

MIT — see [LICENSE](LICENSE).
```

- [ ] **Step 2: Verify no stray references remain**

Run: `grep -in kechappu README.md`
Expected: exactly one match, the "Forked from kechappu" credits line. No other occurrences.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for Pawmodoro"
```

---

### Task 3: Add MIT LICENSE

**Files:**
- Create: `LICENSE`

**Interfaces:**
- Consumes: none.
- Produces: `LICENSE` file referenced by `README.md`'s License section (Task 2).

- [ ] **Step 1: Create `LICENSE`**

```text
MIT License

Copyright (c) 2026 max-lopezzz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Verify the file exists and matches**

Run: `test -f LICENSE && head -3 LICENSE`
Expected:
```
MIT License

Copyright (c) 2026 max-lopezzz
```

- [ ] **Step 3: Commit**

```bash
git add LICENSE
git commit -m "docs: add MIT LICENSE"
```

---

### Task 4: Final verification pass

**Files:** none created or modified — verification only.

**Interfaces:**
- Consumes: all outputs of Tasks 1–3.

- [ ] **Step 1: Confirm no unintended "kechappu" references remain anywhere in the repo**

Run: `grep -ril kechappu . --include="*.js" --include="*.json" --include="*.html" --include="*.md" | grep -v node_modules`
Expected: only `README.md` (the intentional "Forked from kechappu" credits line).

- [ ] **Step 2: Run the full test suite one more time**

Run: `npm test`
Expected: PASS, identical results to the pre-rebrand baseline.

- [ ] **Step 3: Start the app to confirm it launches with the new name**

Run: `npm start`
Expected: app window opens; check the dock/window title reads "Pawmodoro" (not "kechappu"). Quit the app after confirming.

- [ ] **Step 4: Commit (if step 1 required any fix)**

If Step 1 found and required fixing any stray reference:

```bash
git add -A
git commit -m "rebrand: fix remaining kechappu reference"
```

If Step 1 found nothing to fix, skip this commit — Tasks 1–3 already committed everything.
