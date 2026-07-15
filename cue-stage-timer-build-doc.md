# Cue — Stage Timer for Windows

**Working name:** Cue *(swappable — alternatives: Cuepoint, Runline, Beam, OnStage)*
**One line:** A lightweight Windows desktop app to run a program from your laptop and project a clean timer + title + messages to a second monitor over HDMI — EasyWorship's operator/output model, but for time.

---

## 0. TL;DR — Decisions & the "test today" path

| Decision | Choice | Why |
|---|---|---|
| Framework | **Electron + Vite + React + TypeScript** | Multi-window is trivial (`new BrowserWindow`), only needs Node (no Rust/build tools), massive training data so a cheaper OpenRouter model can execute it reliably in your window. |
| State model | **Main process = source of truth**, broadcasts to both windows | One authoritative clock, no two-window drift. |
| Styling | **Tailwind** | You already know it; keeps deps lean. |
| Store | **Zustand** in renderer for UI, main holds timer state | Minimal, no boilerplate. |
| Scaffold | **electron-vite** starter (`@quick-start/electron`) | Wires main/preload/renderer + electron-builder out of the box. |
| Packaging | **electron-builder → NSIS `.exe`** | One-click install on Windows. |

> **Lightweight honesty box:** Electron ships a ~80–120 MB installer and uses ~100 MB RAM. For a church-media laptop that's a non-issue. If you later want a *tiny* build (~5–10 MB), the same UI ports to **Tauri v2** — see §Technical/Migration. Don't do Tauri today: the Rust toolchain setup will eat your 2 hours.

**Test-today reality:** Get it running with `npm run dev` and drag the display window to your projector. That's a full working demo. Building the signed installer is a *later* task — don't let it block your test.

---

# PART 1 — FEATURE LIST

## 1A. MVP — ship & test today (mapped to your asks)

| # | Feature | Your ask it satisfies |
|---|---|---|
| 1 | **Dual window**: Control (operator, your laptop screen) + Display (fullscreen output) | The EasyWorship-style control→output split |
| 2 | **Monitor picker + auto-place**: detect displays, send output fullscreen to the HDMI monitor | Project to secondary display |
| 3 | **Countdown timer**: big mm:ss, Start / Pause / Reset, +1m / −1m nudge | Core timer |
| 4 | **Program rundown**: ordered list of segments, each with **title + allocated duration**; Load / Next | "Schedule the entire program and time allocated" |
| 5 | **Session title on display**: current segment title shown big on output | "Person sees what session this is + the title" |
| 6 | **Flash message**: type/pick a message, it pops on the display (pulse animation), auto or manual clear | "Add flash messages" |
| 7 | **Custom persistent message**: a banner/lower-third you toggle on/off | "Have custom messages" |
| 8 | **Visual states**: normal → **warning** (amber, e.g. last 20%) → **overtime** (red, keeps counting negative) | Speaker actually sees urgency |
| 9 | **Blackout**: instantly clear the output to black | Operator control |
| 10 | **Time of day** shown small in the corner of the display | Keeps the room on schedule |

## 1B. High-value additions — ranked (add if time allows)

1. **Auto-computed start times** — set program start (e.g. 10:00), each segment shows its scheduled clock time from the durations. Single most useful "keep the service on time" feature.
2. **Keyboard shortcuts** — Space = start/pause, R = reset, N = next, F = flash, B = blackout. Operators live on the keyboard.
3. **Quick-message presets** — one-click buttons: "Wrap up", "2 min left", "Time's up", "We'll start soon".
4. **Progress bar / ring** on the display so remaining time reads even without the digits.
5. **Save / load program** to a `.json` file (and auto-restore last program on launch).
6. **Auto-advance** — when a segment hits 0, optionally load the next cue automatically.
7. **Count-up (stopwatch) mode** and **clock-only mode** for the display.
8. **Customization panel** — output colors, digit size, warning threshold %, show/hide title / clock / progress / message.

## 1C. Later / v2 (park these)

- Multiple output "rooms" / independent timers.
- Remote control from a phone on the same Wi‑Fi (local web server).
- Speaker notes / next-item preview (confidence-monitor mode).
- Themes / saved looks. Import agenda from CSV. Sound/chime cues.

---

# PART 2 — CREATIVE & DESIGN

