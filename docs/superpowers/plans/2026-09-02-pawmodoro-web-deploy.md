# Pawmodoro Web Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pawmodoro's existing renderer code deployable as a plain website on Vercel, by closing the two Electron-window-chrome assumptions that don't hold in a browser tab, and adding the one rewrite Vercel needs to find the app.

**Architecture:** `renderer/platform.js` gains a third branch (neither Capacitor nor Electron) providing a working `openExternal` and no-op minimize/close; a `body.web` class hides the now-irrelevant titlebar, mirroring the existing mobile-breakpoint pattern; a root-level `vercel.json` points `/` at `/renderer/index.html` — no files move, every existing relative path already resolves correctly once the repo root is served as-is.

**Tech Stack:** Vanilla JS (no bundler), static hosting on Vercel (zero-config, no build step — confirmed no `build` script exists in `package.json`).

**Spec:** [docs/superpowers/specs/2026-09-02-pawmodoro-web-deploy-design.md](../specs/2026-09-02-pawmodoro-web-deploy-design.md)

## Global Constraints

- No bundler — every script stays loadable via a plain `<script>` tag; no ES modules, no `import`/`require` in renderer code.
- Match existing code style exactly: `var` declarations, named `function` statements (no arrow functions).
- No files move and no existing relative path changes — the fix is additive only.
- Creating the actual Vercel project (account, GitHub connection, Framework Preset selection) is the user's own action outside this plan — this plan only produces the config a connected project needs.
- The full test suite (`npm test`) must stay at its current count (87/87) with zero regressions — this plan adds no new automated tests (pure environment-detection and static config, nothing to unit test).

---

### Task 1: Web-environment support and Vercel config

**Files:**
- Modify: `renderer/platform.js`
- Modify: `renderer/style.css`
- Create: `vercel.json`

**Interfaces:**
- Produces: `window.platformControls.openExternal(url)` now works (opens a new tab) in a plain browser, not just Electron/Capacitor. `document.body` gains a `web` class when running as a plain browser tab. Nothing else in this codebase currently depends on either — this is the final task in this plan.

- [ ] **Step 1: Add the web branch to `platform.js`**

Current (`renderer/platform.js`, full file):
```js
window.platformControls = window.Capacitor
  ? {
      minimize: function () {},
      close: function () {},
      openExternal: function (url) {
        window.Capacitor.nativePromise('Browser', 'open', { url: url })
      }
    }
  : window.windowControls
```

Replace with:
```js
window.platformControls = window.Capacitor
  ? {
      minimize: function () {},
      close: function () {},
      openExternal: function (url) {
        window.Capacitor.nativePromise('Browser', 'open', { url: url })
      }
    }
  : window.windowControls || {
      minimize: function () {},
      close: function () {},
      openExternal: function (url) {
        window.open(url, '_blank', 'noopener')
      }
    }

if (!window.Capacitor && !window.windowControls) {
  document.body.classList.add('web')
}
```

`window.windowControls` is only ever set by Electron's `preload.js` via `contextBridge` — its absence (alongside `window.Capacitor`'s absence) is exactly and only true in a plain browser tab, which is why both the fallback `platformControls` object and the `body.web` class use the same `!window.Capacitor && !window.windowControls` condition. `renderer/app.js`'s minimize/close button handlers and `renderer/todo.js`'s task-link `openExternal` call need no changes at all — they already call `window.platformControls.<method>()` and will now correctly hit this new branch's implementations instead of throwing on `undefined`.

- [ ] **Step 2: Hide the titlebar on web**

Current (`renderer/style.css`, the end of the "── Mobile layout (iOS) ───" section):
```css
/* ── Mobile layout (iOS) ──────────────────────── */

@media (max-width: 600px) {
  .titlebar { display: none; }
  .app-body { flex-direction: column; padding-top: env(safe-area-inset-top); }
  .timer-section { width: 100%; }
  .todo-panel { min-width: 0; border-left: none; border-top: 2px solid var(--black); }
}

/* ── Room panel ───────────────────────────────── */
```

Insert a new section between the two, so it reads:
```css
/* ── Mobile layout (iOS) ──────────────────────── */

@media (max-width: 600px) {
  .titlebar { display: none; }
  .app-body { flex-direction: column; padding-top: env(safe-area-inset-top); }
  .timer-section { width: 100%; }
  .todo-panel { min-width: 0; border-left: none; border-top: 2px solid var(--black); }
}

/* ── Web layout ───────────────────────────────── */

body.web .titlebar { display: none; }

/* ── Room panel ───────────────────────────────── */
```

(the last line shown is the pre-existing comment, included only to show placement — it already follows immediately after in the file, do not duplicate it)

Unlike the mobile breakpoint, this isn't inside a `@media` query — `body.web` is a JS-set class (from Step 1), not a viewport size, since "is this a browser tab" isn't something CSS alone can detect.

- [ ] **Step 3: Add the Vercel rewrite config**

Create `vercel.json` at the repository root:
```json
{
  "rewrites": [
    { "source": "/", "destination": "/renderer/index.html" }
  ]
}
```

This is the only configuration needed — every other file (`renderer/app.js`, `renderer/style.css`, `assets/*.gif`, the `MorningBreeze*.otf` font files, etc.) is already reachable at its natural existing path once the repo root is served as static files, because every reference to them elsewhere in the codebase is already a correctly-relative path (e.g. `renderer/index.html`'s `<img src="../assets/Cat Idle.gif">` and `renderer/style.css`'s `url('../MorningBreeze.otf')` both correctly resolve one directory up from `renderer/`, landing exactly on the real files at the repo root — verified by reading both files directly, not assumed).

- [ ] **Step 4: Manual verification**

Serve the repository root as static files locally (e.g. `python3 -m http.server` from the repo root) and open `http://localhost:<port>/renderer/index.html` directly in a real browser (a local static server won't apply the `vercel.json` rewrite itself, so browse to the `renderer/index.html` path explicitly for this local check — the rewrite only needs verifying once actually deployed on Vercel). Confirm: the titlebar (with its minimize/close buttons) is not visible. Add a task with a URL, confirm clicking it opens the link in a new browser tab instead of throwing a console error. Confirm the rest of the app — timer, settings, shared rooms, the Companion skin picker, the RevenueCat paywall — all still work exactly as they do today, since none of that code changed.

Once the user has connected this repository to a Vercel project (their own action, outside this plan) and it has deployed, confirm the same things again against the real `*.vercel.app` URL, and specifically confirm the root URL (`/`) itself loads the app (proving the `vercel.json` rewrite works, which a local static-file server can't verify on its own).

- [ ] **Step 5: Run the full test suite**

Run: `npm test` (or `npx jest --watchman=false --forceExit --runInBand` if it hangs — a known quirk in some sandboxed environments, unrelated to this change)

Expected: 87/87, unchanged — this task adds no new automated tests.

- [ ] **Step 6: Commit**

```bash
git add renderer/platform.js renderer/style.css vercel.json
git commit -m "feat: support running as a plain web deploy on Vercel"
```
