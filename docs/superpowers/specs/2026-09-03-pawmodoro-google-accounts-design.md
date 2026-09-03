# Pawmodoro Google Accounts — Design

## Purpose

Replace anonymous-only Supabase auth with mandatory Google sign-in, so a `pawmodoro_pro` purchase is tied to a real, durable identity instead of an anonymous session that's lost the moment local storage is cleared. The app becomes unusable — including the free solo timer — until the user signs in.

## Constraints

- **Mandatory from app launch**, not just around the purchase — confirmed with the user despite the larger scope this implies (every existing free-tier flow now sits behind a login screen).
- **Google only for now** — no Apple Sign In (would need a paid Apple Developer Program membership and more setup than this sub-project's scope), no email/password, no magic link.
- **The user creates all third-party credentials themselves** — the Google Cloud Console OAuth Client ID/Secret, entering them into Supabase's Auth provider settings, and registering the app's redirect URL in Supabase's dashboard are all the user's own actions, never done on their behalf. This plan produces the code that consumes those credentials, not the credentials themselves.
- **Verified against the real SDK, not assumed:** `supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } })` returns `{ data: { url }, error }` without navigating anywhere when `skipBrowserRedirect` is `true` (confirmed in `@supabase/auth-js`'s shipped type definitions and doc comments) — this is what lets a non-web app control how the OAuth URL gets opened. `supabase.auth.exchangeCodeForSession(code)` completes the flow once the app has the `code` query parameter back. `User.is_anonymous` is a real, documented boolean field on Supabase's session user object (confirmed in the shipped types) — this is how the app tells a real Google-authenticated user apart from the old anonymous-session model.
- **Google Cloud Console's Authorized Redirect URI is Supabase's own fixed callback URL** (`https://<project-ref>.supabase.co/auth/v1/callback`), **not** the app's custom URL scheme — Google's OAuth client only accepts real HTTPS URLs there. The custom scheme (`pawmodoro://auth-callback`) is registered separately, in Supabase's own dashboard "Redirect URLs" allowlist; Supabase performs the second hop from its callback to that scheme after Google's redirect completes.
- **No packaging setup exists yet** — this app has only ever run via `npm start` (`electron .`), never been built into a distributable `.app`. Registering a custom URL scheme (`app.setAsDefaultProtocolClient`) works far more reliably for a packaged, signed app than for an unpackaged dev run — this is a real risk to the live-testing story for this feature, not just extra work.
- Follows this codebase's established conventions: `var` declarations, named `function` statements, no bundler, no ES modules.
- **Correction found during implementation (superseding this section's original plan):** the iOS deep-link listener does not vendor `@capacitor/app`'s own `dist/plugin.js` — that file is genuinely broken outside a native context (throws `ReferenceError: capacitorExports is not defined` when loaded via a plain `<script>` tag, since it expects `@capacitor/core`'s own `dist/capacitor.js` to have already run and defined that global, a file this project never ships). Instead, `renderer/auth.js` calls `window.Capacitor.addListener('App', 'appUrlOpen', callback)` directly — a real primitive of the native bridge iOS injects into the WebView (confirmed in `@capacitor/ios`'s shipped `native-bridge.js`), the exact sibling of `renderer/platform.js`'s existing `window.Capacitor.nativePromise('Browser', 'open', ...)` call. No `@capacitor/app` dependency needed.

## Architecture

Five pieces, each addressing one link in the OAuth chain:

1. **`main.js`** (Electron's main process, untouched all session until now) registers `pawmodoro` as a custom URL scheme (`app.setAsDefaultProtocolClient('pawmodoro')`) and listens for macOS's `open-url` event, forwarding the received URL to the renderer over a new IPC channel.
2. **`preload.js`** exposes that channel through `contextBridge`, alongside the existing `windowControls` object — a small addition, not a new pattern.
3. **A new `renderer/auth.js`** owns the whole sign-in flow: kicking off `signInWithOAuth`, opening the returned URL via the already-existing `window.platformControls.openExternal()` (no new "open a link" mechanism needed — this reuses the exact function the web-deploy and Capacitor work already built out), receiving the deep-link callback (from `main.js` via the new IPC channel, or on iOS via `window.Capacitor.addListener('App', 'appUrlOpen', ...)` — Capacitor's own native-bridge primitive, needing no vendored plugin package; see the corrected Constraints note above), extracting the `code`, and calling `exchangeCodeForSession`.
4. **A new full-screen sign-in view** in `renderer/index.html`/`app.js`, shown instead of the timer whenever no real (`!user.is_anonymous`) session exists — checked once at boot, before any other UI initializes.
5. **`renderer/rooms.js`'s `ensureAnonSession()` is replaced** by a simpler `getSession()` that reads the session already established at boot — once login is mandatory, no code path ever needs to lazily create a session anymore, so the fallback-to-`signInAnonymously()` logic this function exists for today becomes dead weight. All 4 existing call sites (`renderer/app.js` ×2, `renderer/rooms.js` ×2) switch to the new function.

## Data Flow

- On boot, before `render()` or any panel initializes: call `supabase.auth.getSession()`. If there's no session, or `session.user.is_anonymous` is `true`, show the sign-in view and stop — nothing else in the app runs yet.
- Sign-in view's "Sign in with Google" button: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'pawmodoro://auth-callback', skipBrowserRedirect: true } })` → take the returned `url` → `window.platformControls.openExternal(url)`, opening it in the system browser.
- The system browser completes Google's consent flow, Google redirects to Supabase's fixed callback URL, Supabase redirects a second time to `pawmodoro://auth-callback?code=...`.
- The OS hands that URL to the app: on Electron, via `main.js`'s `open-url` listener → IPC → `renderer/auth.js`; on Capacitor iOS, via `window.Capacitor.addListener('App', 'appUrlOpen', ...)` directly in `renderer/auth.js` (Capacitor's own native-bridge primitive, no IPC and no vendored plugin package needed there — Capacitor delivers it straight to the webview). Either path ends at the same handler: extract `code` from the URL's query string, call `supabase.auth.exchangeCodeForSession(code)`, and on success, re-run the boot check — this time `is_anonymous` is `false`, so the sign-in view is replaced by the normal app.
- Because Supabase's client already persists sessions to `localStorage` on its own (the exact mechanism the anonymous session already relied on all session), a signed-in user stays signed in across restarts with no extra persistence code.
- `renderer/rooms.js`'s new `getSession()` simply returns the session object captured at boot — every caller that used to `.then(function (session) { ... session.user.id ... })` off `ensureAnonSession()` keeps the same shape, just backed by a real user now instead of an anonymous one.

## UI

A new full-screen view (structurally similar to the existing settings/room panels, but with no close affordance and shown instead of — not on top of — the timer) with the app's mascot, a short line of copy, and a single "Sign in with Google" button. No password field, no alternative sign-in method, nothing else on the screen. If `exchangeCodeForSession` fails, a small error line appears below the button (matching the existing `room-error` text-and-clear pattern), and the button stays clickable for a retry.

## File Structure

- `main.js` (modified) — protocol registration, `open-url` listener, IPC forwarding.
- `preload.js` (modified) — expose the deep-link IPC channel via `contextBridge`.
- `renderer/auth.js` (new) — the sign-in flow described above; owns the boot-time session check.
- `renderer/index.html` (modified) — the new sign-in view's markup; script tag for `auth.js`.
- `renderer/style.css` (modified) — styling for the sign-in view.
- `renderer/app.js` (modified) — the two `ensureAnonSession()` call sites switch to `getSession()`; boot sequence gates on the sign-in check before initializing the rest of the app; a new "Sign out" button in the Settings panel calls `supabase.auth.signOut()` and returns to the sign-in view.
- `renderer/rooms.js` (modified) — `ensureAnonSession()` removed, replaced by `getSession()`; its two call sites updated.
- No `package.json` changes — the iOS deep-link listener uses Capacitor's native-bridge `window.Capacitor.addListener` primitive directly, needing no new dependency (see the corrected Constraints note above).

## Out of Scope

- Apple Sign In, email/password, or any auth method besides Google.
- Windows/Linux deep-link handling (`second-instance` + `requestSingleInstanceLock`) — this app's `README`/`package.json` already scope it to macOS; only macOS's `open-url` event is implemented.
- Actually packaging the app into a distributable `.app` — flagged as a real risk to testability, but building out `electron-builder`/`electron-packager` config is its own separate effort, not bundled into this one.
- Migrating or preserving any data tied to a user's old anonymous session (tasks/settings already live in `localStorage`, untouched by this change; any past anonymous-session room history or entitlement tied to the old anonymous ID is not carried forward — a genuinely new identity going forward).
- Any change to how RevenueCat is configured — `Purchases.configure(apiKey, userId)` already takes whatever `userId` it's given; a real Google-backed Supabase user ID flows through exactly the same call, no RevenueCat-side change needed.

## Testing

- No new pure logic to unit test — this is OAuth flow, IPC, and native config wiring end to end.
- Manual, live verification is the primary and only real test here, and it's larger than any prior feature's: it requires the user's own Google Cloud Console + Supabase dashboard configuration to exist before any of it can even be attempted, and (per the packaging risk noted above) may need the app packaged rather than run via `npm start` before the deep-link round-trip works reliably at all.
- Live verification steps once configured: launch the app fresh (or after `localStorage.clear()`) — confirm the sign-in view appears instead of the timer; click "Sign in with Google" — confirm the system browser opens to Google's consent screen; complete it — confirm the app itself receives focus again and shows the normal timer, not the sign-in view; quit and relaunch — confirm the session persists and the sign-in view does not reappear; test "Sign out" in Settings — confirm it returns to the sign-in view; create a room and check `pawmodoro_pro` gating still work correctly with the new session type.
