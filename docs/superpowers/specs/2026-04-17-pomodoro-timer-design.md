# Kawaii Cat Pomodoro Timer — Design Spec

**Date:** 2026-04-17  
**Stack:** Electron, vanilla HTML/CSS/JS (no bundler)  
**Platform:** macOS desktop, frameless window

---

## File Structure

```
pomodoro/
├── main.js              # Electron main process
├── preload.js           # IPC bridge (contextIsolation)
├── package.json
├── renderer/
│   ├── index.html
│   ├── app.js           # Timer logic, state, GIF mapping, sound
│   └── style.css
├── assets/              # Kawaii cat GIFs
└── MorningBreeze*.otf   # Font files
```

---

## Window

- Frameless `BrowserWindow`, ~420×580px, not resizable
- `contextIsolation: true`, `nodeIntegration: false`
- `preload.js` exposes two IPC calls only: `windowClose` and `windowMinimize`
- Window is draggable via a custom titlebar region (CSS `-webkit-app-region: drag`)

---

## UI Layout (top to bottom)

1. **Custom titlebar** — full-width drag region, minimize (`—`) and close (`×`) buttons top-right
2. **Ambient cat GIF** — centered, 180×180px, changes per timer state
3. **Session label** — e.g. `FOCUS`, `SHORT BREAK`, `LONG BREAK` — MorningBreeze-Light, small caps
4. **Timer display** — countdown (`25:00`) — MorningBreeze-Bold, ~72px
5. **Session dots** — 4 dots showing cycle progress (filled = completed session)
6. **Controls** — Start/Pause button + Reset button
7. **Settings icon** — `⚙` bottom-right corner, opens settings panel

---

## Color Palette

| Hex | Role |
|-----|------|
| `#FFFFFF` | Background |
| `#000000` | Text, borders |
| `#738122` | Work session accent (button, dot fill, label) |
| `#4A5CD0` | Break session accent (same roles during break) |
| `#C62A33` | Close button hover, Reset button, long break accent |

---

## Typography

- **MorningBreeze-Bold** — timer countdown
- **MorningBreeze** — buttons, session label
- **MorningBreeze-Light** — secondary text, settings labels
- **MorningBreeze-Italic** — decorative use if needed

All loaded via `@font-face` in `style.css` pointing to the `.otf` files at the project root.

---

## Timer Logic

### Sequence
1. Work session (default 25 min)
2. Short break (default 5 min)
3. Repeat steps 1–2 for N sessions (default 4)
4. Long break (default 30 min)
5. Repeat from step 1

### State Machine
```
idle → running → paused → complete → idle
```
- `idle` — timer shows full duration, not ticking
- `running` — countdown active, 1s interval
- `paused` — countdown frozen
- `complete` — triggers sound + celebration overlay, auto-advances to next session after 3.5s

### Session Types
- `work` — accented with `#738122`
- `short-break` — accented with `#4A5CD0`
- `long-break` — accented with `#C62A33`

---

## Cat GIF System

### Ambient GIF (always visible, changes per state)

| Timer state | GIF |
|-------------|-----|
| Idle (any session) | `Wake Up Art Sticker.gif` |
| Work / running | `Running.gif` |
| Work / paused | `Confused Wait What Sticker.gif` |
| Short break | `Cat Lick Sticker.gif` |
| Long break | `Cat Camping Sticker.gif` |

### Celebration Overlay (on session complete)
- Full-window semi-transparent overlay (`rgba(255,255,255,0.85)`)
- Centered GIF, randomly selected from:
  - `Cat Hooray Sticker.gif`
  - `Cat Party Sticker.gif`
  - `Happy Dance Sticker.gif`
  - `Standing Ovation Applause Sticker.gif`
  - `Cat Clap Sticker.gif`
  - `Table Clap.gif`
  - `Cat Wow Sticker.gif`
- Auto-dismisses after 3.5 seconds, or on click
- After dismissal, timer advances to the next session in `idle` state — user must press Start to begin it

---

## Sound

- Generated via **Web Audio API** — no audio files required
- A short two-tone chime plays once when a session completes
- Plays immediately before the celebration overlay appears

---

## Settings Panel

- Slides up from the bottom as an overlay (not a new window)
- Fields:
  - Work duration (min) — default 25
  - Short break duration (min) — default 5
  - Long break duration (min) — default 30
  - Sessions before long break — default 4
- **Save** — applies settings, resets timer to idle
- **Close (`×`)** — dismisses without saving
- Persisted via `localStorage` — survives app restarts

---

## Out of Scope

- Menu bar / tray icon
- Notifications (OS-level)
- Multiple themes
- Statistics / history tracking
