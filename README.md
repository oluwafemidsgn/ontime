<div align="center">

<img src="ontime/resources/icon.png" width="120" alt="ontime icon" />

# ontime

**A lightweight stage timer for live events.**

Run your program from a laptop and project a clean, high-contrast timer, titles and
messages to a second screen over HDMI — like an operator/output console, but for time.

[**⬇ Download the latest Windows installer**](https://github.com/oluwafemidsgn/ontime/releases/latest)

</div>

---

## What it is

ontime has two surfaces working from one clock:

- **Control** — the operator window on your laptop. Build a rundown, run the timer, fire messages.
- **Output** — a clean full-screen display for the projector/second monitor. The audience and
  speaker only ever see a calm, readable timer.

Everything the operator does (load a segment, send a message, blackout) shows on the output instantly.

---

## Install (Windows)

1. Download **`ontime Setup.exe`** from the [latest release](https://github.com/oluwafemidsgn/ontime/releases/latest).
2. Double-click it. The install wizard opens — pick a folder and finish.
3. Launch **ontime** from the Desktop or Start menu.

> **Heads up — SmartScreen:** the app isn't code-signed yet, so Windows may show
> *"Windows protected your PC."* Click **More info → Run anyway**. It's safe; it just
> doesn't carry a paid signing certificate.

The installer is for **64-bit Windows** (virtually all Windows laptops).

---

## Quick start

1. Open ontime. You'll see the **Control** window with a sample rundown.
2. Plug in the projector/second monitor and click **Open output** (top right).
   With one screen it opens a small preview window; with a second screen it goes full-screen there.
3. Build your **Rundown** on the left — add segments with a title and a duration.
   Set a program start time and each segment shows its scheduled clock time.
4. Click a segment to load it, then press **Start**. The big timer counts down on the output.
5. Send **Messages** from the right panel, or hit **Blackout** to clear the screen.

### The end-of-segment flow
- **Last stretch** → the whole output turns your warning color (default amber).
- **Time up** → it flashes red with a big **TIME UP**.
- If a segment has **auto-advance** (the ↻ icon) on, TIME UP holds, then an
  **"Up next · starting in 0:30"** countdown plays, then the next segment starts automatically.

All colors and timings are adjustable in **⚙ Settings**.

---

## Keyboard shortcuts

These only work while the Control window is focused — they never interfere with other apps.

| Key | Action |
|-----|--------|
| `Space` | Start / pause |
| `R` | Reset |
| `N` / `P` | Next / previous segment |
| `↑` / `↓` | Add / remove 1 minute |
| `B` | Blackout |
| `Esc` | Clear message |

---

## Features

- Dual window: **Control** (operator) + **Output** (projection), driven by one drift-free clock.
- Countdown, **count-up**, and **clock** modes.
- Program **rundown** with titles, durations, reordering, and auto-computed start times.
- Visual states: normal → **warning** (full-screen color) → **time up** (flashing) → overtime.
- **Auto-advance** with a TIME UP hold and an "up next" countdown between segments.
- Quick + custom **messages** with adjustable font, size and color.
- **Blackout** to instantly clear the output (so you can project other things and reopen later).
- Configurable output: background, digit color, warning threshold, and show/hide title / clock /
  progress / messages.
- **Save / load** your program to a file, and it auto-remembers your last program and settings.
- Multi-monitor picker + full-screen toggle.

---

## For developers

Built with **Electron + Vite + React + TypeScript**. The app lives in the [`ontime/`](ontime) folder.

```bash
cd ontime
npm install
npm run dev          # run the app locally with hot reload
npm run typecheck    # type-check main + renderer
npm run build        # production build (out/)
npm run build:win    # build the Windows NSIS installer into dist/
```

The main process is the single source of truth for the timer and broadcasts a full state
snapshot to both windows; the renderers just send commands and render.

### Cutting a release

Push a version tag and GitHub Actions builds the Windows installer and attaches it to a Release:

```bash
# bump "version" in ontime/package.json first, then:
git tag v1.0.2
git push origin v1.0.2
```

You can also trigger the build manually from the repo's **Actions → Build Windows Installer** tab.
