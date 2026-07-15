import { app, BrowserWindow, ipcMain, screen, globalShortcut } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { 
  TimerState, 
  Program, 
  Cue, 
  Snapshot, 
  Settings, 
  Message,
  DEFAULT_SETTINGS,
  DEFAULT_PROGRAM,
  DEFAULT_TIMER_STATE,
  DEFAULT_MESSAGE
} from './types';

let mainWindow: BrowserWindow | null = null;
let stageWindow: BrowserWindow | null = null;
let displayWindow: BrowserWindow | null = null;

let snapshot: Snapshot = {
  timer: { ...DEFAULT_TIMER_STATE },
  remainingMs: DEFAULT_PROGRAM.cues[0]?.durationMs ?? 300000,
  program: { ...DEFAULT_PROGRAM },
  activeTitle: '',
  message: DEFAULT_MESSAGE,
  blackout: false,
  settings: { ...DEFAULT_SETTINGS },
};

let timerInterval: NodeJS.Timeout | null = null;
let tickInterval: NodeJS.Timeout | null = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: 'ontime - Control',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createStageWindow() {
  const displays = screen.getAllDisplays();
  const external = displays.find(d => d.id !== displays[0]?.id) || displays[1] || displays[0];
  
  stageWindow = new BrowserWindow({
    x: external.bounds.x,
    y: external.bounds.y,
    width: external.bounds.width,
    height: external.bounds.height,
    fullscreen: true,
    fullscreenable: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'ontime - Stage Display',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    stageWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/stage`);
  } else {
    stageWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/stage' });
  }

  stageWindow.on('closed', () => {
    stageWindow = null;
  });
}

function createDisplayWindow() {
  const displays = screen.getAllDisplays();
  const external = displays.find(d => d.id !== displays[0]?.id) || displays[1] || displays[0];
  
  displayWindow = new BrowserWindow({
    x: external.bounds.x,
    y: external.bounds.y,
    width: external.bounds.width,
    height: external.bounds.height,
    fullscreen: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'ontime - Stage Display',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    displayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/display`);
  } else {
    displayWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/display' });
  }

  displayWindow.on('closed', () => {
    displayWindow = null;
  });
}

function broadcastSnapshot() {
  const data = { ...snapshot };
  mainWindow?.webContents.send('snapshot', data);
  stageWindow?.webContents.send('snapshot', data);
  displayWindow?.webContents.send('snapshot', data);
}

function computeRemainingMs(): number {
  const { timer, program } = snapshot;
  
  if (timer.mode === 'clock') return 0;
  
  if (!timer.running) {
    if (timer.pausedRemainingMs !== null) return timer.pausedRemainingMs;
    if (timer.activeCueId) {
      const cue = program.cues.find(c => c.id === timer.activeCueId);
      return cue?.durationMs ?? 0;
    }
    return program.cues[0]?.durationMs ?? 0;
  }

  const now = Date.now();
  if (timer.endTimestamp) {
    return Math.max(0, timer.endTimestamp - now);
  }
  return timer.pausedRemainingMs ?? 0;
}

function tick() {
  snapshot.remainingMs = computeRemainingMs();
  broadcastSnapshot();
  
  const { timer, remainingMs, program, settings } = snapshot;
  if (timer.running && timer.mode === 'countdown') {
    const activeCue = timer.activeCueId ? program.cues.find(c => c.id === timer.activeCueId) : null;
    const total = activeCue?.durationMs ?? 0;
    const pct = total > 0 ? remainingMs / total : 0;
    
    // Show "Time's up" flash 1 minute before auto-advance
    if (activeCue?.autoAdvance && remainingMs > 0 && remainingMs <= 60000 && remainingMs > 59000) {
      if (!snapshot.message?.visible || snapshot.message.text !== "Time's up") {
        setMessage({ text: "Time's up", style: 'flash', visible: true, autoClearMs: 5000 });
      }
    }
    
    if (pct <= settings.warningPct && pct > 0 && remainingMs > 0) {
      if (!snapshot.message?.visible || snapshot.message.style !== 'flash') {
        setMessage({ text: 'WARNING', style: 'flash', visible: true });
      }
    }
    
    if (remainingMs <= 0) {
      if (settings.overtime && timer.mode === 'countdown') {
        snapshot.timer.mode = 'countup';
        snapshot.timer.startTimestamp = Date.now();
        snapshot.timer.endTimestamp = null;
      } else if (activeCue?.autoAdvance) {
        // Auto-advance to next cue and start it
        advanceCueAndStart();
      } else {
        pauseTimer();
        advanceCue();
      }
    }
  }
}

