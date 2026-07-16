import { app, BrowserWindow, ipcMain, screen, Display } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import {
  Program,
  Snapshot,
  Settings,
  Message,
  TimerMode,
  DEFAULT_SETTINGS,
  DEFAULT_PROGRAM,
  DEFAULT_TIMER_STATE,
} from './types'

let controlWindow: BrowserWindow | null = null
let displayWindow: BrowserWindow | null = null
let tickInterval: NodeJS.Timeout | null = null
let messageClearTimer: NodeJS.Timeout | null = null
let saveTimer: NodeJS.Timeout | null = null

// ---------------------------------------------------------------------------
// Persistence (program + settings survive restarts)
// ---------------------------------------------------------------------------

function storePath(): string {
  return join(app.getPath('userData'), 'ontime-store.json')
}

function loadStore(): { program?: Program; settings?: Settings } {
  try {
    return JSON.parse(readFileSync(storePath(), 'utf-8'))
  } catch {
    return {}
  }
}

function persist(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      writeFileSync(
        storePath(),
        JSON.stringify({ program: snapshot.program, settings: snapshot.settings })
      )
    } catch {
      /* non-fatal */
    }
  }, 400)
}

const persisted = loadStore()

let snapshot: Snapshot = {
  timer: { ...DEFAULT_TIMER_STATE },
  remainingMs: (persisted.program ?? DEFAULT_PROGRAM).cues[0]?.durationMs ?? 300000,
  program: persisted.program ?? { ...DEFAULT_PROGRAM },
  activeTitle: '',
  message: null,
  blackout: false,
  settings: { ...DEFAULT_SETTINGS, ...(persisted.settings ?? {}) },
  phase: 'normal',
  overMs: 0,
  upNext: null,
}

// End-of-segment sequence: TIME UP hold -> "up next" transition -> auto-advance.
type EndSequence = { phase: 'timeup' | 'transition'; startedAt: number; nextCueId: string | null }
let endSequence: EndSequence | null = null

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function pickExternalDisplay(): Display {
  const all = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  return all.find((d) => d.id !== primary.id) ?? primary
}

function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${hash ? `#${hash}` : ''}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

function createControlWindow(): void {
  controlWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#0a0a0b',
    title: 'ontime — Control',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  loadRenderer(controlWindow)
  controlWindow.on('closed', () => {
    controlWindow = null
  })
}

function createDisplayWindow(): void {
  const external = pickExternalDisplay()
  const isExternal = external.id !== screen.getPrimaryDisplay().id

  displayWindow = new BrowserWindow({
    x: external.bounds.x,
    y: external.bounds.y,
    width: isExternal ? external.bounds.width : 960,
    height: isExternal ? external.bounds.height : 540,
    fullscreen: isExternal,
    frame: !isExternal,
    backgroundColor: '#000000',
    alwaysOnTop: isExternal,
    skipTaskbar: isExternal,
    title: 'ontime — Display',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  loadRenderer(displayWindow, '/display')
  displayWindow.webContents.on('did-finish-load', () => broadcastSnapshot())
  displayWindow.on('closed', () => {
    displayWindow = null
    notifyDisplayState()
  })
  notifyDisplayState()
}

function placeDisplayOnMonitor(target: Display): void {
  if (!displayWindow) return
  const isExternal = target.id !== screen.getPrimaryDisplay().id
  displayWindow.setFullScreen(false)
  displayWindow.setBounds(
    isExternal
      ? target.bounds
      : { x: target.bounds.x + 60, y: target.bounds.y + 60, width: 960, height: 540 }
  )
  displayWindow.setAlwaysOnTop(isExternal)
  if (isExternal) displayWindow.setFullScreen(true)
}

// ---------------------------------------------------------------------------
// Broadcasting
// ---------------------------------------------------------------------------

/** Compute the visual phase + overtime/up-next info the renderers read. */
function decorate(): void {
  const { timer, remainingMs, settings, program } = snapshot
  let phase: Snapshot['phase'] = 'normal'
  let overMs = 0
  let upNext: Snapshot['upNext'] = null

  if (endSequence) {
    if (endSequence.phase === 'timeup') {
      phase = 'timeup'
    } else {
      phase = 'transition'
      const remain = Math.max(0, settings.transitionSec * 1000 - (Date.now() - endSequence.startedAt))
      const nextCue = program.cues.find((c) => c.id === endSequence!.nextCueId)
      upNext = { title: nextCue?.title ?? 'End of program', countdownMs: remain }
    }
  } else if (timer.mode === 'countdown') {
    if (remainingMs <= 0) {
      phase = 'timeup'
      overMs = Math.max(0, -remainingMs)
    } else {
      const dur = activeCue()?.durationMs ?? 0
      if (dur > 0 && remainingMs / dur <= settings.warningPct) phase = 'warning'
    }
  }

  snapshot.phase = phase
  snapshot.overMs = overMs
  snapshot.upNext = upNext
}

function broadcastSnapshot(): void {
  decorate()
  controlWindow?.webContents.send('snapshot', snapshot)
  displayWindow?.webContents.send('snapshot', snapshot)
}

function notifyDisplayState(): void {
  controlWindow?.webContents.send('display-state', !!displayWindow)
}

function serializeDisplays() {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    bounds: d.bounds,
    size: d.size,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    internal: d.internal,
    rotation: d.rotation,
  }))
}

