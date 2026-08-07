# Pawmodoro Rebrand — Design

## Purpose

Pawmodoro is a new, separate project forked from [kechappu](https://github.com/max-lopzzz/kechappu), extended with real-time shared study rooms and RevenueCat monetization (see the full Pawmodoro spec for the larger plan). This sub-project is the first step: rename the existing kechappu codebase to Pawmodoro with no functional changes, so later sub-projects (Supabase sync, shared rooms, monetization, new art) build on a correctly-branded, properly-licensed base.

## Scope

Pure renaming/metadata pass. No new features, no Supabase integration, no new art assets, no tagline (the current build is solo-only; the "focus together" tagline describes a feature that doesn't exist yet).

## Changes

1. **`package.json`**
   - `name`: `"kechappu"` → `"pawmodoro"`
   - `description`: updated to describe Pawmodoro
   - `productName`: `"Pawmodoro"` added — this is what Electron uses for the dock/menu app name, independent of the npm package name

2. **`renderer/index.html`**
   - `<title>` tag: `kechappu` → `Pawmodoro`

3. **`main.js`**
   - No change needed. It has no hardcoded name string; the icon path (`assets/icon.icns`) stays as-is per the decision to keep existing art. Dock name comes from `productName` in `package.json`.

4. **`README.md`**
   - Title: `# Pawmodoro`
   - Description rewritten for current (solo) feature set — no shared-rooms or tagline claims
   - Feature list unchanged (already accurate to current functionality)
   - "Run locally" / "Test" sections unchanged in substance
   - "Build" section: packager command and output path updated from `kechappu` to `pawmodoro`
   - **Credits** section keeps both: kechappu (max-lopzzz) as the base project, and catsupontop for the existing cat artwork — per the base spec's credits requirement

5. **`LICENSE`**
   - New file, MIT license
   - Copyright holder: `max-lopezzz` (local git identity)

6. **Git remote**
   - Left untouched in this sub-project. A new GitHub repo (e.g. `pawmodoro`) will be created separately; `origin` gets rewired to it once that URL exists. Not a file change, so not part of this implementation plan.

## Out of scope

Deferred to their own sub-projects (each gets its own spec/plan):
- Supabase project setup, schema, `@supabase/supabase-js` — first step of the "shared rooms + realtime sync" sub-project
- Icon/asset swap — only if/when new branding art is ready
- Tagline — added once shared rooms actually ship
- Any room, presence, or monetization code

## Testing

`npm test` should pass unchanged — this pass touches no logic, only names and metadata. Run it after the changes as verification.