function advanceCueAndStart() {
  const { program, timer } = snapshot;
  const idx = timer.activeCueId ? program.cues.findIndex(c => c.id === timer.activeCueId) : -1;
  const nextIdx = idx + 1;
  
  if (nextIdx < program.cues.length) {
    const nextCue = program.cues[nextIdx];
    snapshot.timer.activeCueId = nextCue.id;
    snapshot.activeTitle = nextCue.title;
    snapshot.timer.running = false;
    snapshot.timer.endTimestamp = null;
    snapshot.timer.pausedRemainingMs = null;
    snapshot.remainingMs = nextCue.durationMs;
    
    // Start the next cue automatically
    startTimer();
  } else {
    snapshot.timer.running = false;
    snapshot.timer.activeCueId = null;
    snapshot.activeTitle = '';
    snapshot.remainingMs = 0;
    broadcastSnapshot();
  }
}

function startTimer() {
  const { timer, program, remainingMs } = snapshot;
  
  if (timer.running) return;
  
  if (timer.mode === 'countdown' || timer.mode === 'countup') {
    const activeCue = timer.activeCueId ? program.cues.find(c => c.id === timer.activeCueId) : program.cues[0];
    if (!activeCue) return;
    
    snapshot.timer.activeCueId = activeCue.id;
    snapshot.activeTitle = activeCue.title;
    
    if (timer.mode === 'countdown') {
      const startMs = timer.pausedRemainingMs ?? remainingMs ?? activeCue.durationMs;
      snapshot.timer.endTimestamp = Date.now() + startMs;
      snapshot.timer.pausedRemainingMs = null;
    } else if (timer.mode === 'countup') {
      if (!timer.startTimestamp) {
        snapshot.timer.startTimestamp = Date.now();
      }
    }
    
    snapshot.timer.running = true;
  } else if (timer.mode === 'clock') {
    snapshot.timer.running = true;
  }
  
  startTicker();
  broadcastSnapshot();
}

function pauseTimer() {
  if (!snapshot.timer.running) return;
  
  if (snapshot.timer.mode === 'countdown' && snapshot.timer.endTimestamp) {
    snapshot.timer.pausedRemainingMs = Math.max(0, snapshot.timer.endTimestamp - Date.now());
  }
  
  snapshot.timer.running = false;
  stopTicker();
  broadcastSnapshot();
}

function resetTimer() {
  stopTicker();
  snapshot.timer = { ...DEFAULT_TIMER_STATE };
  snapshot.remainingMs = snapshot.program.cues[0]?.durationMs ?? 300000;
  snapshot.activeTitle = '';
  broadcastSnapshot();
}

function advanceCue() {
  const { program, timer } = snapshot;
  const idx = timer.activeCueId ? program.cues.findIndex(c => c.id === timer.activeCueId) : -1;
  const nextIdx = idx + 1;
  
  if (nextIdx < program.cues.length) {
    const nextCue = program.cues[nextIdx];
    snapshot.timer.activeCueId = nextCue.id;
    snapshot.activeTitle = nextCue.title;
    snapshot.timer.running = false;
    snapshot.timer.endTimestamp = null;
    snapshot.timer.pausedRemainingMs = null;
    snapshot.remainingMs = nextCue.durationMs;
  } else {
    snapshot.timer.running = false;
    snapshot.timer.activeCueId = null;
    snapshot.activeTitle = '';
    snapshot.remainingMs = 0;
  }
  
  broadcastSnapshot();
}

function previousCue() {
  const { program, timer } = snapshot;
  const idx = timer.activeCueId ? program.cues.findIndex(c => c.id === timer.activeCueId) : 0;
  const prevIdx = Math.max(0, idx - 1);
  
  const prevCue = program.cues[prevIdx];
  snapshot.timer.activeCueId = prevCue.id;
  snapshot.activeTitle = prevCue.title;
  snapshot.timer.running = false;
  snapshot.timer.endTimestamp = null;
  snapshot.timer.pausedRemainingMs = null;
  snapshot.remainingMs = prevCue.durationMs;
  
  broadcastSnapshot();
}