// ---------------------------------------------------------------------------
// Timer engine — main process is the single source of truth (drift-free)
// ---------------------------------------------------------------------------

function activeCue() {
  return snapshot.timer.activeCueId
    ? snapshot.program.cues.find((c) => c.id === snapshot.timer.activeCueId)
    : undefined
}

function computeRemainingMs(): number {
  const { timer, program } = snapshot
  const now = Date.now()

  if (timer.mode === 'clock') return 0

  if (timer.mode === 'countup') {
    if (timer.running && timer.startTimestamp) return now - timer.startTimestamp
    return timer.pausedRemainingMs ?? 0
  }

  // countdown
  if (timer.running && timer.endTimestamp !== null) return timer.endTimestamp - now
  if (timer.pausedRemainingMs !== null) return timer.pausedRemainingMs
  return activeCue()?.durationMs ?? program.cues[0]?.durationMs ?? 0
}

function tick(): void {
  const now = Date.now()

  // Drive the end-of-segment sequence (TIME UP -> up-next transition -> start).
  if (endSequence) {
    const elapsed = now - endSequence.startedAt
    if (endSequence.phase === 'timeup') {
      if (elapsed >= snapshot.settings.timeUpSec * 1000) {
        endSequence = { phase: 'transition', startedAt: now, nextCueId: endSequence.nextCueId }
      }
    } else if (elapsed >= snapshot.settings.transitionSec * 1000) {
      const nextId = endSequence.nextCueId
      endSequence = null
      if (nextId) {
        loadCueById(nextId)
        startTimer()
      } else {
        snapshot.timer.activeCueId = null
        snapshot.activeTitle = ''
        snapshot.remainingMs = 0
        stopTicker()
        broadcastSnapshot()
      }
      return
    }
    snapshot.remainingMs = 0
    broadcastSnapshot()
    return
  }

  snapshot.remainingMs = computeRemainingMs()

  const { timer, remainingMs, settings, program } = snapshot
  if (timer.running && timer.mode === 'countdown' && remainingMs <= 0) {
    const cue = activeCue()
    if (cue?.autoAdvance) {
      const idx = program.cues.findIndex((c) => c.id === cue.id)
      const next = program.cues[idx + 1]
      timer.running = false
      timer.endTimestamp = null
      timer.pausedRemainingMs = null
      snapshot.remainingMs = 0
      endSequence = { phase: 'timeup', startedAt: now, nextCueId: next?.id ?? null }
    } else if (!settings.overtime) {
      stopAtZero()
    }
    // else: overtime enabled -> keep running, remainingMs goes negative
  }

  broadcastSnapshot()
}

function clearEndSequence(): void {
  endSequence = null
}

function startTicker(): void {
  if (!tickInterval) tickInterval = setInterval(tick, 100)
}