## 2A. Product concept
Two surfaces, one brain. The **operator** never appears on screen; the **audience/speaker** only ever sees a calm, high-contrast output. Everything the operator does (load a segment, fire a message, blackout) reflects on the output instantly. Design priority for the output = **readable from the back of a hall or from stage**, in a dark room, on a possibly-dim projector.

## 2B. The two windows

**Display (output) — projection-safe layout**
```
┌─────────────────────────────────────────────┐
│  SESSION TITLE                     10:42 AM   │  title left · clock right
│                                               │
│                                               │
│                  12:45                        │  GIANT timer, centered
│                                               │
│                                               │
│  ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  progress bar
│  ┌───────────────────────────────────────┐   │
│  │  Please begin to wrap up              │   │  message (lower third / overlay)
│  └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Control (operator)**
```
┌── RUNDOWN ─────────┬──── TIMER ────────────┬── MESSAGES ─────────┐
│ ▸ Welcome    5:00  │      Welcome          │ [ Wrap up ]         │
│   Worship   20:00  │       12:45           │ [ 2 min left ]      │
│   Sermon    35:00  │  ⏵  ⏸  ⏹   +1m  −1m   │ [ Time's up ]       │
│   Altar     10:00  │  [ Load ]  [ Next → ] │ ____________  Send  │
│ + add segment      │                       │ ☐ keep on screen    │
│                    │  state: ● NORMAL      │ [ BLACKOUT ]        │
├────────────────────┴───────────────────────┴─────────────────────┤
│ Starts 10:00 · Total 1:10:00 · Output → Monitor 2 ▾ · ⛶ Fullscreen │
└───────────────────────────────────────────────────────────────────┘
```

## 2C. Display design spec
- **Background:** true black `#000` (projectors love black; saves the room's eyes).
- **Timer digits:** near-white `#F5F5F5`, **tabular numerals** so the width never jitters (`font-variant-numeric: tabular-nums`). Size with viewport units, e.g. `font-size: clamp(8rem, 22vw, 30rem)` so it fills any projector resolution.
- **Colour states:**
  - Normal → white digits (optional subtle green tint).
  - Warning (default: remaining ≤ 20% of segment) → **amber `#F5A524`**.
  - Overtime (past 0) → **red `#E5484D`**, timer keeps counting **up** with a leading `−`.
- **Title:** condensed uppercase, top-left, ~4vw.
- **Clock:** top-right, muted grey, small.
- **Message:** slides up as a lower third; **flash** style pulses opacity 2–3× then holds or auto-clears after N seconds.
- **Hide the cursor** on the display window; no scrollbars; nothing interactive.

## 2D. Control design spec
Three columns: **Rundown | Timer+Transport | Messages**, plus a **status footer** (program start, running total, active monitor, fullscreen toggle). Dark UI to match the room. Big, obvious transport buttons — an operator glances, doesn't read.

## 2E. Typography / motion
- UI + title: **Inter** (has tabular figures). Digits: Inter tabular, or a condensed face if you want more drama.
- Motion budget is tiny: message pulse, state colour cross-fade (~150ms), blackout is instant. Nothing else moves.

## 2F. Customization surface (his "customize a lot")
Expose in a Settings drawer: output background & digit colour, warning threshold %, overtime on/off, digit scale, and show/hide toggles for **title / clock / progress bar / message**. Store settings alongside the program JSON.

---

# PART 3 — TECHNICAL

## 3A. Architecture
```
 Main process (Node)  ── authoritative timer + monitor mgmt + IPC router
   │  broadcasts  state:update  (200ms while running)
   ├──────────────► Control window  (renderer, #control)  ── sends commands
   └──────────────► Display window  (renderer, #display)  ── pure presentation
```
- **One renderer bundle.** `App` reads `location.hash`: `#control` renders `<Control/>`, `#display` renders `<Display/>`. Main loads the same URL into both windows with different hashes. (Simplest reliable multi-window pattern in Electron+Vite — no multi-entry build config to get wrong.)
- **Main owns the clock.** Commands come in via IPC, main mutates state, ticks every ~200ms while running, broadcasts a full snapshot to both windows via `webContents.send('state:update', snapshot)`.

## 3B. Data models (TypeScript)
```ts
type Cue = {
  id: string;
  title: string;
  durationMs: number;     // allocated time
  autoAdvance?: boolean;
};

type Program = {
  name: string;
  startTimeOfDay?: string; // "10:00" → compute scheduled starts
  cues: Cue[];
};

type TimerMode = 'countdown' | 'countup' | 'clock';

type TimerState = {
  mode: TimerMode;
  running: boolean;
  endTimestamp: number | null;     // Date.now()+remaining, for countdown
  startTimestamp: number | null;   // for count-up
  pausedRemainingMs: number | null;
  activeCueId: string | null;
};

type Message = {
  text: string;
  style: 'normal' | 'flash';
  visible: boolean;
  autoClearMs?: number | null;
};

type Settings = {
  bg: string; digitColor: string;
  warningPct: number;              // e.g. 0.2
  overtime: boolean;
  showTitle: boolean; showClock: boolean;
  showProgress: boolean; showMessage: boolean;
};

type Snapshot = {           // what main broadcasts every tick
  timer: TimerState;
  remainingMs: number;      // precomputed for the display
  program: Program;
  activeTitle: string;
  message: Message | null;
  blackout: boolean;
  settings: Settings;
};
```

## 3C. IPC contract
| Direction | Channel | Payload | Effect |
|---|---|---|---|
| renderer→main | `timer:start` | – | start/resume; `endTimestamp = now + remaining` |
| renderer→main | `timer:pause` | – | store `pausedRemainingMs`, clear `endTimestamp` |
| renderer→main | `timer:reset` | – | reset to active cue duration |
| renderer→main | `timer:nudge` | `{ ms }` | ±60000 etc. |
| renderer→main | `cue:load` | `{ id }` | set active cue, load its duration (stopped) |
| renderer→main | `cue:next` | – | load next cue in program |
| renderer→main | `program:update` | `Program` | replace program (add/edit/reorder cues) |
| renderer→main | `message:set` | `Message` | show persistent message |
| renderer→main | `message:flash` | `{ text, autoClearMs }` | pulse a flash message |
| renderer→main | `message:clear` | – | hide message |
| renderer→main | `display:blackout` | `{ on }` | toggle black output |
| renderer→main | `display:setMonitor` | `{ displayId }` | move+fullscreen output window |
| renderer→main | `settings:update` | `Partial<Settings>` | merge settings |
| main→renderer | `state:update` | `Snapshot` | both windows re-render |

## 3D. Multi-monitor handling (main process)
```ts
import { screen } from 'electron';

function pickExternalDisplay() {
  const all = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return all.find(d => d.id !== primary.id) ?? primary; // fallback: same screen
}

function placeDisplayWindow(win, display) {
  const { x, y, width, height } = display.bounds;
  win.setBounds({ x, y, width, height });
  win.setFullScreen(true);
}
// react to HDMI plug/unplug:
screen.on('display-added',   () => placeDisplayWindow(displayWin, pickExternalDisplay()));
screen.on('display-removed', () => placeDisplayWindow(displayWin, pickExternalDisplay()));
```
If only one monitor is present, show the output in a normal window so you can still preview/test.

## 3E. Timer accuracy — **avoid drift** (critical)
Never accumulate `setInterval` ticks. Always derive remaining time from a timestamp:
```ts
// while running:
const remainingMs = Math.max(-Infinity, endTimestamp - Date.now()); // may go negative (overtime)
```
Main ticks every 200ms only to *recompute and broadcast* — the source of truth is `endTimestamp`. On pause: `pausedRemainingMs = endTimestamp - Date.now()`. On resume: `endTimestamp = Date.now() + pausedRemainingMs`. Display shows `mm:ss` (add a leading `−` past zero).

## 3F. File structure
```
cue/
├─ electron.vite.config.ts
├─ electron-builder.yml          # win → nsis
├─ package.json
└─ src/
   ├─ main/
   │  ├─ index.ts                # windows, monitors, timer authority, IPC
   │  ├─ timer.ts                # start/pause/reset/nudge + tick loop
   │  └─ store.ts                # load/save program+settings JSON (userData)
   ├─ preload/
   │  └─ index.ts                # contextBridge: window.api.{send,on}
   └─ renderer/
      ├─ index.html
      └─ src/
         ├─ main.tsx             # reads hash → Control | Display
         ├─ App.tsx
         ├─ control/…            # Rundown, Transport, Messages, Settings
         ├─ display/…            # Timer, Title, Clock, Progress, Message
         └─ lib/format.ts        # msToClock(), scheduledStarts()
```

## 3G. Setup / run / package
```bash
# scaffold (choose React + TypeScript)
npm create @quick-start/electron@latest cue
cd cue && npm install
npm install zustand
npm install -D tailwindcss @tailwindcss/vite   # wire per Tailwind + Vite docs

npm run dev        # ← test TODAY: drag Display window onto the projector
npm run build:win  # later: produces an NSIS .exe installer
```
> Unsigned installers trigger Windows SmartScreen ("More info → Run anyway"). Fine for personal/church use; code-sign later if you distribute.

## 3H. Lightweight notes + Tauri migration path
- Keep deps to: React, Zustand, Tailwind. Skip UI kits, animation libs, moment/date libs (native `Date` is enough).
- Later ultra-light build: the entire `renderer/` React app ports to **Tauri v2** unchanged. You'd re-implement §3A–3E in Rust/Tauri commands + `WebviewWindow` + Tauri events, and swap electron-builder for the Tauri bundler. Same UI, ~5–10 MB installer, ~30 MB RAM.

---

# PART 4 — 2-HOUR BUILD PLAN (phased, cut from the bottom if short)

| Phase | Time | Goal | Cut if short? |
|---|---|---|---|
| 0 | 0:00–0:15 | Scaffold electron-vite + Tailwind. Two windows open (Control `#control`, Display `#display`). | No |
| 1 | 0:15–0:35 | Detect monitors; place Display fullscreen on external screen; monitor dropdown + fullscreen toggle. | No |
| 2 | 0:35–1:00 | Countdown in main (drift-free) + Start/Pause/Reset/±1m; giant `mm:ss` on Display. | No |
| 3 | 1:00–1:25 | Rundown list (add/edit/reorder, title + duration); Load / Next; active title on Display; warning + overtime colours. | No |
| 4 | 1:25–1:45 | Flash message + persistent message + Blackout; 3 quick-message presets. | Presets only |
| 5 | 1:45–2:00 | Keyboard shortcuts (Space/R/N/F/B) + progress bar + save/load program JSON. | Yes — nice-to-have |

**Ship criterion for the demo:** Phases 0–4 running under `npm run dev`, output on the projector. Installer + settings panel + auto-start-times are post-demo.

---

# APPENDIX — OpenCode kickoff prompt (paste this first)

> Build a Windows desktop **stage timer** app called **Cue** with **Electron + Vite + React + TypeScript + Tailwind + Zustand**. Architecture: a **single renderer bundle** that renders `<Control/>` when `location.hash === '#control'` and `<Display/>` when `#display`; the **main process is the authoritative timer** and broadcasts a full state `Snapshot` to both windows via `webContents.send('state:update', ...)` every 200ms while running. Renderers send commands via a `contextBridge` preload API.
>
> **Start with Phases 0–2 only, then stop for me to test:**
> Phase 0 — scaffold the electron-vite React+TS project, add Tailwind, and open two `BrowserWindow`s loading the same URL with `#control` and `#display`.
> Phase 1 — in main, use `screen.getAllDisplays()` to place the Display window fullscreen on the external monitor (fallback to a normal window if only one display); handle `display-added`/`display-removed`; add a monitor dropdown + fullscreen toggle in Control.
> Phase 2 — implement a **drift-free** countdown in main using `endTimestamp - Date.now()` (never accumulate intervals); commands `timer:start | timer:pause | timer:reset | timer:nudge`; render a giant `mm:ss` on Display with `font-variant-numeric: tabular-nums` and `clamp()` sizing on a black background, plus Start/Pause/Reset/+1m/−1m buttons in Control.
>
> Use these TypeScript types and this IPC channel list: **[paste §3B Data models and §3C IPC contract here]**. Keep it lightweight — no UI kits, no date libraries. After Phases 0–2 build cleanly and `npm run dev` runs, stop and tell me how to test, then wait before doing Phases 3–5.

*(Feed §3B + §3C verbatim where indicated. Then drive Phases 3–5 one message at a time so the model doesn't over-reach.)*
