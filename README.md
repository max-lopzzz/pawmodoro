# kechappu

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
npx @electron/packager . kechappu --platform=darwin --arch=arm64 --out=dist --overwrite --icon=assets/icon.icns
```

The app will be at `dist/kechappu-darwin-arm64/kechappu.app`.

## Credits

Cat stickers and artwork by [catsupontop](https://www.instagram.com/catsupontop).