function setMessage(msg: Message | null) {
  snapshot.message = msg
  broadcastSnapshot()
  
  // Auto-clear if specified
  if (msg?.autoClearMs && msg.autoClearMs > 0) {
    setTimeout(() => {
      if (snapshot.message === msg) {
        snapshot.message = { ...msg, visible: false }
        broadcastSnapshot()
      }
    }, msg.autoClearMs)
  }
}

function setBlackout(enabled: boolean) {
  snapshot.blackout = enabled;
  broadcastSnapshot();
}

function updateSettings(partial: Partial<Settings>) {
  snapshot.settings = { ...snapshot.settings, ...partial };
  broadcastSnapshot();
}

function updateProgram(program: Program) {
  snapshot.program = program;
  if (!snapshot.timer.activeCueId && program.cues.length > 0) {
    snapshot.activeTitle = program.cues[0].title;
    snapshot.remainingMs = program.cues[0].durationMs;
  }
  broadcastSnapshot();
}

function setTimerMode(mode: TimerState['mode']) {
  const wasRunning = snapshot.timer.running;
  if (wasRunning) pauseTimer();
  
  snapshot.timer.mode = mode;
  snapshot.timer.startTimestamp = null;
  snapshot.timer.endTimestamp = null;
  snapshot.timer.pausedRemainingMs = null;
  
  if (mode === 'countdown' && snapshot.program.cues.length > 0) {
    snapshot.remainingMs = snapshot.program.cues[0].durationMs;
  } else if (mode === 'countup') {
    snapshot.remainingMs = 0;
  }
  
  broadcastSnapshot();
}

function startTicker() {
  if (tickInterval) return;
  tickInterval = setInterval(tick, 100);
}

function stopTicker() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

function registerShortcuts() {
  globalShortcut.register('Space', () => {
    if (snapshot.timer.running) pauseTimer();
    else startTimer();
    broadcastSnapshot();
  });
  
  globalShortcut.register('Right', () => advanceCue());
  globalShortcut.register('Left', () => previousCue());
  globalShortcut.register('R', () => resetTimer());
  globalShortcut.register('B', () => setBlackout(!snapshot.blackout));
  globalShortcut.register('M', () => setMessage(snapshot.message?.visible ? null : { text: 'MESSAGE', style: 'normal', visible: true }));
}

function setupIpc() {
  ipcMain.handle('get-snapshot', () => snapshot);
  
  ipcMain.on('start-timer', () => startTimer());
  ipcMain.on('pause-timer', () => pauseTimer());
  ipcMain.on('reset-timer', () => resetTimer());
  ipcMain.on('advance-cue', () => advanceCue());
  ipcMain.on('previous-cue', () => previousCue());
  ipcMain.on('nudge-timer', (_e, ms: number) => {
    if (snapshot.timer.mode === 'countdown' && snapshot.timer.running && snapshot.timer.endTimestamp) {
      snapshot.timer.endTimestamp += ms;
      broadcastSnapshot();
    }
  });
  ipcMain.on('set-message', (_e, msg: Message | null) => setMessage(msg));
  ipcMain.on('set-blackout', (_e, enabled: boolean) => setBlackout(enabled));
  ipcMain.on('update-settings', (_e, partial: Partial<Settings>) => updateSettings(partial));
  ipcMain.on('update-program', (_e, program: Program) => updateProgram(program));
  ipcMain.on('set-timer-mode', (_e, mode: TimerState['mode']) => setTimerMode(mode));
  
  ipcMain.on('open-stage', () => {
    if (!stageWindow) createStageWindow();
    else stageWindow.show();
  });
  
  ipcMain.on('open-display', () => {
    if (!displayWindow) createDisplayWindow();
    else displayWindow.show();
  });
ipcMain.on('close-stage', () => stageWindow?.close());
  
  ipcMain.on('close-display', () => displayWindow?.close());
  
  ipcMain.on('display:set-monitor', (_e, displayId: number) => {
    const displays = screen.getAllDisplays();
    const target = displays.find(d => d.id === displayId) || displays[0];
    if (target && displayWindow) {
      const { x, y, width, height } = target.bounds;
      displayWindow.setBounds({ x, y, width, height });
      displayWindow.setFullScreen(true);
    }
  });

  ipcMain.handle('displays:get-all', () => {
    return screen.getAllDisplays().map(d => ({
      id: d.id,
      bounds: d.bounds,
      size: d.size,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
      internal: d.internal,
      rotation: d.rotation,
    }))
  })
}

app.whenReady().then(() => {
  createMainWindow();
  registerShortcuts();
  setupIpc();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  stopTicker();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  stopTicker();
});