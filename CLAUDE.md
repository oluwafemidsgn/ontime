# CLAUDE.md

Guidance for working in this repository.

## What this is

**ontime** — a desktop **stage timer** for live events (church services, conferences). An operator
runs a program from a laptop (**Control** window) and projects a clean timer + titles + messages to a
second screen over HDMI (**Output/Display** window). Built with **Electron + Vite + React +
TypeScript**. Primary target platform is **Windows (x64)**; development happens on macOS.

## Repository layout

The git root is this folder; **the actual app lives in the [`ontime/`](ontime) subfolder** — run all
`npm` commands from there.

```
.
├── README.md                      # user-facing: download, install, usage
├── CLAUDE.md                      # this file
├── docs/screenshot.png            # README screenshot
├── cue-stage-timer-build-doc.md   # original product/design spec (reference)
├── .github/workflows/build-windows.yml   # CI: builds the Windows installer on tags
└── ontime/                        # ← the Electron app
    ├── electron-vite.config.ts    # build config (main / preload / renderer)
    ├── electron-builder.json      # packaging config (NSIS installer, icon)
    ├── resources/icon.ico|png     # app + installer icon (brand countdown ring)
    ├── tsconfig.json              # renderer typecheck config
    ├── tsconfig.node.json         # main + preload typecheck config
    └── src/
        ├── main/
        │   ├── index.ts           # windows, monitors, timer engine, IPC, persistence
        │   └── types.ts           # shared types + DEFAULT_* constants (source of truth)
        ├── preload/index.ts       # contextBridge: window.api + window.displays
        └── renderer/
            ├── index.html
            └── src/
                ├── main.tsx       # React entry
                ├── App.tsx        # reads location.hash: #/display -> Display, else Control
                ├── global.d.ts    # types for window.api / window.displays
                ├── control/Control.tsx   # operator UI (rundown, transport, messages, settings)
                ├── display/Display.tsx   # projection output (phase-aware)
                ├── lib/format.ts  # formatDuration, formatClock, scheduledStarts
                ├── lib/theme.ts   # readableOn (contrast), message font stacks
                └── index.css      # ALL styling (custom CSS + design tokens; no Tailwind)
```

## Commands (run inside `ontime/`)

```bash
npm install
npm run dev          # run locally with hot reload (opens the Control window)
npm run typecheck    # tsc --noEmit for both node + web configs (build runs this first)
npm run build        # typecheck + electron-vite build -> out/
npm run build:win    # build + electron-builder NSIS installer -> dist/  (add -- --x64 on Apple Silicon)
```

`electron-vite` does NOT typecheck; `npm run typecheck` is the gate and is wired into `build`.

## Architecture

- **Main process is the single source of truth** for the timer and all state. It holds one
  `Snapshot`, mutates it in response to IPC commands, ticks every 100ms while active, and broadcasts
  the full snapshot to both windows via `webContents.send('snapshot', ...)`. Renderers are dumb: they
  render the snapshot and send commands. This guarantees the two windows never drift.
- **One renderer bundle, two windows.** `App.tsx` checks `location.hash`; `#/display` renders
  `<Display/>`, everything else renders `<Control/>`. Main loads the same URL into both windows.
- **IPC** is exposed through the preload as `window.api` (commands + `onSnapshot`) and
  `window.displays` (monitor list). Keep `preload/index.ts` and `renderer/src/global.d.ts` in sync.
- **Drift-free timer:** never accumulate intervals. Countdown derives `remaining = endTimestamp - now`
  (may go negative for overtime); count-up derives `elapsed = now - startTimestamp`. The 100ms tick
  only recomputes + rebroadcasts.
- **Persistence:** program + settings are debounced-saved to `userData/ontime-store.json` and restored
  on launch (`loadStore`/`persist` in `main/index.ts`).

### Visual phases (computed in main `decorate()`, consumed by both Display and Control preview)

`Snapshot.phase`: `'normal' | 'warning' | 'timeup' | 'transition'`.
- **warning** — remaining ≤ `warningPct` of the cue: whole output background becomes `settings.warnBg`.
- **timeup** — remaining ≤ 0: flashing `settings.overBg`, big "TIME UP"; `overMs` counts how far over.
- **transition** — only during auto-advance: an "Up next · starting in Ns" countdown
  (`settings.transitionSec`) that then starts the next cue. Driven by the `endSequence` state machine.
- Auto-advance (`cue.autoAdvance`, the ↻ toggle) triggers **timeup hold (`timeUpSec`) → transition →
  next cue**. Manual cues just hold on TIME UP until the operator acts.
- Text/progress colors on colored backgrounds use `readableOn()` for contrast — don't hardcode
  light colors on `.stage-title` / `.pv-title` etc.

## Conventions

- **Styling is hand-written CSS** in `renderer/src/index.css` with CSS-variable design tokens
  (`--bg`, `--panel`, `--accent` teal, `--go`/`--warn`/`--over` semantics). There is **no Tailwind**
  (it was removed as unused). Fonts: **Archivo** (UI) + **JetBrains Mono** (numbers, `.tnum`), loaded
  via Google Fonts with system fallbacks so the projected output degrades gracefully offline.
- The **Display must stay projection-safe**: true-black default, huge tabular digits, hidden cursor,
  no scrollbars, nothing interactive.
- **Keyboard shortcuts are window-scoped** (`window.addEventListener('keydown')` in Control), and skip
  input/select/textarea targets. **Never use Electron `globalShortcut`** — it hijacks keys system-wide
  and broke other apps on Windows previously.
- Types live in `main/types.ts` and are imported by the renderer via relative paths. When adding a
  `Settings`/`Snapshot` field, update `DEFAULT_SETTINGS`, the `App.tsx` `INITIAL_SNAPSHOT`, and the
  Settings drawer.

## Packaging & releases

- **Windows installer** is NSIS via electron-builder (`electron-builder.json`), icon at
  `ontime/resources/icon.ico`. Output lands in `ontime/dist/`.
- On Apple Silicon, `electron-builder --win nsis` defaults to **arm64** — pass `--x64` for normal
  Windows laptops. The Windows CI runner already builds x64.
- The installer is **unsigned**, so Windows SmartScreen shows "Run anyway" — expected.
- **CI** (`.github/workflows/build-windows.yml`) builds on `windows-latest`. Pushing a **`v*` tag**
  builds the installer and publishes it to a GitHub Release; `workflow_dispatch` builds an artifact.
  To cut a release: bump `version` in `ontime/package.json`, commit, then
  `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Gotchas

- The renderer requires `window.api` from the preload — it can't run in a plain browser (it'll throw).
- `dist/`, `out/`, `build/`, `node_modules/`, `release/` are gitignored. Keep the icon under
  `resources/` (committed), not `build/` (ignored).
- `npm ci` will fail if `package-lock.json` drifts from `package.json`; use `npm install` (CI does).
