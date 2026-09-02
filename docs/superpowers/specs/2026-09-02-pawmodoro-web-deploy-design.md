# Pawmodoro Web Deploy — Design

## Purpose

Make Pawmodoro reachable as a plain website, hosted on Vercel, in addition to the existing Electron (macOS) and Capacitor (iOS) targets. The renderer/ codebase is already platform-agnostic vanilla JS — this is not a new implementation, it's closing the last few Electron-specific gaps and standing up the hosting.

## Constraints

- **No bundler, no build step, no restructuring of existing files.** `renderer/index.html`'s and `renderer/style.css`'s relative paths (`../assets/...`, `../MorningBreeze*.otf`) already resolve correctly if the repository root is served as-is — confirmed by tracing every reference, not assumed. Deploying the repo root directly, with a single rewrite pointing `/` at `/renderer/index.html`, requires moving zero files.
- **Vercel account creation and the GitHub-repo connection are the user's own action** — third-party account creation is never done on the user's behalf. This plan produces the config a connected Vercel project needs; the actual "sign up and import the repo" step happens outside this session.
- Hosted at Vercel's free default subdomain (`*.vercel.app`) for now — no custom domain purchase or DNS work in scope.
- Reuses the existing Supabase and RevenueCat integrations exactly as they already work on Electron/Capacitor — both are already web-first SDKs (`@supabase/supabase-js`, `@revenuecat/purchases-js`, the RevenueCat Web Billing SDK), so no code changes are needed there. The committed Supabase anon key and RevenueCat test-mode publishable key are already safe to serve publicly (same trust model as any client-side web app).
- Follows this codebase's established conventions: `var` declarations, named `function` statements, no ES modules.

## The gap being closed

`renderer/platform.js` currently only branches two ways:
```js
window.platformControls = window.Capacitor
  ? { minimize, close, openExternal: <Capacitor Browser plugin> }
  : window.windowControls  // only ever set by Electron's preload.js via contextBridge
```
In a plain browser — neither Capacitor nor Electron — `window.windowControls` is `undefined`, so `window.platformControls` is `undefined`. Three real, load-bearing call sites dereference it: `renderer/app.js`'s minimize/close button handlers, and `renderer/todo.js`'s task-link "open external URL" handler. All three would throw the first time a user touched them on a web deploy — verified by reading every call site directly, not assumed. This must be fixed, not routed around.

## Architecture

Three small, additive pieces:

1. **`renderer/platform.js`** gains a third branch: when neither `window.Capacitor` nor `window.windowControls` exists, `platformControls` becomes `{ minimize: no-op, close: no-op, openExternal: window.open(url, '_blank', 'noopener') }`. Minimize/close are no-ops because a browser tab has no window chrome for this app to control; `openExternal` gets a real, working implementation instead of inheriting `undefined`.
2. **The titlebar becomes irrelevant on web**, not just non-functional — it exists to host window-drag and minimize/close controls that don't apply to a browser tab. `platform.js` also stamps `document.body.classList.add('web')` in that same third branch, and `renderer/style.css` gains `body.web .titlebar { display: none }`, mirroring the pattern the existing mobile breakpoint already uses (`.titlebar { display: none }` under `@media (max-width: 600px)`) — same technique, different trigger (a JS-detected environment instead of a screen-size query, since "is this a browser tab" isn't a viewport property).
3. **A `vercel.json`** at the repo root with a single rewrite (`/` → `/renderer/index.html`) is the entire hosting configuration — everything else Vercel needs (serve static files, no build step) it infers correctly on its own once the project's Framework Preset is left as the default static-site detection (a one-time choice the user makes when connecting the repo in Vercel's own UI, not something committed to the repo).

## Data Flow

No data flow changes — Supabase auth, Realtime rooms, and RevenueCat purchases all already work identically across Electron and Capacitor because both are webviews running this exact renderer code against the same public keys. A plain browser tab is a third webview with no meaningfully different behavior for any of that; this design's only job is removing the two Electron-window-chrome assumptions that don't hold in a tab.

## File Structure

- `renderer/platform.js` (modified) — third branch for the plain-web case, described above.
- `renderer/style.css` (modified) — `body.web .titlebar { display: none }`.
- `vercel.json` (new, repo root) — the single rewrite rule.

## Out of Scope

- Updating `README.md` with the live web URL — the actual `*.vercel.app` address isn't known until the user connects the Vercel project themselves, after this plan's code ships; adding it is a trivial one-line follow-up at that point, not part of this implementation plan.
- Custom domain / DNS configuration.
- Any change to how Supabase or RevenueCat are configured — both already work as-is.
- A CI/CD pipeline beyond what Vercel's own GitHub integration already provides (auto-deploy on push) — that comes for free once the user connects the repo, nothing to build.
- Feature-detecting or gating anything based on being a web deploy specifically (no "web-only" or "web-excluded" features) — Pawmodoro behaves identically everywhere except the window-chrome differences already described.

## Testing

- No new pure logic to unit test — this is entirely environment-detection and static hosting configuration.
- Manual verification, since this touches DOM/environment branching the same way `renderer/platform.js`'s existing Capacitor branch is verified: open the deployed site in a real browser and confirm the titlebar is hidden, confirm a task's external link opens correctly in a new tab, confirm shared rooms and the RevenueCat paywall work exactly as they do in the Electron app (same public keys, same backend).
- This is the user's own action once the Vercel project is connected and deployed — no automated environment in this project has ever been able to exercise a live browser against real Supabase/RevenueCat infrastructure end-to-end without the user's involvement, consistent with every prior feature in this project's history.