function stopTicker(): void {
  if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

function stopAtZero(): void {
  snapshot.timer.running = false
  snapshot.timer.endTimestamp = null
  snapshot.timer.pausedRemainingMs = 0
  snapshot.remainingMs = 0
  stopTicker()
}

function startTimer(): void {
  // Pressing Start during the end sequence skips the countdown to the next cue.
  if (endSequence) {
    const nextId = endSequence.nextCueId
    endSequence = null
    if (nextId) loadCueById(nextId)
  }
  const { timer, program } = snapshot
  if (timer.running) return

  if (timer.mode === 'clock') {
    timer.running = true
    startTicker()
    broadcastSnapshot()
    return
  }

  const cue = activeCue() ?? program.cues[0]
  if (!cue) return
  timer.activeCueId = cue.id
  snapshot.activeTitle = cue.title

  const now = Date.now()
  if (timer.mode === 'countdown') {
    const remaining = timer.pausedRemainingMs ?? cue.durationMs
    timer.endTimestamp = now + remaining
    timer.pausedRemainingMs = null
  } else {
    // countup — resume from paused elapsed if present
    const elapsed = timer.pausedRemainingMs ?? 0
    timer.startTimestamp = now - elapsed
    timer.pausedRemainingMs = null
  }

  timer.running = true
  startTicker()
  broadcastSnapshot()
}

function pauseTimer(): void {
  if (endSequence) {
    endSequence = null
    snapshot.remainingMs = 0
    stopTicker()
    broadcastSnapshot()
    return
  }
  const { timer } = snapshot
  if (!timer.running) return

  const now = Date.now()
  if (timer.mode === 'countdown' && timer.endTimestamp !== null) {
    timer.pausedRemainingMs = timer.endTimestamp - now
    timer.endTimestamp = null
  } else if (timer.mode === 'countup' && timer.startTimestamp !== null) {
    timer.pausedRemainingMs = now - timer.startTimestamp
    timer.startTimestamp = null
  }

  timer.running = false
  stopTicker()
  snapshot.remainingMs = computeRemainingMs()
  broadcastSnapshot()
}

function resetTimer(): void {
  clearEndSequence()
  stopTicker()
  const { timer, program } = snapshot
  timer.running = false
  timer.endTimestamp = null
  timer.startTimestamp = null
  timer.pausedRemainingMs = null
  snapshot.remainingMs =
    timer.mode === 'countup' ? 0 : activeCue()?.durationMs ?? program.cues[0]?.durationMs ?? 0
  broadcastSnapshot()
}

function loadCueById(id: string): void {
  const cue = snapshot.program.cues.find((c) => c.id === id)
  if (!cue) return
  clearEndSequence()
  stopTicker()
  const { timer } = snapshot
  timer.running = false
  timer.activeCueId = cue.id
  timer.endTimestamp = null
  timer.startTimestamp = null
  timer.pausedRemainingMs = null
  snapshot.activeTitle = cue.title
  snapshot.remainingMs = timer.mode === 'countup' ? 0 : cue.durationMs
  broadcastSnapshot()
}

function advanceCue(autoStart = false): void {
  clearEndSequence()
  const { program, timer } = snapshot
  const idx = timer.activeCueId
    ? program.cues.findIndex((c) => c.id === timer.activeCueId)
    : -1
  const next = program.cues[idx + 1]

  stopTicker()
  timer.running = false
  timer.endTimestamp = null
  timer.startTimestamp = null
  timer.pausedRemainingMs = null

  if (next) {
    timer.activeCueId = next.id
    snapshot.activeTitle = next.title
    snapshot.remainingMs = timer.mode === 'countup' ? 0 : next.durationMs
    if (autoStart) {
      startTimer()
      return
    }
  } else {
    timer.activeCueId = null
    snapshot.activeTitle = ''
    snapshot.remainingMs = 0
  }
  broadcastSnapshot()
}

function previousCue(): void {
  clearEndSequence()
  const { program, timer } = snapshot
  const idx = timer.activeCueId
    ? program.cues.findIndex((c) => c.id === timer.activeCueId)
    : 0
  const prev = program.cues[Math.max(0, idx - 1)]
  if (!prev) return
  stopTicker()
  timer.running = false
  timer.activeCueId = prev.id
  timer.endTimestamp = null
  timer.startTimestamp = null
  timer.pausedRemainingMs = null
  snapshot.activeTitle = prev.title
  snapshot.remainingMs = timer.mode === 'countup' ? 0 : prev.durationMs
  broadcastSnapshot()
}

function nudgeTimer(ms: number): void {
  const { timer } = snapshot
  if (timer.mode !== 'countdown') return

  if (timer.running && timer.endTimestamp !== null) {
    timer.endTimestamp += ms
  } else {
    const base = computeRemainingMs()
    timer.pausedRemainingMs = Math.max(0, base + ms)
  }
  snapshot.remainingMs = computeRemainingMs()
  broadcastSnapshot()
}

function setMessage(msg: Message | null): void {
  if (messageClearTimer) {
    clearTimeout(messageClearTimer)
    messageClearTimer = null
  }
  snapshot.message = msg
  broadcastSnapshot()

  if (msg?.visible && msg.autoClearMs && msg.autoClearMs > 0) {
    messageClearTimer = setTimeout(() => {
      if (snapshot.message === msg) {
        snapshot.message = { ...msg, visible: false }
        broadcastSnapshot()
      }
    }, msg.autoClearMs)
  }
}

function updateProgram(program: Program): void {
  snapshot.program = program
  const cue = activeCue()
  if (!cue) {
    // active cue was removed — fall back to nothing running
    snapshot.timer.activeCueId = null
    snapshot.activeTitle = ''
  }
  if (!snapshot.timer.running && !snapshot.timer.activeCueId) {
    snapshot.remainingMs =
      snapshot.timer.mode === 'countup' ? 0 : program.cues[0]?.durationMs ?? 0
  }
  persist()
  broadcastSnapshot()
}

function updateSettings(partial: Partial<Settings>): void {
  snapshot.settings = { ...snapshot.settings, ...partial }
  persist()
  broadcastSnapshot()
}

function setTimerMode(mode: TimerMode): void {
  clearEndSequence()
  if (snapshot.timer.running) pauseTimer()
  const { timer, program } = snapshot
  timer.mode = mode
  timer.startTimestamp = null
  timer.endTimestamp = null
  timer.pausedRemainingMs = null
  if (mode === 'countdown') {
    snapshot.remainingMs = activeCue()?.durationMs ?? program.cues[0]?.durationMs ?? 0
  } else {
    snapshot.remainingMs = 0
  }
  broadcastSnapshot()
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function setupIpc(): void {
  ipcMain.handle('get-snapshot', () => snapshot)
  ipcMain.handle('displays:get-all', () => serializeDisplays())

  ipcMain.on('start-timer', () => startTimer())
  ipcMain.on('pause-timer', () => pauseTimer())
  ipcMain.on('reset-timer', () => resetTimer())
  ipcMain.on('advance-cue', () => advanceCue())
  ipcMain.on('previous-cue', () => previousCue())
  ipcMain.on('load-cue', (_e, id: string) => loadCueById(id))
  ipcMain.on('nudge-timer', (_e, ms: number) => nudgeTimer(ms))
  ipcMain.on('set-message', (_e, msg: Message | null) => setMessage(msg))
  ipcMain.on('set-blackout', (_e, enabled: boolean) => {
    snapshot.blackout = enabled
    broadcastSnapshot()
  })
  ipcMain.on('update-settings', (_e, partial: Partial<Settings>) => updateSettings(partial))
  ipcMain.on('update-program', (_e, program: Program) => updateProgram(program))
  ipcMain.on('set-timer-mode', (_e, mode: TimerMode) => setTimerMode(mode))

  ipcMain.on('open-display', () => {
    if (!displayWindow) createDisplayWindow()
    else displayWindow.focus()
  })
  ipcMain.on('close-display', () => displayWindow?.close())
  ipcMain.on('toggle-fullscreen', () => {
    if (displayWindow) displayWindow.setFullScreen(!displayWindow.isFullScreen())
  })
  ipcMain.on('display:set-monitor', (_e, displayId: number) => {
    const target = screen.getAllDisplays().find((d) => d.id === displayId)
    if (target) placeDisplayOnMonitor(target)
  })
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  createControlWindow()
  setupIpc()

  const onDisplaysChanged = (): void => {
    if (displayWindow) placeDisplayOnMonitor(pickExternalDisplay())
    controlWindow?.webContents.send('displays-changed', serializeDisplays())
  }
  screen.on('display-added', onDisplaysChanged)
  screen.on('display-removed', onDisplaysChanged)
  screen.on('display-metrics-changed', onDisplaysChanged)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow()
  })
})

app.on('window-all-closed', () => {
  stopTicker()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => stopTicker())
