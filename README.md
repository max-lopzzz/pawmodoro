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
- **Shared rooms** — create or join a room by code to see who else is focusing, on a break, idle, or away (requires your own Supabase project — see below)
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
npx @electron/packager . --platform=darwin --arch=arm64 --out=dist --overwrite --icon=assets/icon.icns --ignore="^/ios" --ignore="^/www" --ignore="^/tests" --ignore="^/docs"
```

The app will be at `dist/Pawmodoro-darwin-arm64/Pawmodoro.app`.

## iOS

Requires full Xcode installed (not just Command Line Tools).

```bash
npm run sync:ios   # sync the web app into the Capacitor project (regenerates www/ and copies it into ios/App/App/public/)
npm run open:ios   # open the generated Xcode project
```

Then build and run the "App" target on an iPhone Simulator from within Xcode.

## Shared Rooms Setup

Shared rooms need your own free [Supabase](https://supabase.com) project:

1. Create a project, then run `supabase/schema.sql` in its SQL editor.
2. Enable Authentication → Providers → Anonymous Sign-Ins.
3. Fill in `renderer/supabase-config.js` with your project's URL and anon key (the anon key is meant to be public — it's protected by Row Level Security, not secrecy).

## Credits

Forked from [kechappu](https://github.com/max-lopzzz/kechappu) by max-lopzzz.

Cat artwork by @jaimeno.iso (Discord).

## License

MIT — see [LICENSE](LICENSE).
