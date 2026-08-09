# Pawmodoro iOS Support via Capacitor — Design

## Purpose

Pawmodoro currently runs on macOS only, via Electron. This sub-project adds an iOS build without disturbing the working, already-shipped macOS build — it wraps the existing `renderer/` web codebase with Capacitor for iOS, while Electron continues to serve macOS exactly as it does today.

**Not required for the Shipaton submission.** The Next Gen category needs a working demo, public repo, and a RevenueCat-powered purchase — none of which require iOS. This is a parallel-track goal, not a submission blocker, and should not delay the shared-rooms / monetization sub-projects that the submission does depend on.

## Scope

Get the existing app running and usable on iPhone. Explicitly not a mobile redesign — see Out of Scope.

## Current State (relevant findings)

- Persistence is pure `localStorage` — portable as-is, no Electron-specific storage APIs.
- The only Electron-specific surface touching the renderer is `window.windowControls` (`close`, `minimize`, `openExternal`), exposed by `preload.js` via `contextBridge`, and called from two places: `renderer/app.js:314,318` and `renderer/todo.js:32`.
- The UI is a fixed-size desktop layout: a custom titlebar with drag region + minimize/close buttons, and a two-column body (`.timer-section` fixed at 420px, `.todo-panel` flexible, min 320px) — see `renderer/style.css:69-136,420-427`. This does not fit an iPhone screen as-is.
- `renderer/index.html` loads assets via relative paths that assume Electron's load context (`../assets/...`, resolved from `renderer/index.html` up to the repo-root `assets/` folder).
- Build environment check: this machine has Xcode Command Line Tools but not full Xcode (`xcodebuild` unavailable), so iOS builds cannot be run or verified here. Verification is deferred to the user once Xcode is installed.

## Architecture

Two native shells, one shared web core:

- **macOS:** unchanged. Electron continues to load `renderer/index.html` directly via `win.loadFile(...)`, exactly as today.
- **iOS:** Capacitor wraps a synced copy of the same `renderer/` code (plus `assets/`) as its web asset bundle, native-packaged via a generated `ios/` Xcode project.

No shared build step, no bundler introduced. The two platforms diverge only where platform-specific behavior is unavoidable (window chrome, external link handling), abstracted behind one new file.

## Design

### 1. Platform abstraction (`renderer/platform.js`, new)

A new script, loaded before `app.js`/`todo.js`, defines `window.platformControls` with the same shape as the existing `window.windowControls`:

```js
window.platformControls = window.Capacitor
  ? {
      minimize: () => {},
      close: () => {},
      openExternal: (url) => window.Capacitor.Plugins.Browser.open({ url })
    }
  : window.windowControls
```

- On Electron, `window.Capacitor` doesn't exist, so `platformControls` is just an alias for the existing `windowControls` bridge — zero behavior change.
- On Capacitor/iOS, `minimize`/`close` are no-ops (no window chrome to control on a full-screen mobile app), and `openExternal` uses Capacitor's official `@capacitor/browser` plugin to open links in the system browser.

`renderer/app.js:314,318` and `renderer/todo.js:32` change their `window.windowControls.X()` calls to `window.platformControls.X()` — the only edits to existing renderer logic.

### 2. Layout adaptation (`renderer/style.css`, additive media query)

```css
@media (max-width: 600px) {
  .titlebar { display: none; }
  .app-body { flex-direction: column; padding-top: env(safe-area-inset-top); }
  .timer-section { width: 100%; }
  .todo-panel { min-width: 0; border-left: none; border-top: 2px solid var(--black); }
}
```

This only activates below 600px viewport width, so desktop layout is untouched. `.todo-list` already has `overflow-y: auto` (`renderer/style.css:480-484`), so the column layout scrolls correctly with no further changes — the todo list scrolls internally beneath the fixed-height timer section, same pattern as desktop just rotated. Dark mode requires no separate rule: the border color resolves through `var(--black)`, which already flips per `body.dark`.

Scope boundary: this targets iPhone portrait. iPad and landscape are not specially handled — at wider Capacitor viewports the desktop titlebar would still render, but its buttons are harmless no-ops per the platform abstraction above, so nothing breaks, it's just not laid out specially.

### 3. Web asset sync for Capacitor (`scripts/sync-ios-www.js`, new)

Capacitor needs one self-contained web folder; the current `../assets/...` relative paths (correct for Electron's load context) would break if used directly. Rather than restructuring the repo, a small sync script builds a separate copy:

1. Clean and recreate `www/`
2. Copy `renderer/index.html`, `renderer/style.css`, `renderer/*.js` (including the new `platform.js`) into `www/`
3. Copy `assets/` into `www/assets/`
4. In the copied `www/index.html` only, rewrite `../assets/` → `assets/`

`www/` is a generated build artifact — git-ignored, same pattern as `dist/`. Electron's own load path (`renderer/index.html` in place, unmodified) is never touched by this script.

### 4. Capacitor project setup

- `capacitor.config.json` (new): `appId: "com.pawmodoro.app"`, `appName: "Pawmodoro"`, `webDir: "www"`
- `ios/` (new, generated by `npx cap add ios`): the native Xcode project. Committed to git — standard Capacitor practice, since it can carry project-specific configuration (entitlements, Info.plist) a developer may hand-edit later.
- `package.json`: add `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/browser` as dependencies; add `sync:ios` (runs the sync script + `npx cap sync ios`) and `open:ios` (runs `npx cap open ios`) scripts.

## Out of Scope

Deferred to later sub-projects or follow-up polish, not part of this pass:

- RevenueCat/monetization SDK integration and per-platform SDK choice (the eventual monetization sub-project will need to pick a platform-appropriate RevenueCat SDK — native iOS via a Capacitor plugin vs. the web SDK already planned for Electron — but no monetization code exists yet, so this is purely a future consideration)
- Supabase shared-rooms code (doesn't exist yet; when built, it's plain JS/fetch/WebSocket and should work unmodified in a Capacitor webview, but that's for its own sub-project to confirm)
- Custom iOS app icon set — ships with Capacitor's default placeholder icon for now; the existing `assets/icon.icns` is macOS-only and can't be reused directly for iOS's PNG icon set
- iPad and landscape-specific layout
- Actually building, running, or visually verifying the iOS app in Simulator or on-device — blocked on the user installing full Xcode (only Command Line Tools are present on this machine). The implementation plan will hand off exact verification commands for the user to run once Xcode is available.

## Testing

- `npm test` (existing Jest suite) must continue passing unchanged — this sub-project doesn't touch `timer-logic.js`/`todo-logic.js` business logic, only the two call-site swaps in `app.js`/`todo.js` and the new `platform.js`.
- macOS regression check: `npm start` should still launch Electron exactly as before, using `window.windowControls` via the new `platformControls` alias — confirms the abstraction didn't change Electron behavior.
- iOS verification (deferred, manual, post-Xcode-install): `npm run sync:ios` then `npm run open:ios` to open the generated Xcode project, build for the iOS Simulator, and confirm the app launches, the timer/todo UI is usable in the mobile layout, and external links open via `openExternal`.
